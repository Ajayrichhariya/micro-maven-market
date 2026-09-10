import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { CampaignChat } from "@/components/CampaignChat";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader, Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerificationBadge } from "@/components/VerificationBadge";
import { supabase } from "@/integrations/supabase/client";
import { formatCompact, formatINR } from "@/lib/constants";
import type { ApplicationWithCreator, Campaign } from "@/lib/db";
import {
  updateApplicationStatus,
  verifyPostMetrics,
} from "@/lib/marketplace.functions";
import { downloadReportCsv, openRoiReport } from "@/lib/roi-report";
import { callWithAuth } from "@/lib/server-call";
import { lockCampaignEscrow } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_authenticated/dashboard/brand/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign tracking — AdBridge" },
      {
        name: "description",
        content:
          "Review applicants, verify submitted reels and release creator payouts for this campaign.",
      },
      { property: "og:title", content: "Campaign tracking — AdBridge" },
      { property: "og:description", content: "Review applicants and release payouts." },
    ],
  }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const updateStatus = useServerFn(updateApplicationStatus);
  const verifyMetrics = useServerFn(verifyPostMetrics);
  const lockEscrow = useServerFn(lockCampaignEscrow);
  const [busy, setBusy] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [chatWith, setChatWith] = useState<string | null>(null);

  const campaign = useQuery({
    queryKey: ["campaign", id],
    queryFn: async (): Promise<Campaign | null> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const escrow = useQuery({
    queryKey: ["campaign-escrow", id],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("wallet_ledger")
        .select("amount")
        .eq("reference_id", id)
        .eq("transaction_type", "escrow_lock");
      if (error) throw error;
      return (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
    },
  });

  const applications = useQuery({
    queryKey: ["campaign-applications", id],
    queryFn: async (): Promise<ApplicationWithCreator[]> => {
      const { data, error } = await supabase
        .from("campaign_applications")
        .select("*, creator_profiles(*)")
        .eq("campaign_id", id)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApplicationWithCreator[];
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["campaign-applications", id] });
    await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    await queryClient.invalidateQueries({ queryKey: ["campaign-escrow", id] });
  };

  const act = async (applicationId: string, status: "approved" | "rejected" | "paid") => {
    setBusy(applicationId);
    try {
      await callWithAuth(updateStatus, { application_id: applicationId, status });
      toast.success(
        status === "paid"
          ? "Payment released"
          : status === "approved"
            ? "Creator approved"
            : "Application rejected",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const verify = async (applicationId: string, verified: boolean) => {
    setBusy(applicationId);
    try {
      await callWithAuth(verifyMetrics, { application_id: applicationId, verified });
      toast.success(verified ? "Performance verified" : "Verification removed");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify");
    } finally {
      setBusy(null);
    }
  };

  const fundEscrow = async () => {
    setFunding(true);
    try {
      const result = await callWithAuth(lockEscrow, { campaign_id: id });
      toast.success(`${formatINR(result.locked)} locked in escrow`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not fund escrow");
    } finally {
      setFunding(false);
    }
  };

  if (campaign.isPending) return <PageLoader label="Loading campaign" />;
  if (!campaign.data)
    return (
      <AppShell>
        <EmptyState
          icon={Users}
          title="Campaign not found"
          description="This campaign may have been removed, or you don't have access to it."
          action={
            <Button asChild>
              <Link to="/dashboard/brand">Back to dashboard</Link>
            </Button>
          }
        />
      </AppShell>
    );

  const list = applications.data ?? [];
  const applicants = list.filter((a) => a.status === "applied");
  const submissions = list.filter((a) => a.status === "submitted" || a.status === "paid");
  const roster = list.filter((a) => a.status === "approved");
  const escrowFunded = (escrow.data ?? 0) > 0;

  const reportInput = {
    campaignTitle: campaign.data.title,
    niche: campaign.data.niche_requirement,
    city: campaign.data.target_city,
    budget: Number(campaign.data.total_budget),
    rows: list.map((a) => ({
      handle: a.creator_profiles?.instagram_handle ?? "creator",
      city: a.creator_profiles?.city ?? "—",
      followers: a.creator_profiles?.follower_count ?? 0,
      verified: Boolean(a.creator_profiles?.is_verified),
      status: a.status,
      views: a.reported_views ?? 0,
      likes: a.reported_likes ?? 0,
      comments: a.reported_comments ?? 0,
      payout: a.status === "paid" ? Number(campaign.data!.payout_per_creator) : 0,
    })),
  };

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/dashboard/brand">
          <ArrowLeft className="size-4" /> All campaigns
        </Link>
      </Button>

      <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.data.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {campaign.data.niche_requirement} · {campaign.data.target_city}
            </p>
          </div>
          <StatusBadge status={campaign.data.status} kind="campaign" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{campaign.data.description}</p>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-4">
          <Stat label="Budget" value={formatINR(campaign.data.total_budget)} />
          <Stat label="Payout / creator" value={formatINR(campaign.data.payout_per_creator)} />
          <Stat label="Slots" value={String(campaign.data.max_creators_needed)} />
          <Stat
            label="Paid out"
            value={formatINR(
              list.filter((a) => a.status === "paid").length *
                Number(campaign.data.payout_per_creator),
            )}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          {escrowFunded ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
              <Lock className="size-3.5" /> {formatINR(escrow.data ?? 0)} secured in escrow
            </span>
          ) : (
            <Button onClick={fundEscrow} disabled={funding}>
              {funding ? <Spinner /> : <Lock className="size-4" />} Fund escrow (
              {formatINR(
                Number(campaign.data.payout_per_creator) * campaign.data.max_creators_needed,
              )}
              )
            </Button>
          )}
          <Button variant="outline" onClick={() => openRoiReport(reportInput)}>
            <FileText className="size-4" /> ROI report
          </Button>
          <Button variant="outline" onClick={() => downloadReportCsv(reportInput)}>
            <Download className="size-4" /> CSV
          </Button>
        </div>

        <p className="mt-5 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Guidelines: </span>
          {campaign.data.guidelines}
        </p>
      </div>

      <Tabs defaultValue="applicants" className="mt-8">
        <TabsList>
          <TabsTrigger value="applicants">Applicants ({applicants.length})</TabsTrigger>
          <TabsTrigger value="roster">Approved ({roster.length})</TabsTrigger>
          <TabsTrigger value="submissions">Submissions ({submissions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="applicants" className="mt-6">
          {applications.isPending ? (
            <PageLoader label="Loading applicants" />
          ) : applicants.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No pending applicants"
              description="Creators matching this niche and city will show up here as they apply."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {applicants.map((application) => (
                <CreatorCard key={application.id} application={application}>
                  <Button
                    size="sm"
                    disabled={busy === application.id}
                    onClick={() => act(application.id, "approved")}
                  >
                    {busy === application.id ? <Spinner /> : <Check className="size-4" />} Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === application.id}
                    onClick={() => act(application.id, "rejected")}
                  >
                    <X className="size-4" /> Reject
                  </Button>
                </CreatorCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-6">
          {roster.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="No approved creators yet"
              description="Approve applicants and they'll appear here while they produce their deliverable."
            />
          ) : (
            <div className="space-y-4">
              {roster.map((application) => (
                <div key={application.id} className="space-y-3">
                  <CreatorCard application={application}>
                    <span className="text-xs text-muted-foreground">Awaiting deliverable</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setChatWith(chatWith === application.id ? null : application.id)
                      }
                    >
                      <MessageSquare className="size-4" />
                      {chatWith === application.id ? "Close chat" : "Chat"}
                    </Button>
                  </CreatorCard>
                  {chatWith === application.id && application.creator_profiles && (
                    <CampaignChat
                      campaignId={id}
                      peerId={application.creator_profiles.user_id}
                      peerLabel={`@${application.creator_profiles.instagram_handle}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="submissions" className="mt-6">
          {submissions.length === 0 ? (
            <EmptyState
              icon={ExternalLink}
              title="No submissions yet"
              description="Once approved creators post their reel and submit the link, you can verify and pay here."
            />
          ) : (
            <div className="space-y-4">
              {submissions.map((application) => (
                <div
                  key={application.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-panel"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold">
                        @{application.creator_profiles?.instagram_handle}
                        <VerificationBadge
                          verified={Boolean(application.creator_profiles?.is_verified)}
                        />
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {application.creator_profiles?.city} ·{" "}
                        {formatCompact(application.creator_profiles?.follower_count ?? 0)} followers
                      </p>
                    </div>
                    <StatusBadge status={application.status} kind="application" />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-background p-3 text-xs">
                    <Stat label="Views" value={formatCompact(application.reported_views ?? 0)} />
                    <Stat label="Likes" value={formatCompact(application.reported_likes ?? 0)} />
                    <Stat
                      label="Comments"
                      value={formatCompact(application.reported_comments ?? 0)}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {application.submission_link && (
                      <a
                        href={application.submission_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="size-3.5" /> Open submitted reel
                      </a>
                    )}
                    {application.proof_screenshot_url && (
                      <ProofLink path={application.proof_screenshot_url} />
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button
                      variant={application.metrics_verified ? "outline" : "secondary"}
                      disabled={busy === application.id}
                      onClick={() => verify(application.id, !application.metrics_verified)}
                    >
                      <BadgeCheck className="size-4" />
                      {application.metrics_verified
                        ? "Performance verified"
                        : "Verify performance"}
                    </Button>
                    {application.status === "submitted" && (
                      <Button
                        disabled={busy === application.id}
                        onClick={() => act(application.id, "paid")}
                      >
                        {busy === application.id ? <Spinner /> : <BadgeCheck className="size-4" />}{" "}
                        Release {formatINR(campaign.data!.payout_per_creator)}
                      </Button>
                    )}
                    {application.creator_profiles && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setChatWith(chatWith === application.id ? null : application.id)
                        }
                      >
                        <MessageSquare className="size-4" />
                        {chatWith === application.id ? "Close chat" : "Chat"}
                      </Button>
                    )}
                  </div>

                  {chatWith === application.id && application.creator_profiles && (
                    <div className="mt-4">
                      <CampaignChat
                        campaignId={id}
                        peerId={application.creator_profiles.user_id}
                        peerLabel={`@${application.creator_profiles.instagram_handle}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ProofLink({ path }: { path: string }) {
  const [loading, setLoading] = useState(false);

  const open = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from("proofs").createSignedUrl(path, 300);
    setLoading(false);
    if (error || !data) {
      toast.error("Could not open the proof screenshot");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
    >
      {loading ? <Spinner /> : <ImageIcon className="size-3.5" />} View proof screenshot
    </button>
  );
}

function CreatorCard({
  application,
  children,
}: {
  application: ApplicationWithCreator;
  children: React.ReactNode;
}) {
  const creator = application.creator_profiles;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">@{creator?.instagram_handle}</p>
          <p className="text-sm text-muted-foreground">
            {creator?.niche} · {creator?.city}
          </p>
        </div>
        <VerificationBadge verified={Boolean(creator?.is_verified)} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs">
        <Stat label="Followers" value={formatCompact(creator?.follower_count ?? 0)} />
        <Stat label="Avg views" value={formatCompact(creator?.avg_views ?? 0)} />
        <Stat label="Engagement" value={`${creator?.engagement_rate ?? 0}%`} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}

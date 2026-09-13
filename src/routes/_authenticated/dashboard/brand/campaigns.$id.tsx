import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  ExternalLink,
  FileText,
  Lock,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader, Spinner } from "@/components/Spinner";
import { PlatformChat } from "@/components/PlatformChat";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatCompact, formatINR } from "@/lib/constants";
import type { CampaignApplication, Campaign } from "@/lib/db";
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
          "Track applications, fund escrow and follow deliverables handled by the AdBridge platform team.",
      },
      { property: "og:title", content: "Campaign tracking — AdBridge" },
      { property: "og:description", content: "Track your campaign and its deliverables." },
    ],
  }),
  component: CampaignDetail,
});

function creatorLabel(application: CampaignApplication) {
  return `Creator #${application.creator_id.slice(0, 6).toUpperCase()}`;
}

function CampaignDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const lockEscrow = useServerFn(lockCampaignEscrow);
  const [funding, setFunding] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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
    queryFn: async (): Promise<CampaignApplication[]> => {
      const { data, error } = await supabase
        .from("campaign_applications")
        .select("*")
        .eq("campaign_id", id)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignApplication[];
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["campaign-applications", id] });
    await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    await queryClient.invalidateQueries({ queryKey: ["campaign-escrow", id] });
  };

  const fundEscrow = async () => {
    setFunding(true);
    try {
      const result = await callWithAuth(lockEscrow, { campaign_id: id });
      toast.success(`${formatINR(result.locked)} paid into platform escrow`);
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
  const pending = list.filter((a) => a.status === "applied");
  const roster = list.filter((a) => a.status === "approved");
  const submissions = list.filter((a) => a.status === "submitted" || a.status === "paid");
  const escrowFunded = (escrow.data ?? 0) > 0;

  const reportInput = {
    campaignTitle: campaign.data.title,
    niche: campaign.data.niche_requirement,
    city: campaign.data.target_city,
    budget: Number(campaign.data.total_budget),
    payoutPerCreator: Number(campaign.data.payout_per_creator),
    rows: list.map((a) => ({
      handle: creatorLabel(a),
      city: campaign.data!.target_city,
      followers: 0,
      verified: a.metrics_verified,
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
              <Lock className="size-3.5" /> {formatINR(escrow.data ?? 0)} held by the platform
            </span>
          ) : (
            <Button onClick={fundEscrow} disabled={funding}>
              {funding ? <Spinner /> : <Lock className="size-4" />} Pay into escrow (
              {formatINR(
                Number(campaign.data.payout_per_creator) * campaign.data.max_creators_needed,
              )}
              )
            </Button>
          )}
          <Button variant="outline" onClick={() => setChatOpen((v) => !v)}>
            <MessageSquare className="size-4" />
            {chatOpen ? "Close platform chat" : "Chat with platform team"}
          </Button>
          <Button variant="outline" onClick={() => openRoiReport(reportInput)}>
            <FileText className="size-4" /> ROI report
          </Button>
          <Button variant="outline" onClick={() => downloadReportCsv(reportInput)}>
            <Download className="size-4" /> CSV
          </Button>
        </div>

        <p className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            AdBridge works as the middleman: our team selects and manages the creators, holds your
            payment in escrow and pays the creators after the posts are verified. For anything
            related to this campaign, message the platform team.
          </span>
        </p>

        <p className="mt-3 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Guidelines: </span>
          {campaign.data.guidelines}
        </p>
      </div>

      {chatOpen && (
        <div className="mt-6">
          <PlatformChat campaignId={id} />
        </div>
      )}

      <Tabs defaultValue="pipeline" className="mt-8">
        <TabsList>
          <TabsTrigger value="pipeline">In review ({pending.length})</TabsTrigger>
          <TabsTrigger value="roster">Assigned ({roster.length})</TabsTrigger>
          <TabsTrigger value="submissions">Submissions ({submissions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-6">
          {applications.isPending ? (
            <PageLoader label="Loading pipeline" />
          ) : pending.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No creators in review"
              description="Our team is sourcing creators for this brief. You'll see them here once they're shortlisted."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pending.map((application) => (
                <AnonCard key={application.id} application={application} note="Being reviewed by the platform team" />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-6">
          {roster.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="No creators assigned yet"
              description="The platform team assigns creators to your campaign and they appear here while producing content."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {roster.map((application) => (
                <AnonCard
                  key={application.id}
                  application={application}
                  note="Assigned — producing the deliverable"
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="submissions" className="mt-6">
          {submissions.length === 0 ? (
            <EmptyState
              icon={ExternalLink}
              title="No submissions yet"
              description="Published posts appear here with their performance once the platform team verifies them."
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
                      <p className="font-semibold">{creatorLabel(application)}</p>
                      <p className="text-sm text-muted-foreground">
                        {application.metrics_verified
                          ? "Performance verified by the platform team"
                          : "Awaiting platform verification"}
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

                  {application.submission_link && (
                    <a
                      href={application.submission_link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" /> Open published post
                    </a>
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

function AnonCard({ application, note }: { application: CampaignApplication; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{creatorLabel(application)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{note}</p>
        </div>
        <StatusBadge status={application.status} kind="application" />
      </div>
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

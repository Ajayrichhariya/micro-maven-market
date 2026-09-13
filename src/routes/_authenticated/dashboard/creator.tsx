import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Compass,
  ExternalLink,
  IdCard,
  ListChecks,
  MapPin,
  MessageSquare,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { CreatorOnboarding } from "@/components/CreatorOnboarding";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader, Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreatorProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCompact, formatINR } from "@/lib/constants";
import type { ApplicationWithCampaign, Campaign, CreatorProfile } from "@/lib/db";
import { reportPostMetrics, submitProof } from "@/lib/marketplace.functions";
import { callWithAuth } from "@/lib/server-call";
import { CampaignChat } from "@/components/CampaignChat";
import { MediaKitEditor } from "@/components/MediaKitEditor";

export const Route = createFileRoute("/_authenticated/dashboard/creator")({
  head: () => ({
    meta: [
      { title: "Creator dashboard — AdBridge" },
      {
        name: "description",
        content: "Browse matching brand campaigns, apply in one click and track your payouts.",
      },
      { property: "og:title", content: "Creator dashboard — AdBridge" },
      { property: "og:description", content: "Apply to campaigns and track payouts on AdBridge." },
    ],
  }),
  component: CreatorDashboard,
});

function CreatorDashboard() {
  const { data: creator, isPending } = useCreatorProfile();

  if (isPending) return <PageLoader label="Loading your profile" />;
  if (!creator)
    return (
      <AppShell>
        <CreatorOnboarding />
      </AppShell>
    );

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hey @{creator.instagram_handle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {creator.niche} · {creator.city} · {formatCompact(creator.follower_count)} followers ·{" "}
          {creator.is_verified ? "Verified profile" : "Verification pending"}
        </p>
      </div>

      <Tabs defaultValue="explore">
        <TabsList>
          <TabsTrigger value="explore">
            <Compass className="mr-2 size-4" /> Explore campaigns
          </TabsTrigger>
          <TabsTrigger value="deliverables">
            <ListChecks className="mr-2 size-4" /> My deliverables
          </TabsTrigger>
          <TabsTrigger value="mediakit">
            <IdCard className="mr-2 size-4" /> Media kit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="explore" className="mt-6">
          <ExploreTab creator={creator} />
        </TabsContent>
        <TabsContent value="deliverables" className="mt-6">
          <DeliverablesTab creator={creator} />
        </TabsContent>
        <TabsContent value="mediakit" className="mt-6">
          <MediaKitEditor creator={creator} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ExploreTab({ creator }: { creator: CreatorProfile }) {
  const queryClient = useQueryClient();

  const campaigns = useQuery({
    queryKey: ["open-campaigns"],
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .in("status", ["active", "in_progress"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const myApplications = useQuery({
    queryKey: ["my-applications", creator.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_applications")
        .select("campaign_id")
        .eq("creator_id", creator.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const applied = new Set((myApplications.data ?? []).map((a) => a.campaign_id));

  const apply = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from("campaign_applications")
        .insert({ campaign_id: campaignId, creator_id: creator.id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Applied — the brand will review your profile");
      await queryClient.invalidateQueries({ queryKey: ["my-applications", creator.id] });
      await queryClient.invalidateQueries({ queryKey: ["my-deliverables", creator.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (campaigns.isPending) return <PageLoader label="Finding campaigns" />;

  const list = (campaigns.data ?? []).sort((a, b) => {
    const score = (c: Campaign) =>
      (c.niche_requirement === creator.niche ? 2 : 0) + (c.target_city === creator.city ? 1 : 0);
    return score(b) - score(a);
  });

  if (list.length === 0)
    return (
      <EmptyState
        icon={Compass}
        title="No live campaigns yet"
        description="Brands publish new briefs regularly. Check back soon — you'll see everything matching your niche and city here."
      />
    );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map((campaign) => {
        const match =
          campaign.niche_requirement === creator.niche && campaign.target_city === creator.city;
        return (
          <div
            key={campaign.id}
            className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{campaign.title}</h3>
              <StatusBadge status={campaign.status} kind="campaign" />
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
              {campaign.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-1">
                {campaign.niche_requirement}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                <MapPin className="size-3" /> {campaign.target_city}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                <Users className="size-3" /> {campaign.max_creators_needed} creators
              </span>
              {match && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                  Great match
                </span>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <div>
                <p className="text-xs text-muted-foreground">Payout per creator</p>
                <p className="text-lg font-semibold">{formatINR(campaign.payout_per_creator)}</p>
              </div>
              <Button
                size="sm"
                disabled={applied.has(campaign.id) || apply.isPending}
                onClick={() => apply.mutate(campaign.id)}
              >
                {apply.isPending && apply.variables === campaign.id && <Spinner />}
                {applied.has(campaign.id) ? "Applied" : "Apply"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeliverablesTab({ creator }: { creator: CreatorProfile }) {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitProof);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const applications = useQuery({
    queryKey: ["my-deliverables", creator.id],
    queryFn: async (): Promise<ApplicationWithCampaign[]> => {
      const { data, error } = await supabase
        .from("campaign_applications")
        .select("*, campaigns(*)")
        .eq("creator_id", creator.id)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApplicationWithCampaign[];
    },
  });

  const uploadProof = async (applicationId: string, file: File) => {
    const path = `${creator.user_id}/${applicationId}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("proofs").upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return path;
  };

  const handleSubmit = async (applicationId: string, file: File | null) => {
    const link = (links[applicationId] ?? "").trim();
    if (!link) {
      toast.error("Paste your Instagram post or reel URL first");
      return;
    }
    setBusy(applicationId);
    try {
      const proofPath = file ? await uploadProof(applicationId, file) : null;
      await submit({
        data: {
          application_id: applicationId,
          submission_link: link,
          proof_screenshot_url: proofPath,
        },
      });
      toast.success("Submitted for review");
      await queryClient.invalidateQueries({ queryKey: ["my-deliverables", creator.id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit");
    } finally {
      setBusy(null);
    }
  };

  if (applications.isPending) return <PageLoader label="Loading your assignments" />;

  const list = applications.data ?? [];
  if (list.length === 0)
    return (
      <EmptyState
        icon={ListChecks}
        title="No assignments yet"
        description="Once you apply to a campaign and a brand approves you, your deliverable and payout tracker appear here."
      />
    );

  return (
    <div className="space-y-4">
      {list.map((application) => (
        <DeliverableCard
          key={application.id}
          application={application}
          value={links[application.id] ?? application.submission_link ?? ""}
          onChange={(v) => setLinks((prev) => ({ ...prev, [application.id]: v }))}
          busy={busy === application.id}
          onSubmit={(file) => handleSubmit(application.id, file)}
        />
      ))}
    </div>
  );
}

const TRACKER = ["applied", "approved", "submitted", "paid"] as const;

function DeliverableCard({
  application,
  value,
  onChange,
  busy,
  onSubmit,
}: {
  application: ApplicationWithCampaign;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  onSubmit: (file: File | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const stageIndex = TRACKER.indexOf(application.status as (typeof TRACKER)[number]);
  const canSubmit = application.status === "approved" || application.status === "submitted";

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{application.campaigns?.title ?? "Campaign"}</h3>
          <p className="text-sm text-muted-foreground">
            Payout {formatINR(application.campaigns?.payout_per_creator ?? 0)} ·{" "}
            {application.campaigns?.target_city}
          </p>
        </div>
        <StatusBadge status={application.status} kind="application" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["Applied", "Approved", "Under review", "Paid"].map((label, index) => (
          <span
            key={label}
            className={
              "rounded-full border px-2.5 py-1 text-xs " +
              (application.status !== "rejected" && index <= stageIndex
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-muted-foreground")
            }
          >
            {label}
          </span>
        ))}
      </div>

      {application.campaigns?.guidelines && (
        <p className="mt-4 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Guidelines: </span>
          {application.campaigns.guidelines}
        </p>
      )}

      {application.status === "applied" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Waiting for the brand to approve your application.
        </p>
      )}
      {application.status === "rejected" && (
        <p className="mt-4 text-sm text-muted-foreground">
          This application wasn't selected. Keep applying to other campaigns.
        </p>
      )}
      {application.status === "paid" && application.submission_link && (
        <a
          href={application.submission_link}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" /> View your submitted post
        </a>
      )}

      {canSubmit && (
        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor={`link-${application.id}`}>Live Instagram post / reel URL</Label>
            <Input
              id={`link-${application.id}`}
              placeholder="https://www.instagram.com/reel/XXXXXXXXX/"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
            <Label htmlFor={`file-${application.id}`} className="pt-2">
              Proof screenshot (optional)
            </Label>
            <Input
              id={`file-${application.id}`}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => onSubmit(file)} disabled={busy}>
              {busy && <Spinner />}
              {application.status === "submitted" ? "Resubmit" : "Submit deliverable"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

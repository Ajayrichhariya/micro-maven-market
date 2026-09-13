import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, ShieldCheck, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/VerificationBadge";
import { useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCompact, formatINR } from "@/lib/constants";
import type { ApplicationWithCampaign, Campaign, CreatorProfile } from "@/lib/db";
import { updateApplicationStatus, verifyPostMetrics } from "@/lib/marketplace.functions";
import { callWithAuth } from "@/lib/server-call";

type AdminApplication = ApplicationWithCampaign & {
  creator_profiles: CreatorProfile | null;
};

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin control room — AdBridge" },
      {
        name: "description",
        content:
          "Platform metrics, creator verification and manual payout controls for the AdBridge exchange.",
      },
      { property: "og:title", content: "Admin control room — AdBridge" },
      { property: "og:description", content: "Metrics, verification and payouts." },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: profile, isPending: profilePending } = useProfile();
  const queryClient = useQueryClient();
  const updateStatus = useServerFn(updateApplicationStatus);

  const creators = useQuery({
    queryKey: ["admin-creators"],
    enabled: profile?.role === "admin",
    queryFn: async (): Promise<CreatorProfile[]> => {
      const { data, error } = await supabase
        .from("creator_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const campaigns = useQuery({
    queryKey: ["admin-campaigns"],
    enabled: profile?.role === "admin",
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase.from("campaigns").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const applications = useQuery({
    queryKey: ["admin-applications"],
    enabled: profile?.role === "admin",
    queryFn: async (): Promise<AdminApplication[]> => {
      const { data, error } = await supabase
        .from("campaign_applications")
        .select("*, campaigns(*), creator_profiles(*)")
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminApplication[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "approved" | "rejected";
    }) => callWithAuth(updateStatus, { application_id: id, status }),
    onSuccess: async () => {
      toast.success("Application updated");
      await queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const verifyMetrics = useMutation({
    mutationFn: async (id: string) =>
      callWithAuth(verifyPost, { application_id: id, verified: true }),
    onSuccess: async () => {
      toast.success("Performance verified");
      await queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const verify = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("creator_profiles")
        .update({ is_verified: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Creator verification updated");
      await queryClient.invalidateQueries({ queryKey: ["admin-creators"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const markPaid = useMutation({
    mutationFn: async (applicationId: string) =>
      callWithAuth(updateStatus, { application_id: applicationId, status: "paid" as const }),
    onSuccess: async () => {
      toast.success("Marked as paid");
      await queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (profilePending) return <PageLoader label="Checking access" />;

  if (profile?.role !== "admin")
    return (
      <AppShell>
        <EmptyState
          icon={ShieldCheck}
          title="Admins only"
          description="This control room is restricted to platform administrators."
        />
      </AppShell>
    );

  const paidApplications = (applications.data ?? []).filter((a) => a.status === "paid");
  const grossVolume = paidApplications.reduce(
    (sum, a) => sum + Number(a.campaigns?.payout_per_creator ?? 0),
    0,
  );
  const pending = (applications.data ?? []).filter((a) => a.status === "submitted");
  const incoming = (applications.data ?? []).filter((a) => a.status === "applied");

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Admin control room</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Platform-wide health, creator verification and manual payout overrides.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Users} label="Active creators" value={String(creators.data?.length ?? 0)} />
        <Metric icon={BadgeCheck} label="Total campaigns" value={String(campaigns.data?.length ?? 0)} />
        <Metric icon={Wallet} label="Gross volume" value={formatINR(grossVolume)} />
        <Metric icon={ShieldCheck} label="Awaiting payout" value={String(pending.length)} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Creator verification</h2>
        {creators.isPending ? (
          <PageLoader label="Loading creators" />
        ) : (creators.data ?? []).length === 0 ? (
          <EmptyState
            icon={Users}
            title="No creators yet"
            description="Creator profiles appear here as soon as people finish onboarding."
          />
        ) : (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {creators.data!.map((creator) => (
              <div
                key={creator.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">@{creator.instagram_handle}</p>
                    <VerificationBadge verified={creator.is_verified} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {creator.niche} · {creator.city} ·{" "}
                    {formatCompact(creator.follower_count)} followers ·{" "}
                    {formatINR(creator.min_rate_per_post)} min
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={creator.is_verified ? "outline" : "default"}
                    disabled={verify.isPending || creator.is_verified}
                    onClick={() => verify.mutate({ id: creator.id, value: true })}
                  >
                    <BadgeCheck className="size-4" /> Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verify.isPending || !creator.is_verified}
                    onClick={() => verify.mutate({ id: creator.id, value: false })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Assignment queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You decide which creator gets each campaign. Brands never see or contact creators.
        </p>
        {incoming.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No new applications"
            description="Creator applications waiting for your decision will appear here."
          />
        ) : (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {incoming.map((application) => (
              <div
                key={application.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-medium">{application.campaigns?.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>@{application.creator_profiles?.instagram_handle ?? "creator"}</span>
                    <span>
                      {formatCompact(application.creator_profiles?.follower_count ?? 0)} followers
                    </span>
                    <span>{application.creator_profiles?.city}</span>
                    <VerificationBadge
                      verified={Boolean(application.creator_profiles?.is_verified)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: application.id, status: "approved" })}
                  >
                    Assign creator
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: application.id, status: "rejected" })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Payout queue</h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nothing awaiting payout"
            description="Submitted deliverables waiting for verification will queue up here."
          />
        ) : (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {pending.map((application) => (
              <div
                key={application.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-medium">{application.campaigns?.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatINR(application.campaigns?.payout_per_creator ?? 0)} ·{" "}
                    {application.submission_link ?? "No link"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCompact(application.reported_views)} views ·{" "}
                    {formatCompact(application.reported_likes)} likes ·{" "}
                    {formatCompact(application.reported_comments)} comments ·{" "}
                    {application.metrics_verified ? "verified" : "unverified"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={application.status} kind="application" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verifyMetrics.isPending || application.metrics_verified}
                    onClick={() => verifyMetrics.mutate(application.id)}
                  >
                    Verify performance
                  </Button>
                  <Button
                    size="sm"
                    disabled={markPaid.isPending}
                    onClick={() => markPaid.mutate(application.id)}
                  >
                    Mark paid
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-panel">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" /> {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

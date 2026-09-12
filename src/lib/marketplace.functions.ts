import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INSTAGRAM_URL =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?(\?.*)?$/;

export const campaignInputSchema = z.object({
  title: z.string().trim().min(4, "Title must be at least 4 characters").max(120),
  description: z.string().trim().min(20, "Describe the campaign in at least 20 characters").max(2000),
  niche_requirement: z.string().trim().min(2, "Pick a niche").max(60),
  target_city: z.string().trim().min(2, "Pick a target city").max(80),
  total_budget: z.number().positive("Budget must be greater than 0").max(100000000),
  payout_per_creator: z.number().positive("Payout must be greater than 0").max(10000000),
  max_creators_needed: z.number().int().min(1, "At least 1 creator").max(500),
  guidelines: z.string().trim().min(10, "Add content guidelines").max(4000),
  status: z.enum(["draft", "active"]),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

/** POST /api/campaigns/create — authenticated, server-side validated campaign creation. */
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => campaignInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile || (profile.role !== "brand" && profile.role !== "admin")) {
      throw new Error("Only brand accounts can create campaigns");
    }

    if (data.payout_per_creator * data.max_creators_needed > data.total_budget) {
      throw new Error("Total budget must cover payout per creator × number of creators");
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({ ...data, brand_id: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return campaign;
  });

export const submitProofSchema = z.object({
  application_id: z.string().uuid(),
  submission_link: z
    .string()
    .trim()
    .max(500)
    .regex(INSTAGRAM_URL, "Enter a valid Instagram post or reel URL"),
  proof_screenshot_url: z.string().trim().max(1000).nullable().optional(),
});

/** POST /api/applications/submit-proof — validates the Instagram URL then records the deliverable. */
export const submitProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitProofSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: application, error: loadError } = await supabase
      .from("campaign_applications")
      .select("id, status, creator_profiles!inner(user_id)")
      .eq("id", data.application_id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!application) throw new Error("Application not found");

    const owner = (application as unknown as { creator_profiles: { user_id: string } })
      .creator_profiles;
    if (owner?.user_id !== userId) throw new Error("You cannot submit for this application");
    if (application.status === "rejected") throw new Error("This application was rejected");
    if (application.status === "applied") throw new Error("Wait for brand approval before submitting");
    if (application.status === "paid") throw new Error("This deliverable is already paid");

    const { data: updated, error } = await supabase
      .from("campaign_applications")
      .update({
        submission_link: data.submission_link,
        proof_screenshot_url: data.proof_screenshot_url ?? null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", data.application_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return updated;
  });

export const applicationStatusSchema = z.object({
  application_id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "paid"]),
});

/** PATCH /api/applications/status — platform admin only: assigns, rejects, or releases payment. */
export const updateApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => applicationStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: application, error: loadError } = await supabase
      .from("campaign_applications")
      .select(
        "id, status, campaign_id, campaigns!inner(brand_id, payout_per_creator), creator_profiles!inner(user_id)",
      )
      .eq("id", data.application_id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!application) throw new Error("Application not found");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    const joined = application as unknown as {
      campaigns: { brand_id: string; payout_per_creator: number };
      creator_profiles: { user_id: string };
    };
    const brandId = joined.campaigns?.brand_id;
    const isAdmin = profile?.role === "admin";
    if (!isAdmin) throw new Error("Only the platform team can decide applications and payouts");

    if (data.status === "paid" && application.status !== "submitted") {
      throw new Error("Payment can only be released after the creator submits proof");
    }

    if (data.status === "paid" && application.status !== "paid") {
      const { settleEscrowPayout } = await import("@/lib/wallet.functions");
      await settleEscrowPayout({
        brandId,
        creatorUserId: joined.creator_profiles.user_id,
        amount: Number(joined.campaigns.payout_per_creator),
        campaignId: application.campaign_id,
      });
    }

    const { data: updated, error } = await supabase
      .from("campaign_applications")
      .update({ status: data.status })
      .eq("id", data.application_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.status === "approved") {
      await supabase
        .from("campaigns")
        .update({ status: "in_progress" })
        .eq("id", application.campaign_id)
        .eq("status", "active");
    }

    return updated;
  });

export const reportMetricsSchema = z.object({
  application_id: z.string().uuid(),
  views: z.number().int().min(0).max(1000000000),
  likes: z.number().int().min(0).max(1000000000),
  comments: z.number().int().min(0).max(1000000000),
});

/** Creator reports live post performance for a submitted deliverable. */
export const reportPostMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reportMetricsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: application, error: loadError } = await supabase
      .from("campaign_applications")
      .select("id, status, creator_profiles!inner(user_id)")
      .eq("id", data.application_id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!application) throw new Error("Application not found");
    const owner = (application as unknown as { creator_profiles: { user_id: string } })
      .creator_profiles;
    if (owner?.user_id !== userId) throw new Error("You cannot update this deliverable");
    if (application.status !== "submitted" && application.status !== "paid")
      throw new Error("Submit your post link before reporting performance");

    const { data: updated, error } = await supabase
      .from("campaign_applications")
      .update({
        reported_views: data.views,
        reported_likes: data.likes,
        reported_comments: data.comments,
        metrics_verified: false,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", data.application_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

/** Platform admin confirms the reported performance numbers. */
export const verifyPostMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ application_id: z.string().uuid(), verified: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: application, error: loadError } = await supabase
      .from("campaign_applications")
      .select("id")
      .eq("id", data.application_id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!application) throw new Error("Application not found");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.role !== "admin")
      throw new Error("Only the platform team can verify deliverables");

    const { data: updated, error } = await supabase
      .from("campaign_applications")
      .update({ metrics_verified: data.verified })
      .eq("id", data.application_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

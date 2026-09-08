import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type CampaignStatus = Database["public"]["Enums"]["campaign_status"];
export type ApplicationStatus = Database["public"]["Enums"]["application_status"];

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type CreatorProfile = Database["public"]["Tables"]["creator_profiles"]["Row"];
export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
export type CampaignApplication = Database["public"]["Tables"]["campaign_applications"]["Row"];

export type ApplicationWithCreator = CampaignApplication & {
  creator_profiles: CreatorProfile | null;
};

export type ApplicationWithCampaign = CampaignApplication & {
  campaigns: Campaign | null;
};

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type PublicMediaKit = {
  username: string | null;
  instagram_handle: string;
  youtube_handle: string | null;
  bio: string;
  niche: string;
  city: string;
  state: string;
  is_verified: boolean;
  engagement_rate: number;
  avg_views: number;
  follower_count: number;
  min_rate_per_post: number;
  portfolio_links: string[];
};

/** Public, unauthenticated media kit lookup — returns only non-sensitive fields. */
export const getPublicMediaKit = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ username: z.string().trim().min(2).max(40) }).parse(data),
  )
  .handler(async ({ data }): Promise<PublicMediaKit | null> => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
            headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: rows, error } = await client.rpc("get_public_media_kit", {
      _username: data.username.toLowerCase(),
    });
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0];
    return (row as PublicMediaKit | undefined) ?? null;
  });

export const mediaKitSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(30)
    .regex(/^[a-z0-9_-]+$/i, "Only letters, numbers, dash and underscore"),
  bio: z.string().trim().max(600).default(""),
  youtube_handle: z.string().trim().max(80).nullable().default(null),
  portfolio_links: z.array(z.string().trim().url()).max(6).default([]),
  is_public: z.boolean().default(true),
});

/** Creator updates their own public media kit. */
export const saveMediaKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => mediaKitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("creator_profiles")
      .update({
        username: data.username.toLowerCase(),
        bio: data.bio,
        youtube_handle: data.youtube_handle,
        portfolio_links: data.portfolio_links,
        is_public: data.is_public,
      })
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken");
      throw new Error(error.message);
    }
    return updated;
  });

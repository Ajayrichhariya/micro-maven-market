-- 1. Chat
CREATE TABLE IF NOT EXISTS public.campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  attachment_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.campaign_messages TO authenticated;
GRANT ALL ON public.campaign_messages TO service_role;
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_participants" ON public.campaign_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id OR public.current_role_is('admin'));
CREATE POLICY "messages_insert_sender" ON public.campaign_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> receiver_id);
CREATE POLICY "messages_update_receiver" ON public.campaign_messages FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE INDEX IF NOT EXISTS campaign_messages_campaign_idx ON public.campaign_messages(campaign_id, created_at);

-- 2. Wallets
CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_balance numeric NOT NULL DEFAULT 0,
  locked_escrow numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_wallets TO authenticated;
GRANT ALL ON public.user_wallets TO service_role;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_select_own" ON public.user_wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.current_role_is('admin'));

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('deposit','escrow_lock','escrow_release','withdrawal','platform_fee','payout')),
  reference_id text,
  note text,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_ledger TO authenticated;
GRANT ALL ON public.wallet_ledger TO service_role;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_select_own" ON public.wallet_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.current_role_is('admin'));
CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx ON public.wallet_ledger(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS user_wallets_touch ON public.user_wallets;
CREATE TRIGGER user_wallets_touch BEFORE UPDATE ON public.user_wallets
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Media kit fields
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS youtube_handle text,
  ADD COLUMN IF NOT EXISTS portfolio_links text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_public_media_kit(_username text)
RETURNS TABLE (
  username text, instagram_handle text, youtube_handle text, bio text,
  niche text, city text, state text, is_verified boolean,
  engagement_rate double precision, avg_views integer, follower_count integer,
  min_rate_per_post numeric, portfolio_links text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cp.username, cp.instagram_handle, cp.youtube_handle, cp.bio,
         cp.niche, cp.city, cp.state, cp.is_verified,
         cp.engagement_rate, cp.avg_views, cp.follower_count,
         cp.min_rate_per_post, cp.portfolio_links
  FROM public.creator_profiles cp
  WHERE cp.username = lower(_username) AND cp.is_public = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_media_kit(text) TO anon, authenticated;

-- 4. Reported post metrics
ALTER TABLE public.campaign_applications
  ADD COLUMN IF NOT EXISTS reported_views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reported_likes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reported_comments integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrics_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
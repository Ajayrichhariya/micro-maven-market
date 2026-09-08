
CREATE TYPE public.app_role AS ENUM ('brand', 'creator', 'admin');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'active', 'in_progress', 'completed');
CREATE TYPE public.application_status AS ENUM ('applied', 'approved', 'rejected', 'submitted', 'paid');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'creator',
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_role_is(_role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), _role);
$$;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_role_is('admin'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'creator')::public.app_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  instagram_handle TEXT NOT NULL,
  niche TEXT NOT NULL,
  follower_count INTEGER NOT NULL DEFAULT 0,
  avg_views INTEGER NOT NULL DEFAULT 0,
  engagement_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  min_rate_per_post NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.creator_profiles TO authenticated;
GRANT ALL ON public.creator_profiles TO service_role;
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_profiles_select_auth" ON public.creator_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "creator_profiles_insert_own" ON public.creator_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "creator_profiles_update_own" ON public.creator_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "creator_profiles_update_admin" ON public.creator_profiles FOR UPDATE TO authenticated
  USING (public.current_role_is('admin')) WITH CHECK (public.current_role_is('admin'));

CREATE OR REPLACE FUNCTION public.guard_creator_verification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change verification status';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER creator_profiles_verify_guard BEFORE UPDATE ON public.creator_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_creator_verification();

CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  niche_requirement TEXT NOT NULL,
  target_city TEXT NOT NULL DEFAULT '',
  total_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  payout_per_creator NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_creators_needed INTEGER NOT NULL DEFAULT 1,
  guidelines TEXT NOT NULL DEFAULT '',
  status public.campaign_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select" ON public.campaigns FOR SELECT TO authenticated
  USING (status <> 'draft' OR brand_id = auth.uid() OR public.current_role_is('admin'));
CREATE POLICY "campaigns_insert_own" ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (brand_id = auth.uid());
CREATE POLICY "campaigns_update_own" ON public.campaigns FOR UPDATE TO authenticated
  USING (brand_id = auth.uid() OR public.current_role_is('admin'))
  WITH CHECK (brand_id = auth.uid() OR public.current_role_is('admin'));
CREATE POLICY "campaigns_delete_own" ON public.campaigns FOR DELETE TO authenticated
  USING (brand_id = auth.uid());

CREATE TABLE public.campaign_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  status public.application_status NOT NULL DEFAULT 'applied',
  submission_link TEXT,
  proof_screenshot_url TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE (campaign_id, creator_id)
);
GRANT SELECT, INSERT, UPDATE ON public.campaign_applications TO authenticated;
GRANT ALL ON public.campaign_applications TO service_role;
ALTER TABLE public.campaign_applications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_creator(_creator_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = _creator_id AND cp.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.owns_campaign(_campaign_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = _campaign_id AND c.brand_id = auth.uid());
$$;

CREATE POLICY "applications_select" ON public.campaign_applications FOR SELECT TO authenticated
  USING (public.owns_creator(creator_id) OR public.owns_campaign(campaign_id) OR public.current_role_is('admin'));
CREATE POLICY "applications_insert_creator" ON public.campaign_applications FOR INSERT TO authenticated
  WITH CHECK (public.owns_creator(creator_id));
CREATE POLICY "applications_update" ON public.campaign_applications FOR UPDATE TO authenticated
  USING (public.owns_creator(creator_id) OR public.owns_campaign(campaign_id) OR public.current_role_is('admin'))
  WITH CHECK (public.owns_creator(creator_id) OR public.owns_campaign(campaign_id) OR public.current_role_is('admin'));

CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_applications_campaign ON public.campaign_applications(campaign_id);
CREATE INDEX idx_applications_creator ON public.campaign_applications(creator_id);

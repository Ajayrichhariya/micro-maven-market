CREATE OR REPLACE FUNCTION public.brand_can_view_creator(_creator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaign_applications a
    JOIN public.campaigns c ON c.id = a.campaign_id
    WHERE a.creator_id = _creator_id
      AND c.brand_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.brand_can_view_creator(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.brand_can_view_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS creator_profiles_select_brand_admin_own ON public.creator_profiles;

CREATE POLICY creator_profiles_select_scoped
ON public.creator_profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.current_role_is('admin'::app_role)
  OR (public.current_role_is('brand'::app_role) AND public.brand_can_view_creator(id))
);
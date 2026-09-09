DROP POLICY creator_profiles_select_auth ON public.creator_profiles;

CREATE POLICY creator_profiles_select_brand_admin_own
ON public.creator_profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR current_role_is('admin'::app_role)
  OR current_role_is('brand'::app_role)
);

-- Creators visible only to themselves and the platform admin
DROP POLICY IF EXISTS creator_profiles_select_scoped ON public.creator_profiles;
CREATE POLICY creator_profiles_select_scoped ON public.creator_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_role_is('admin'::public.app_role));

-- Only admin (or the creator for their own submission fields) can update applications
DROP POLICY IF EXISTS applications_update ON public.campaign_applications;
CREATE POLICY applications_update ON public.campaign_applications
  FOR UPDATE TO authenticated
  USING (public.owns_creator(creator_id) OR public.current_role_is('admin'::public.app_role))
  WITH CHECK (public.owns_creator(creator_id) OR public.current_role_is('admin'::public.app_role));

-- Chat must always involve the platform admin
DROP POLICY IF EXISTS messages_insert_sender ON public.campaign_messages;
CREATE POLICY messages_insert_sender ON public.campaign_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> receiver_id
    AND (
      public.has_role(sender_id, 'admin'::public.app_role)
      OR public.has_role(receiver_id, 'admin'::public.app_role)
    )
  );

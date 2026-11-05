ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check CHECK (account_status IN ('pending', 'approved', 'rejected', 'blocked'));

-- New signups cannot choose a privileged role through editable auth metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email, account_status)
  VALUES (
    NEW.id,
    CASE WHEN NEW.raw_user_meta_data ->> 'role' = 'brand' THEN 'brand'::public.app_role ELSE 'creator'::public.app_role END,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_account_approved()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'approved');
$$;

CREATE TABLE public.direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_one uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_two uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_conversations_distinct_participants CHECK (participant_one <> participant_two),
  CONSTRAINT direct_conversations_sorted_participants CHECK (participant_one < participant_two),
  CONSTRAINT direct_conversations_unique_participants UNIQUE (participant_one, participant_two)
);
GRANT SELECT, INSERT ON public.direct_conversations TO authenticated;
GRANT ALL ON public.direct_conversations TO service_role;
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY direct_conversations_select_members ON public.direct_conversations FOR SELECT TO authenticated
  USING (public.current_account_approved() AND auth.uid() IN (participant_one, participant_two));
CREATE POLICY direct_conversations_insert_member ON public.direct_conversations FOR INSERT TO authenticated
  WITH CHECK (
    public.current_account_approved()
    AND created_by = auth.uid()
    AND auth.uid() IN (participant_one, participant_two)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = CASE WHEN participant_one = auth.uid() THEN participant_two ELSE participant_one END
        AND p.account_status = 'approved'
        AND p.id <> auth.uid()
    )
  );

CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  media_path text,
  media_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false,
  CONSTRAINT direct_messages_content_or_media CHECK (length(trim(content)) > 0 OR media_path IS NOT NULL),
  CONSTRAINT direct_messages_content_limit CHECK (length(content) <= 10000)
);
GRANT SELECT, INSERT, UPDATE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY direct_messages_select_members ON public.direct_messages FOR SELECT TO authenticated
  USING (
    public.current_account_approved()
    AND EXISTS (SELECT 1 FROM public.direct_conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant_one, c.participant_two))
  );
CREATE POLICY direct_messages_insert_sender ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_account_approved()
    AND sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.direct_conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant_one, c.participant_two))
  );
CREATE POLICY direct_messages_mark_read ON public.direct_messages FOR UPDATE TO authenticated
  USING (
    public.current_account_approved()
    AND sender_id <> auth.uid()
    AND EXISTS (SELECT 1 FROM public.direct_conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant_one, c.participant_two))
  )
  WITH CHECK (
    public.current_account_approved()
    AND sender_id <> auth.uid()
    AND EXISTS (SELECT 1 FROM public.direct_conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant_one, c.participant_two))
  );
CREATE INDEX direct_messages_conversation_created_idx ON public.direct_messages(conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.list_approved_chat_contacts()
RETURNS TABLE(id uuid, full_name text, role public.app_role, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.role, p.avatar_url
  FROM public.profiles p
  WHERE p.account_status = 'approved' AND p.id <> auth.uid() AND auth.uid() IS NOT NULL
  ORDER BY p.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.list_approved_chat_contacts() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(_user_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.current_role_is('admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only platform admins can change account approval';
  END IF;
  IF _status NOT IN ('approved', 'rejected', 'blocked') THEN
    RAISE EXCEPTION 'Invalid account status';
  END IF;
  UPDATE public.profiles SET account_status = _status, updated_at = now() WHERE id = _user_id AND role <> 'admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found or cannot be changed'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(uuid, text) TO authenticated;

CREATE POLICY chat_media_participant_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND public.current_account_approved()
    AND EXISTS (
      SELECT 1 FROM public.direct_messages m
      JOIN public.direct_conversations c ON c.id = m.conversation_id
      WHERE m.media_path = storage.objects.name AND auth.uid() IN (c.participant_one, c.participant_two)
    )
  );
CREATE POLICY chat_media_member_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND public.current_account_approved()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY chat_media_participant_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
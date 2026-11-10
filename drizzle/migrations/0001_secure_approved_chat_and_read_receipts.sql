CREATE OR REPLACE FUNCTION public.list_approved_chat_contacts()
RETURNS TABLE(id uuid, full_name text, role public.app_role, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.role, p.avatar_url
  FROM public.profiles p
  WHERE p.account_status = 'approved'
    AND p.id <> auth.uid()
    AND auth.uid() IS NOT NULL
    AND public.current_account_approved()
  ORDER BY p.full_name;
$$;

CREATE OR REPLACE FUNCTION public.prevent_direct_message_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'is_read') IS DISTINCT FROM (to_jsonb(OLD) - 'is_read') THEN
    RAISE EXCEPTION 'Chat messages cannot be edited after sending';
  END IF;
  IF OLD.is_read AND NOT NEW.is_read THEN
    RAISE EXCEPTION 'Read status cannot be reverted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS direct_messages_immutable_content ON public.direct_messages;
CREATE TRIGGER direct_messages_immutable_content
BEFORE UPDATE ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_message_mutation();

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_role_is(public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_creator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_campaign(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_creator_verification() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_role_is(public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_creator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_campaign(uuid) TO authenticated, service_role;

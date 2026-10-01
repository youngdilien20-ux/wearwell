-- This function is invoked by the auth.users trigger, not by client roles.
-- Keep the trigger path intact while removing direct RPC-style execution access.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Exact SELECT-only audited production helper baseline, local fixture only.
CREATE OR REPLACE FUNCTION public.ai_context_request_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth'
AS $function$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
$function$
;
CREATE OR REPLACE FUNCTION public.ai_context_is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth'
AS $function$
  select public.ai_context_request_role() = 'service_role';
$function$
;
CREATE OR REPLACE FUNCTION public.ai_context_assert_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if p_user_id is null then raise exception 'missing user_id' using errcode = '42501'; end if;
  if not public.ai_context_is_service_role() and auth.uid() is distinct from p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$function$
;
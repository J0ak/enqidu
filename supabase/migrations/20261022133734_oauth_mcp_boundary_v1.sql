-- #104 security boundary. Review/apply separately; never applied to production by the PR.
-- Signed PostgREST claims only. No user_metadata, client arguments or new permissive grant.
BEGIN;
CREATE OR REPLACE FUNCTION public.enqidu_assert_first_party()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'oauth_transport_forbidden';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.enqidu_assert_first_party() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqidu_assert_first_party() TO anon, authenticated, service_role;

-- Deny the whole Data API (tables, views and RPC), independently of RLS/SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.enqidu_data_api_guard()
RETURNS void LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.enqidu_assert_first_party()
$$;
REVOKE ALL ON FUNCTION public.enqidu_data_api_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqidu_data_api_guard() TO anon, authenticated, service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole,
    LATERAL unnest(s.setconfig) setting
    WHERE r.rolname='authenticator' AND setting LIKE 'pgrst.db_pre_request=%'
    AND setting <> 'pgrst.db_pre_request=public.enqidu_data_api_guard') THEN
    RAISE EXCEPTION 'Existing Data API pre-request hook must be reviewed and composed explicitly';
  END IF;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.enqidu_data_api_guard';

-- Reproducible catalog enumeration covers ALL currently exposed application relations,
-- including column-level grants and tables outside the MCP read set. Missing RLS is a
-- blocker, never silently enabled with guessed ownership rules. Views must be invoker.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.oid,c.relname,c.relkind,c.relrowsecurity,c.reloptions
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
      AND (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
    ORDER BY c.relname
  LOOP
    IF t.relkind IN ('r','p') THEN
      IF NOT t.relrowsecurity THEN RAISE EXCEPTION 'OAuth boundary: exposed table % has no RLS',t.relname; END IF;
      EXECUTE format('CREATE POLICY enqidu_oauth_no_direct_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT auth.jwt()->>''client_id'') IS NULL) WITH CHECK ((SELECT auth.jwt()->>''client_id'') IS NULL)',t.relname);
    ELSIF t.relkind='v' AND 'security_invoker=true'=ANY(coalesce(t.reloptions,ARRAY[]::text[])) THEN
      NULL; -- underlying table RLS plus Data API guard applies
    ELSE
      RAISE EXCEPTION 'OAuth boundary: exposed relation % needs explicit review',t.relname;
    END IF;
  END LOOP;
END $$;

-- Existing SECURITY DEFINER writer: guard is inside the function, before its first write.
CREATE OR REPLACE FUNCTION public.set_garmin_sync_consent(p_action text, p_consent_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := auth.uid(); v_row public.user_wearable_connections;
begin
  perform public.enqidu_assert_first_party();
  if v_user is null then raise exception using message='auth_required',errcode='42501'; end if;
  if p_action is null or p_action not in ('enable','disable','revoke','reconnect') then
    raise exception using message='invalid_consent_action',errcode='22023'; end if;
  if p_action = 'enable' and p_consent_version is distinct from 'garmin_daily_v1' then
    raise exception using message='consent_version_required',errcode='22023'; end if;
  insert into public.user_wearable_connections(user_id,provider,connection_status,sync_mode)
    values(v_user,'garmin','pending','provider_managed') on conflict(user_id,provider) do nothing;
  select * into v_row from public.user_wearable_connections where user_id=v_user and provider='garmin' for update;
  -- Revocation requires a fresh reconnect step; enabling alone cannot resurrect its binding.
  if p_action='enable' and v_row.consent_status='revoked' then
    raise exception using message='reconnect_required',errcode='42501'; end if;
  update public.user_wearable_connections set
    consent_status=case p_action when 'enable' then 'active' when 'revoke' then 'revoked' else 'pending_consent' end,
    consent_version=case when p_action='enable' then p_consent_version else consent_version end,
    consent_updated_at=clock_timestamp(), binding_revision=binding_revision+1,
    connection_status=case p_action when 'revoke' then 'revoked' when 'reconnect' then 'pending' else connection_status end,
    binding_verified_at=case when p_action in ('revoke','reconnect') then null else binding_verified_at end,
    external_user_reference=case when p_action in ('revoke','reconnect') then null else external_user_reference end,
    revoked_at=case when p_action='revoke' then clock_timestamp() when p_action='reconnect' then null else revoked_at end,
    next_sync_at=clock_timestamp(), updated_at=clock_timestamp()
    where user_id=v_user and provider='garmin' returning * into v_row;
  insert into public.garmin_sync_consent_events(user_id,action,consent_status,consent_version,binding_revision)
    values(v_user,p_action,v_row.consent_status,v_row.consent_version,v_row.binding_revision);
  return jsonb_build_object('consent_status',v_row.consent_status,'connection_status',v_row.connection_status,
    'sync_enabled',v_row.consent_status='active','runtime_available',false,'scheduler_status','blocked_runtime');
end $function$;


-- Current PostgREST provides request.jwt.claims, not per-claim GUCs. Preserve the
-- canonical context service-role check using Supabase's verified JWT accessor.
CREATE OR REPLACE FUNCTION public.ai_context_request_role()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT coalesce(nullif(auth.jwt()->>'role',''), nullif(current_setting('request.jwt.claim.role',true),''), '')
$$;

-- The shared semantic state function already verifies parent ownership. This tiny
-- service-only invoker entry point supplies the ONLINE-VERIFIED athlete from the server.
-- No custom OAuth token can execute it; no new sporting calculation or mutation.
CREATE FUNCTION public.read_training_semantics_for_mcp_v1(p_user_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT training_semantics.state(p_user_id,p_session_id)
$$;
REVOKE ALL ON FUNCTION public.read_training_semantics_for_mcp_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_training_semantics_for_mcp_v1(uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
COMMIT;

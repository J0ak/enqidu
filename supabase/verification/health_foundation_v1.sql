-- Read-only Health Foundation V1 verification; no athlete payloads returned.
-- Before applying: duplicate_candidates should be 0 or explicitly audited.
-- After applying: installed=true; RLS=true; client_write=false; server_execute=true.

select to_regprocedure('public.ingest_garmin_health_record(uuid,jsonb)') is not null as installed;

select 'daily' as family, count(*) as duplicate_candidates from (
  select user_id,provider,calendar_date from public.wearable_health_daily
  group by 1,2,3 having count(*) > 1
) d
union all select 'sleep',count(*) from (
  select user_id,provider,calendar_date from public.wearable_sleep_sessions
  group by 1,2,3 having count(*) > 1
) d
union all select 'hrv',count(*) from (
  select user_id,provider,calendar_date from public.wearable_hrv_nightly_summaries
  group by 1,2,3 having count(*) > 1
) d;

select c.relname as table_name,c.relrowsecurity as rls_enabled,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_write,
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_write,
  has_table_privilege('anon',c.oid,'SELECT') as anon_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'wearable_health_imports','wearable_health_observations','wearable_health_daily','wearable_sleep_sessions',
  'wearable_hrv_nightly_summaries','wearable_heart_rate_samples',
  'wearable_hrv_nightly_samples','wearable_stress_samples',
  'wearable_body_battery_samples','wearable_respiration_samples',
  'wearable_spo2_samples','wearable_body_composition_measurements',
  'wearable_vendor_insights','wearable_sleep_stage_intervals'
) order by c.relname;

select p.proname,p.prosecdef as security_definer,p.proconfig,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='ingest_garmin_health_record';

-- The shared activity/FIT raw store keeps its pre-existing RLS/DML contract.
-- Its Foundation fields must be protected by the reviewed server-only trigger.
select tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid='public.wearable_provider_raw_payloads'::regclass and not t.tgisinternal;

-- Owner SELECT policy predicates remain part of the real permission boundary.
select tablename,roles,qual from pg_policies
where schemaname='public' and cmd='SELECT' and tablename in (
  'wearable_health_imports','wearable_health_daily','wearable_sleep_sessions',
  'wearable_hrv_nightly_summaries','wearable_vendor_insights'
) order by tablename;

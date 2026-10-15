-- Read-only deployment verification. This PR runs it only against disposable local DB.
select p.proname, not p.prosecdef as security_invoker, p.proconfig,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('apply_manual_health_import','ingest_garmin_health_record');

select tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename in ('wearable_provider_raw_payloads',
  'wearable_health_imports','wearable_health_observations','wearable_sleep_sessions','wearable_hrv_nightly_summaries')
order by tablename,policyname;

select c.relname,c.relrowsecurity,
  has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert_grant
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('wearable_health_imports',
  'wearable_health_observations','wearable_sleep_sessions','wearable_hrv_nightly_summaries');

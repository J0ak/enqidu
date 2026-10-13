-- Read-only post-migration verification. No biometrics, credentials, IDs or audit rows selected.
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('user_wearable_connections','garmin_sync_consent_events');
select tablename,policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in ('user_wearable_connections','garmin_sync_consent_events');
select
  not has_table_privilege('authenticated','public.user_wearable_connections','INSERT,UPDATE,DELETE,TRUNCATE') as connection_writes_closed,
  not has_table_privilege('anon','public.user_wearable_connections','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anonymous_closed,
  not has_table_privilege('authenticated','public.garmin_sync_consent_events','INSERT,UPDATE,DELETE,TRUNCATE') as audit_writes_closed,
  has_function_privilege('authenticated','public.set_garmin_sync_consent(text,text)','EXECUTE') as consent_enabled,
  not has_function_privilege('anon','public.set_garmin_sync_consent(text,text)','EXECUTE') as anonymous_consent_closed,
  not has_function_privilege('authenticated','public.claim_garmin_sync_batch()','EXECUTE') as batch_closed,
  not has_function_privilege('authenticated','public.ingest_owned_garmin_health_record(uuid,bigint,jsonb)','EXECUTE') as owned_writer_closed,
  not has_function_privilege('authenticated','public.ingest_garmin_health_record(uuid,jsonb)','EXECUTE') as foundation_writer_closed;
select indexname,indexdef from pg_indexes where schemaname='public' and indexname in ('garmin_sync_due_idx','garmin_sync_events_owner_idx');

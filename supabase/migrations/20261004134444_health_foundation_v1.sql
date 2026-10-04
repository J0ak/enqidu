-- HEALTH FOUNDATION V1. Production inspected read-only on 2026-10-04.
-- Reuses existing wearable tables. Does not modify FIT/activity or readiness data.
-- Canonical keys exclude ingestion_channel and mutable vendor identifiers.
-- Existing rows remain unchanged; ambiguous legacy adoption fails for explicit audit.
begin;

alter table public.wearable_health_imports
  add column foundation_record_key text,
  add column retrieved_at timestamptz,
  add column source_updated_at timestamptz,
  add column observed_at timestamptz,
  add column timezone text,
  add column foundation_revision_hash text;
create unique index wearable_health_imports_foundation_unique
  on public.wearable_health_imports(user_id, provider, foundation_record_key)
  where foundation_record_key is not null;
create index wearable_health_imports_foundation_sample_keys_idx
  on public.wearable_health_imports using gin ((source_asset_metadata->'foundation_sample_keys'))
  where foundation_record_key is not null;

alter table public.wearable_provider_raw_payloads
  add column foundation_record_key text,
  add column foundation_revision_hash text;
create unique index wearable_raw_foundation_revision_unique
  on public.wearable_provider_raw_payloads(user_id, provider, foundation_record_key, foundation_revision_hash)
  where foundation_record_key is not null;
alter table public.wearable_health_daily add column foundation_record_key text;
create unique index wearable_health_daily_foundation_unique on public.wearable_health_daily(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_sleep_sessions add column foundation_record_key text;
create unique index wearable_sleep_sessions_foundation_unique on public.wearable_sleep_sessions(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_hrv_nightly_summaries add column foundation_record_key text;
create unique index wearable_hrv_nightly_summaries_foundation_unique on public.wearable_hrv_nightly_summaries(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_heart_rate_samples add column foundation_record_key text;
create unique index wearable_heart_rate_samples_foundation_unique on public.wearable_heart_rate_samples(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_hrv_nightly_samples add column foundation_record_key text;
create unique index wearable_hrv_nightly_samples_foundation_unique on public.wearable_hrv_nightly_samples(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_stress_samples add column foundation_record_key text;
create unique index wearable_stress_samples_foundation_unique on public.wearable_stress_samples(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_body_battery_samples add column foundation_record_key text;
create unique index wearable_body_battery_samples_foundation_unique on public.wearable_body_battery_samples(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_respiration_samples add column foundation_record_key text;
create unique index wearable_respiration_samples_foundation_unique on public.wearable_respiration_samples(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_spo2_samples add column foundation_record_key text;
create unique index wearable_spo2_samples_foundation_unique on public.wearable_spo2_samples(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_body_composition_measurements add column foundation_record_key text;
create unique index wearable_body_composition_measurements_foundation_unique on public.wearable_body_composition_measurements(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_vendor_insights add column foundation_record_key text;
create unique index wearable_vendor_insights_foundation_unique on public.wearable_vendor_insights(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_sleep_stage_intervals add column foundation_record_key text;
create unique index wearable_sleep_stage_intervals_foundation_unique on public.wearable_sleep_stage_intervals(user_id, provider, foundation_record_key) where foundation_record_key is not null;
alter table public.wearable_health_daily drop constraint wearable_health_daily_ingestion_channel_check;
alter table public.wearable_health_daily add constraint wearable_health_daily_ingestion_channel_check CHECK ((ingestion_channel = ANY (ARRAY['fitness_ai_connector'::text, 'chatgpt_assisted_capture'::text, 'garmin_health_api'::text, 'admin_backfill'::text, 'mock_test'::text])));
alter table public.wearable_health_daily drop constraint wearable_health_daily_provider_mode_check;
alter table public.wearable_health_daily add constraint wearable_health_daily_provider_mode_check CHECK ((provider_mode = ANY (ARRAY['aggregator'::text, 'assisted_capture'::text, 'official_api'::text, 'manual_entry'::text, 'mock_test'::text])));
alter table public.wearable_health_imports drop constraint wearable_health_imports_ingestion_channel_check;
alter table public.wearable_health_imports add constraint wearable_health_imports_ingestion_channel_check CHECK ((ingestion_channel = ANY (ARRAY['fitness_ai_connector'::text, 'chatgpt_assisted_capture'::text, 'lovable_manual_entry'::text, 'garmin_health_api'::text, 'admin_backfill'::text, 'mock_test'::text])));
alter table public.wearable_health_imports drop constraint wearable_health_imports_provider_mode_check;
alter table public.wearable_health_imports add constraint wearable_health_imports_provider_mode_check CHECK ((provider_mode = ANY (ARRAY['aggregator'::text, 'assisted_capture'::text, 'official_api'::text, 'manual_entry'::text, 'mock_test'::text])));
alter table public.wearable_heart_rate_samples drop constraint wearable_heart_rate_samples_provider_mode_check;
alter table public.wearable_heart_rate_samples add constraint wearable_heart_rate_samples_provider_mode_check CHECK ((provider_mode = ANY (ARRAY['aggregator'::text, 'assisted_capture'::text, 'official_api'::text, 'manual_entry'::text, 'mock_test'::text])));
alter table public.wearable_hrv_nightly_summaries drop constraint wearable_hrv_nightly_summaries_provider_mode_check;
alter table public.wearable_hrv_nightly_summaries add constraint wearable_hrv_nightly_summaries_provider_mode_check CHECK ((provider_mode = ANY (ARRAY['aggregator'::text, 'assisted_capture'::text, 'official_api'::text, 'manual_entry'::text, 'mock_test'::text])));
alter table public.wearable_provider_raw_payloads drop constraint wearable_provider_raw_payloads_ingestion_channel_check;
alter table public.wearable_provider_raw_payloads add constraint wearable_provider_raw_payloads_ingestion_channel_check CHECK ((ingestion_channel = ANY (ARRAY['fitness_ai_connector'::text, 'chatgpt_assisted_capture'::text, 'garmin_health_api'::text, 'garmin_activity_api'::text, 'fit_manual_upload'::text, 'admin_backfill'::text, 'mock_test'::text])));
alter table public.wearable_provider_raw_payloads drop constraint wearable_provider_raw_payloads_provider_mode_check;
alter table public.wearable_provider_raw_payloads add constraint wearable_provider_raw_payloads_provider_mode_check CHECK ((provider_mode = ANY (ARRAY['aggregator'::text, 'assisted_capture'::text, 'official_api'::text, 'manual_entry'::text, 'mock_test'::text])));
alter table public.wearable_sleep_sessions drop constraint wearable_sleep_sessions_ingestion_channel_check;
alter table public.wearable_sleep_sessions add constraint wearable_sleep_sessions_ingestion_channel_check CHECK ((ingestion_channel = ANY (ARRAY['fitness_ai_connector'::text, 'chatgpt_assisted_capture'::text, 'garmin_health_api'::text, 'admin_backfill'::text, 'mock_test'::text])));
alter table public.wearable_sleep_sessions drop constraint wearable_sleep_sessions_provider_mode_check;
alter table public.wearable_sleep_sessions add constraint wearable_sleep_sessions_provider_mode_check CHECK ((provider_mode = ANY (ARRAY['aggregator'::text, 'assisted_capture'::text, 'official_api'::text, 'manual_entry'::text, 'mock_test'::text])));
alter table public.wearable_vendor_insights drop constraint wearable_vendor_insights_ingestion_channel_check;
alter table public.wearable_vendor_insights add constraint wearable_vendor_insights_ingestion_channel_check CHECK ((ingestion_channel = ANY (ARRAY['fitness_ai_connector'::text, 'chatgpt_assisted_capture'::text, 'garmin_health_api'::text, 'admin_backfill'::text, 'mock_test'::text])));
alter table public.wearable_vendor_insights drop constraint wearable_vendor_insights_provider_mode_check;
alter table public.wearable_vendor_insights add constraint wearable_vendor_insights_provider_mode_check CHECK ((provider_mode = ANY (ARRAY['aggregator'::text, 'assisted_capture'::text, 'official_api'::text, 'manual_entry'::text, 'mock_test'::text])));
-- RLS is preserved; browser roles lose pre-existing general write/TRUNCATE grants.
-- Shared raw table retains its existing FIT DML contract; only TRUNCATE is revoked.
alter table public.wearable_health_imports enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_health_imports from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_health_imports to service_role;
alter table public.wearable_health_observations enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_health_observations from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_health_observations to service_role;
alter table public.wearable_health_daily enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_health_daily from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_health_daily to service_role;
alter table public.wearable_sleep_sessions enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_sleep_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_sleep_sessions to service_role;
alter table public.wearable_hrv_nightly_summaries enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_hrv_nightly_summaries from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_hrv_nightly_summaries to service_role;
alter table public.wearable_heart_rate_samples enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_heart_rate_samples from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_heart_rate_samples to service_role;
alter table public.wearable_hrv_nightly_samples enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_hrv_nightly_samples from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_hrv_nightly_samples to service_role;
alter table public.wearable_stress_samples enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_stress_samples from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_stress_samples to service_role;
alter table public.wearable_body_battery_samples enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_body_battery_samples from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_body_battery_samples to service_role;
alter table public.wearable_respiration_samples enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_respiration_samples from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_respiration_samples to service_role;
alter table public.wearable_spo2_samples enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_spo2_samples from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_spo2_samples to service_role;
alter table public.wearable_body_composition_measurements enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_body_composition_measurements from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_body_composition_measurements to service_role;
alter table public.wearable_vendor_insights enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_vendor_insights from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_vendor_insights to service_role;
alter table public.wearable_sleep_stage_intervals enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.wearable_sleep_stage_intervals from public, anon, authenticated;
grant select, insert, update, delete on public.wearable_sleep_stage_intervals to service_role;
revoke truncate, references, trigger on public.wearable_provider_raw_payloads from public, anon, authenticated;
grant select, insert on public.wearable_provider_raw_payloads to service_role;
do $grant_identity$
declare seq text;
begin
  for seq in
    select pg_get_serial_sequence(format('public.%I', t), 'id')
    from unnest(array['wearable_health_observations','wearable_heart_rate_samples',
      'wearable_hrv_nightly_samples','wearable_stress_samples','wearable_body_battery_samples',
      'wearable_respiration_samples','wearable_spo2_samples','wearable_sleep_stage_intervals']) t
  loop
    if seq is not null then execute format('grant usage on sequence %s to service_role', seq); end if;
  end loop;
end
$grant_identity$;

-- The shared raw table still serves the existing assisted/FIT paths. Protect
-- foundation evidence against browser key poisoning or later mutation without
-- revoking the unrelated raw DML contract or rewriting any old payload.
create function public.guard_garmin_foundation_raw_evidence()
returns trigger language plpgsql security invoker set search_path = ''
as $raw_guard$
begin
  if current_user <> 'service_role' then
    if (tg_op <> 'INSERT' and (old.foundation_record_key is not null or old.foundation_revision_hash is not null))
      or (tg_op <> 'DELETE' and (new.foundation_record_key is not null or new.foundation_revision_hash is not null)) then
      raise exception 'foundation evidence is server-owned' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$raw_guard$;
revoke all on function public.guard_garmin_foundation_raw_evidence() from public, anon, authenticated;
create trigger guard_garmin_foundation_raw_evidence
before insert or update or delete on public.wearable_provider_raw_payloads
for each row execute function public.guard_garmin_foundation_raw_evidence();

-- Snapshot pre-foundation evidence before adopting its projection. This is an
-- internal insert-only audit operation, not a general dynamic SQL facility.
create function public.archive_garmin_legacy_health_evidence(p_user_id uuid, p_table text, p_row jsonb)
returns void language plpgsql security invoker set search_path = ''
as $archive$
declare v_key text; v_hash text;
begin
  if p_row->>'ingestion_channel' in ('fit_manual_upload','garmin_activity_api') then
    raise exception 'FIT/activity evidence cannot be adopted by health foundation' using errcode = '22023';
  end if;
  if p_row->>'user_id' is distinct from p_user_id::text or p_row->>'provider' is distinct from 'garmin'
    or p_table is null or p_table not in ('wearable_health_daily','wearable_sleep_sessions','wearable_hrv_nightly_summaries',
      'wearable_heart_rate_samples','wearable_hrv_nightly_samples','wearable_stress_samples','wearable_body_battery_samples',
      'wearable_respiration_samples','wearable_spo2_samples','wearable_body_composition_measurements','wearable_vendor_insights',
      'wearable_sleep_stage_intervals') then
    raise exception 'invalid legacy health evidence ownership' using errcode = '22023';
  end if;
  if p_row->>'foundation_record_key' is not null then return; end if;
  v_key := 'legacy:' || p_table || ':' || (p_row->>'id');
  v_hash := encode(sha256(convert_to(p_row::text,'UTF8')),'hex');
  insert into public.wearable_provider_raw_payloads
    (user_id,provider,provider_mode,ingestion_channel,api_product,payload_type,raw_payload,
      source_asset_metadata,processing_status,parser_version,foundation_record_key,foundation_revision_hash)
  values (p_user_id,'garmin','manual_entry','admin_backfill',
    'health','legacy_foundation_snapshot',p_row,jsonb_build_object('table',p_table,'reason','preserved before foundation adoption',
      'original_provider_mode',p_row->'provider_mode','original_ingestion_channel',p_row->'ingestion_channel'),
    'normalized','enqidu.wearable.v1',v_key,v_hash)
  on conflict (user_id,provider,foundation_record_key,foundation_revision_hash)
    where foundation_record_key is not null do nothing;
end
$archive$;
revoke all on function public.archive_garmin_legacy_health_evidence(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.archive_garmin_legacy_health_evidence(uuid,text,jsonb) to service_role;

create function public.ingest_garmin_health_record(p_user_id uuid, p_record jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
as $foundation$
declare
  v_type text; v_date date; v_provider text; v_mode text; v_channel text;
  v_confidence text; v_source text; v_retrieved timestamptz; v_source_updated timestamptz;
  v_observed timestamptz; v_key text; v_hash text; v_raw_id uuid; v_import_id uuid;
  v_current public.wearable_health_imports%rowtype;
  v_prior public.wearable_health_imports%rowtype;
  v_metric_columns text[]; v_columns text[]; v_table text; v_projection_id uuid;
  v_data jsonb; v_legacy_data jsonb; v_item jsonb; v_value jsonb; v_field text;
  v_column_sql text; v_select_sql text; v_update_sql text; v_count int;
  v_sample_table text; v_sample_value text; v_sample_context boolean;
  v_sample_id bigint; v_unchanged boolean := false;
  v_seen_keys text[] := '{}'; v_ledger text[] := '{}';
  v_sample_keys text[] := '{}'; v_sample_key text; v_recorded timestamptz;
  v_number numeric; v_record_type text;
begin
  if p_user_id is null or p_record is null or jsonb_typeof(p_record) <> 'object'
    or p_record->>'schema_version' is distinct from 'enqidu.wearable.v1'
    or jsonb_typeof(p_record->'provenance') is distinct from 'object'
    or jsonb_typeof(p_record->'metrics') is distinct from 'object'
    or jsonb_typeof(p_record->'samples') is distinct from 'array'
    or jsonb_typeof(p_record->'stages') is distinct from 'array'
    or jsonb_typeof(p_record->'evidence') is distinct from 'object'
    or jsonb_typeof(p_record#>'{evidence,source_dto}') is distinct from 'object'
    or octet_length(p_record::text) > 5242880 then
    raise exception 'invalid canonical health envelope' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_record) k where k not in
    ('schema_version','data_type','calendar_date','timezone','observed_at','provenance','metrics','samples','stages','evidence')) then
    raise exception 'unexpected canonical envelope field' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_record->'provenance') k where k not in
    ('provider','provider_mode','ingestion_channel','source_identifier','retrieved_at','source_updated_at','data_confidence')) then
    raise exception 'unexpected provenance field' using errcode = '22023';
  end if;
  v_type := p_record->>'data_type';
  v_provider := p_record#>>'{provenance,provider}';
  v_mode := p_record#>>'{provenance,provider_mode}';
  v_channel := p_record#>>'{provenance,ingestion_channel}';
  v_confidence := p_record#>>'{provenance,data_confidence}';
  v_source := p_record#>>'{provenance,source_identifier}';
  if v_provider is distinct from 'garmin' or not coalesce(
    (v_mode = 'aggregator' and v_channel = 'fitness_ai_connector')
    or (v_mode = 'official_api' and v_channel = 'garmin_health_api'), false)
    or not coalesce(v_confidence = any(array['reported','user_verified','calculated','estimated','ocr_unverified','unknown']), false)
    or (coalesce(p_record#>'{provenance,source_identifier}','null'::jsonb)<>'null'::jsonb and jsonb_typeof(p_record#>'{provenance,source_identifier}')<>'string')
    or (v_source is not null and (length(btrim(v_source)) = 0 or v_source<>btrim(v_source) or length(v_source) > 2000)) then
    raise exception 'invalid Garmin provenance' using errcode = '22023';
  end if;
  if not coalesce(p_record->>'calendar_date' ~ '^\d{4}-\d{2}-\d{2}$', false)
    or not coalesce(p_record#>>'{provenance,retrieved_at}' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$', false) then
    raise exception 'date and retrieved_at require canonical ISO format' using errcode = '22023';
  end if;
  v_date := (p_record->>'calendar_date')::date;
  v_retrieved := (p_record#>>'{provenance,retrieved_at}')::timestamptz;
  if p_record->>'timezone' is not null and not exists
    (select 1 from pg_catalog.pg_timezone_names where name = p_record->>'timezone') then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;
  foreach v_field in array array['observed_at','source_updated_at'] loop
    v_value := case when v_field = 'observed_at' then p_record->v_field else p_record->'provenance'->v_field end;
    if v_value is not null and v_value <> 'null'::jsonb and
      (jsonb_typeof(v_value) <> 'string' or (v_value#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$') then
      raise exception 'invalid % timestamp', v_field using errcode = '22023';
    end if;
  end loop;
  v_observed := (p_record->>'observed_at')::timestamptz;
  v_source_updated := (p_record#>>'{provenance,source_updated_at}')::timestamptz;
  case v_type
    when 'daily_health' then v_metric_columns := array['resting_heart_rate_bpm','min_heart_rate_bpm','max_heart_rate_bpm','average_stress_level','max_stress_level','steps','intensity_minutes','active_kcal','bmr_kcal','distance_m','active_time_seconds','moderate_intensity_seconds','vigorous_intensity_seconds','steps_goal','intensity_goal_seconds','stress_duration_seconds','rest_stress_duration_seconds','activity_stress_duration_seconds','low_stress_duration_seconds','medium_stress_duration_seconds','high_stress_duration_seconds','stress_qualifier','body_battery_current','body_battery_charged','body_battery_drained','spo2_avg_pct','spo2_min_pct','respiration_avg_brpm','respiration_min_brpm']::text[];
    when 'sleep' then v_metric_columns := array['sleep_start_at','sleep_end_at','total_duration_seconds','deep_sleep_seconds','light_sleep_seconds','rem_sleep_seconds','awake_seconds','unmeasurable_seconds','sleep_score','restless_moments_count','respiration_variation_status','avg_sleep_heart_rate_bpm','resting_heart_rate_bpm','body_battery_change','spo2_avg_pct','spo2_min_pct','respiration_avg_brpm','respiration_min_brpm','hrv_last_night_avg_ms','hrv_last_night_5min_high_ms','skin_temperature_change_c']::text[];
    when 'hrv' then v_metric_columns := array['last_night_avg_ms','last_night_5min_high_ms','status']::text[];
    when 'stress' then v_metric_columns := array['average_stress_level','max_stress_level','stress_duration_seconds','rest_stress_duration_seconds','activity_stress_duration_seconds','low_stress_duration_seconds','medium_stress_duration_seconds','high_stress_duration_seconds','stress_qualifier']::text[];
    when 'body_battery' then v_metric_columns := array['body_battery_current','body_battery_charged','body_battery_drained']::text[];
    when 'respiration' then v_metric_columns := array['respiration_avg_brpm','respiration_min_brpm']::text[];
    when 'spo2' then v_metric_columns := array['spo2_avg_pct','spo2_min_pct']::text[];
    when 'heart_rate' then v_metric_columns := array['resting_heart_rate_bpm','min_heart_rate_bpm','max_heart_rate_bpm']::text[];
    when 'body_composition' then v_metric_columns := array['measured_at','weight_kg','body_fat_pct','body_water_pct','skeletal_muscle_mass_kg','bone_mass_kg','bmi']::text[];
    when 'vendor_insight' then v_metric_columns := array['insight_code','insight_domain','value_numeric','value_text','value_json','unit','vendor_calculated','api_availability']::text[];
    else raise exception 'unsupported canonical data_type' using errcode = '22023';
  end case;
  if exists (select 1 from jsonb_object_keys(p_record->'metrics') k where not k = any(v_metric_columns)) then
    raise exception 'unexpected metric field' using errcode = '22023';
  end if;
  -- Only declared canonical metric columns can reach a projection. Ownership,
  -- record keys and provenance are constructed separately below, never from metrics.
  for v_field, v_value in select * from jsonb_each(p_record->'metrics') loop
    if v_value = 'null'::jsonb then continue; end if;
    if v_field in ('stress_qualifier','respiration_variation_status','status','insight_code','insight_domain','value_text','unit','api_availability') then
      if jsonb_typeof(v_value) <> 'string' then raise exception 'invalid text metric' using errcode = '22023'; end if;
    elsif v_field in ('sleep_start_at','sleep_end_at','measured_at') then
      if jsonb_typeof(v_value) <> 'string' or (v_value#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$' then
        raise exception 'invalid metric timestamp' using errcode = '22023';
      end if;
      perform (v_value#>>'{}')::timestamptz;
    elsif v_field = 'vendor_calculated' then
      if v_value <> 'true'::jsonb then raise exception 'vendor insight must retain vendor semantics' using errcode = '22023'; end if;
    elsif v_field = 'value_json' then
      continue;
    else
      if jsonb_typeof(v_value) <> 'number' then raise exception 'invalid numeric metric' using errcode = '22023'; end if;
      v_number := (v_value#>>'{}')::numeric;
      if v_field not in ('body_battery_change','skin_temperature_change_c','value_numeric') and v_number < 0 then
        raise exception 'negative canonical metric' using errcode = '22023';
      end if;
      if (v_field like '%pct' or v_field in ('sleep_score','average_stress_level','max_stress_level','body_battery_current')) and v_number > 100 then
        raise exception 'canonical percent or score out of range' using errcode = '22023';
      end if;
      if v_field='body_battery_change' and abs(v_number)>100 then raise exception 'body battery change out of range' using errcode='22023'; end if;
      if v_field like '%heart_rate_bpm' and (v_number = 0 or v_number > 300) then raise exception 'heart rate out of range' using errcode = '22023'; end if;
      if v_field like '%seconds' or v_field in ('steps','steps_goal','intensity_minutes','restless_moments_count') then
        if v_number <> trunc(v_number) or v_number > 2147483647 then raise exception 'invalid integer metric' using errcode = '22023'; end if;
      end if;
    end if;
  end loop;
  if v_type = 'sleep' and (p_record#>>'{metrics,sleep_end_at}')::timestamptz <= (p_record#>>'{metrics,sleep_start_at}')::timestamptz then
    raise exception 'invalid sleep interval' using errcode = '22023';
  end if;
  v_key := v_type || ':' || v_date::text;
  if v_type = 'body_composition' then
    if p_record#>>'{metrics,measured_at}' is null then raise exception 'body composition requires measured_at' using errcode = '22023'; end if;
    v_key := v_type || ':' || ((p_record#>>'{metrics,measured_at}')::timestamptz at time zone 'UTC')::text;
  elsif v_type = 'vendor_insight' then
    if coalesce(p_record#>>'{metrics,insight_code}', '') = '' or
      (p_record#>>'{metrics,value_numeric}' is null and p_record#>>'{metrics,value_text}' is null and coalesce(p_record#>'{metrics,value_json}', 'null'::jsonb) = 'null'::jsonb) then
      raise exception 'vendor insight requires code and reported value' using errcode = '22023';
    end if;
    v_key := v_type || ':' || jsonb_build_array(p_record#>>'{metrics,insight_code}', coalesce(v_observed::text,v_date::text))::text;
  end if;
  -- Serialize per athlete/provider, including overlapping daily sample buckets.
  -- The unique indexes are a second guard; locks never depend on mutable source IDs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':garmin', 0));
  v_hash := encode(sha256(convert_to((p_record #- '{provenance,retrieved_at}' #- '{evidence,source_dto,retrieved_at}')::text, 'UTF8')), 'hex');
  insert into public.wearable_provider_raw_payloads
    (user_id, provider, provider_mode, ingestion_channel, api_product, payload_type,
     observation_date, raw_payload, source_asset_metadata, processing_status, parser_version,
     foundation_record_key, foundation_revision_hash)
  values (p_user_id, v_provider, v_mode, v_channel, 'health', v_type, v_date,
    p_record->'evidence', jsonb_build_object('provenance', p_record->'provenance', 'canonical_record', p_record),
    'normalized', 'enqidu.wearable.v1', v_key, v_hash)
  on conflict (user_id, provider, foundation_record_key, foundation_revision_hash)
    where foundation_record_key is not null do nothing
  returning id into v_raw_id;
  if v_raw_id is null then select id into strict v_raw_id from public.wearable_provider_raw_payloads
    where user_id = p_user_id and provider = v_provider and foundation_record_key = v_key and foundation_revision_hash = v_hash; end if;
  select * into v_current from public.wearable_health_imports
    where user_id = p_user_id and provider = v_provider and foundation_record_key = v_key for update;
  if found then
    if v_current.foundation_revision_hash = v_hash then
      v_unchanged := true;
      if v_retrieved <= v_current.retrieved_at then
        return jsonb_build_object('status','unchanged','health_import_id',v_current.id,'raw_payload_id',v_raw_id,'record_key',v_key);
      end if;
      -- A later fetch of identical facts can outrank an overlapping bucket's
      -- retrieval-only revision. Reproject without creating another raw revision.
    end if;
    if (v_current.source_updated_at is not null and (v_source_updated is null or v_source_updated < v_current.source_updated_at))
      or (v_source_updated is not null and v_current.source_updated_at is not null and v_source_updated = v_current.source_updated_at and v_retrieved < v_current.retrieved_at)
      or (v_current.source_updated_at is null and v_source_updated is null and v_retrieved < v_current.retrieved_at) then
      return jsonb_build_object('status','ignored_stale','health_import_id',v_current.id,'raw_payload_id',v_raw_id,'record_key',v_key);
    end if;
    v_import_id := v_current.id;
  else
    -- No blind backfill/deduplication of pre-foundation imports or historical data.
    v_import_id := gen_random_uuid();
  end if;
  -- Internal lifecycle metadata remembers every global sample key this full
  -- snapshot has ever covered. Its latest import chronology remains the authority
  -- after explicit nulls or omitted samples remove an objective projection.
  -- This ledger stores identity/absence only, never a biometric value.
  select coalesce(array_agg(distinct k), '{}'::text[]) into v_ledger from (
    select value as k from jsonb_array_elements_text(case
      when jsonb_typeof(v_current.source_asset_metadata->'foundation_sample_keys')='array'
      then v_current.source_asset_metadata->'foundation_sample_keys' else '[]'::jsonb end)
    union all
    select v_type || ':' || ((sample->>'recorded_at')::timestamptz at time zone 'UTC')::text ||
      case when v_type in ('heart_rate','respiration','spo2') then ':' || coalesce(sample->>'context','unknown') else '' end
      from jsonb_array_elements(p_record->'samples') sample
  ) keys where k is not null;
  v_record_type := case v_type when 'daily_health' then 'daily_summary' when 'body_composition' then 'weight' when 'spo2' then 'pulse_ox' when 'vendor_insight' then 'other' else v_type end;
  insert into public.wearable_health_imports
    (id,user_id,provider,provider_mode,ingestion_channel,health_record_type,observation_date,
     captured_at,source_reference,source_asset_metadata,raw_observation,normalized_payload,data_confidence,processing_status,
     raw_payload_id,foundation_record_key,retrieved_at,source_updated_at,observed_at,timezone,foundation_revision_hash)
  values (v_import_id,p_user_id,v_provider,v_mode,v_channel,v_record_type,v_date,v_retrieved,v_source,
    coalesce(v_current.source_asset_metadata,'{}'::jsonb) || jsonb_build_object('foundation_sample_keys',v_ledger),p_record->'evidence',p_record,v_confidence,'normalized',v_raw_id,v_key,v_retrieved,v_source_updated,v_observed,
    p_record->>'timezone',v_hash)
  on conflict (id) do update set
    provider_mode=excluded.provider_mode,ingestion_channel=excluded.ingestion_channel,observation_date=excluded.observation_date,
    captured_at=excluded.captured_at,source_reference=excluded.source_reference,source_asset_metadata=excluded.source_asset_metadata,
    raw_observation=excluded.raw_observation,normalized_payload=excluded.normalized_payload,
    data_confidence=excluded.data_confidence,raw_payload_id=excluded.raw_payload_id,
    retrieved_at=excluded.retrieved_at,source_updated_at=excluded.source_updated_at,
    observed_at=excluded.observed_at,timezone=excluded.timezone,foundation_revision_hash=excluded.foundation_revision_hash,
    updated_at=now();
  -- Summary/measurement projections use only their own metrics. Other series
  -- summary metrics remain authoritative in normalized_payload; no cross-type
  -- merge can erase or misattribute daily fields.
  v_table := case v_type when 'daily_health' then 'wearable_health_daily' when 'sleep' then 'wearable_sleep_sessions'
    when 'hrv' then 'wearable_hrv_nightly_summaries' when 'body_composition' then 'wearable_body_composition_measurements'
    when 'vendor_insight' then 'wearable_vendor_insights' else null end;
  if v_table is not null then
    v_columns := array['user_id','provider','ingestion_channel','health_import_id','foundation_record_key','raw_payload'];
    if v_type in ('daily_health','sleep','hrv','vendor_insight') then v_columns := v_columns || array['provider_mode','data_confidence']; end if;
    if v_type in ('daily_health','sleep','hrv') then v_columns := v_columns || array['calendar_date']; end if;
    if v_type = 'vendor_insight' then v_columns := v_columns || array['observation_date','observed_at']; end if;
    v_columns := v_columns || v_metric_columns;
    v_data := p_record->'metrics' || jsonb_build_object('user_id',p_user_id,'provider',v_provider,
      'provider_mode',v_mode,'ingestion_channel',v_channel,'health_import_id',v_import_id,
      'foundation_record_key',v_key,'raw_payload',p_record->'evidence','data_confidence',v_confidence,
      'calendar_date',v_date,'observation_date',v_date,'observed_at',v_observed);
    -- Adopt one existing summary rather than create a second channel row. Never
    -- silently merge two legacy rows, or overwrite a FIT/activity projection.
    if v_type in ('daily_health','sleep','hrv') then
      execute format('select count(*), (array_agg(id))[1] from public.%I where user_id=$1 and provider=$2 and calendar_date=$3',v_table)
        into v_count,v_projection_id using p_user_id,v_provider,v_date;
    elsif v_type = 'body_composition' then
      execute format('select count(*), (array_agg(id))[1] from public.%I where user_id=$1 and provider=$2 and measured_at=$3',v_table)
        into v_count,v_projection_id using p_user_id,v_provider,(p_record#>>'{metrics,measured_at}')::timestamptz;
    else
      execute format('select count(*), (array_agg(id))[1] from public.%I where user_id=$1 and provider=$2 and ($5 is not null or observation_date=$3) and insight_code=$4 and observed_at is not distinct from $5',v_table)
        into v_count,v_projection_id using p_user_id,v_provider,v_date,p_record#>>'{metrics,insight_code}',v_observed;
    end if;
    if v_count > 1 then raise exception 'ambiguous legacy health projection; audit required' using errcode = '21000'; end if;
    select string_agg(format('%I',c),','), string_agg(format('r.%I',c),','),
      string_agg(format('%I=excluded.%I',c,c),',')
      into v_column_sql,v_select_sql,v_update_sql from unnest(v_columns) c;
    if v_projection_id is not null then
      execute format('select to_jsonb(t) from public.%I t where id=$1',v_table) into v_legacy_data using v_projection_id;
      perform public.archive_garmin_legacy_health_evidence(p_user_id,v_table,v_legacy_data);
      -- Update only approved columns while preserving id, unrelated references,
      -- and all legacy raw revisions. This operation is transactional.
      select string_agg(format('%I=r.%I',c,c),',') into v_update_sql from unnest(v_columns) c;
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2',v_table,v_update_sql,v_table)
        using v_data,v_projection_id;
    else
      execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning id',v_table,v_column_sql,v_select_sql,v_table)
        into v_projection_id using v_data;
    end if;
  end if;
  v_sample_table := null;
  case v_type
    when 'heart_rate' then v_sample_table := 'wearable_heart_rate_samples'; v_sample_value := 'heart_rate_bpm'; v_sample_context := true;
    when 'hrv' then v_sample_table := 'wearable_hrv_nightly_samples'; v_sample_value := 'hrv_ms'; v_sample_context := false;
    when 'stress' then v_sample_table := 'wearable_stress_samples'; v_sample_value := 'stress_value'; v_sample_context := false;
    when 'body_battery' then v_sample_table := 'wearable_body_battery_samples'; v_sample_value := 'body_battery_value'; v_sample_context := false;
    when 'respiration' then v_sample_table := 'wearable_respiration_samples'; v_sample_value := 'breaths_per_minute'; v_sample_context := true;
    when 'spo2' then v_sample_table := 'wearable_spo2_samples'; v_sample_value := 'spo2_percent'; v_sample_context := true;
    else null;
  end case;
  if v_sample_table is null and jsonb_array_length(p_record->'samples') <> 0 then
    raise exception 'samples unsupported for data_type' using errcode = '22023';
  end if;
  if v_sample_table is not null then
    v_columns := array['user_id','provider','ingestion_channel','foundation_record_key','recorded_at',
      v_sample_value,'nominal_resolution_seconds','resolution_status','raw_payload'];
    if v_type = 'hrv' then v_columns := v_columns || array['hrv_summary_id'];
    else v_columns := v_columns || array['provider_mode','health_import_id']; end if;
    if v_sample_context then v_columns := v_columns || array['context']; end if;
    if v_type = 'stress' then v_columns := v_columns || array['stress_status']; end if;
    select string_agg(format('%I',c),','), string_agg(format('r.%I',c),','),
      string_agg(format('%I=excluded.%I',c,c),',')
      into v_column_sql,v_select_sql,v_update_sql from unnest(v_columns) c;
    for v_item in select value from jsonb_array_elements(p_record->'samples') loop
      if jsonb_typeof(v_item) <> 'object' or not coalesce(v_item->>'recorded_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$', false)
        or exists (select 1 from jsonb_object_keys(v_item) k where k not in
          (select unnest(array['recorded_at',v_sample_value,'nominal_resolution_seconds','resolution_status','raw_payload'] ||
            case when v_sample_context then array['context'] else '{}'::text[] end ||
            case when v_type='stress' then array['stress_status'] else '{}'::text[] end))) then
        raise exception 'invalid canonical sample' using errcode = '22023';
      end if;
      if v_item->v_sample_value is not null and v_item->v_sample_value <> 'null'::jsonb then
        if jsonb_typeof(v_item->v_sample_value) <> 'number' then raise exception 'invalid sample value' using errcode = '22023'; end if;
        v_number := (v_item->>v_sample_value)::numeric;
        if v_number < 0 or (v_type in ('spo2','stress','body_battery') and v_number > 100)
          or (v_type = 'heart_rate' and (v_number = 0 or v_number > 300)) then raise exception 'sample value out of range' using errcode = '22023'; end if;
      end if;
      if v_item->>'nominal_resolution_seconds' is not null and
        (jsonb_typeof(v_item->'nominal_resolution_seconds') <> 'number' or
        (v_item->>'nominal_resolution_seconds')::numeric <> trunc((v_item->>'nominal_resolution_seconds')::numeric) or
        (v_item->>'nominal_resolution_seconds')::numeric <= 0) then
        raise exception 'invalid sample cadence' using errcode = '22023';
      end if;
      v_recorded := (v_item->>'recorded_at')::timestamptz;
      v_sample_key := v_type || ':' || (v_recorded at time zone 'UTC')::text ||
        case when v_sample_context then ':' || coalesce(v_item->>'context','unknown') else '' end;
      if v_sample_key = any(v_seen_keys) then raise exception 'duplicate canonical sample timestamp' using errcode = '22023'; end if;
      v_seen_keys := array_append(v_seen_keys,v_sample_key);
      -- Explicit null is a durable withdrawal in the existing canonical envelope.
      -- Consult other managed buckets even when a newer null removed the objective
      -- row, so an old source version cannot resurrect a deleted biometric.
      if exists (
        select 1 from public.wearable_health_imports i
        where i.user_id=p_user_id and i.provider=v_provider and i.foundation_record_key is not null
          and i.id<>v_import_id and (i.source_asset_metadata->'foundation_sample_keys') ? v_sample_key
          and ((i.source_updated_at is not null and (v_source_updated is null or v_source_updated<i.source_updated_at))
            or (v_source_updated is not null and i.source_updated_at is not null and v_source_updated=i.source_updated_at and v_retrieved<i.retrieved_at)
            or (i.source_updated_at is null and v_source_updated is null and v_retrieved<i.retrieved_at))
      ) then continue; end if;
      v_data := v_item || jsonb_build_object('user_id',p_user_id,'provider',v_provider,'provider_mode',v_mode,
        'ingestion_channel',v_channel,'health_import_id',v_import_id,'hrv_summary_id',v_projection_id,
        'foundation_record_key',v_sample_key);
      -- Pre-foundation samples have no new key. Adopt one natural-time row;
      -- never append a second copy merely because transport/import changed.
      execute format('select count(*),(array_agg(id))[1] from public.%I where user_id=$1 and provider=$2 and recorded_at=$3%s',
        v_sample_table,case when v_sample_context then ' and context=$4' else '' end)
        into v_count,v_sample_id using p_user_id,v_provider,v_recorded,coalesce(v_item->>'context','unknown');
      if v_count > 1 then raise exception 'ambiguous legacy sample; audit required' using errcode = '21000'; end if;
      if v_type<>'stress' and coalesce(v_item->v_sample_value,'null'::jsonb)='null'::jsonb then
        if v_sample_id is not null then
          execute format('select to_jsonb(t) from public.%I t where id=$1',v_sample_table) into v_legacy_data using v_sample_id;
          perform public.archive_garmin_legacy_health_evidence(p_user_id,v_sample_table,v_legacy_data);
          execute format('delete from public.%I where id=$1',v_sample_table) using v_sample_id;
        end if;
        continue;
      end if;
      if v_sample_id is not null then
        execute format('select to_jsonb(t) from public.%I t where id=$1',v_sample_table) into v_legacy_data using v_sample_id;
        if v_legacy_data->>'foundation_record_key' is not null then
          if v_type = 'hrv' then
            select i.* into v_prior from public.wearable_hrv_nightly_summaries h
              join public.wearable_health_imports i on i.id=h.health_import_id
              where h.id=(v_legacy_data->>'hrv_summary_id')::uuid;
          else
            select * into v_prior from public.wearable_health_imports
              where id=(v_legacy_data->>'health_import_id')::uuid;
          end if;
          if v_prior.id is distinct from v_import_id and (
            (v_prior.source_updated_at is not null and (v_source_updated is null or v_source_updated < v_prior.source_updated_at))
            or (v_source_updated is not null and v_prior.source_updated_at is not null and v_source_updated = v_prior.source_updated_at and v_retrieved < v_prior.retrieved_at)
            or (v_prior.source_updated_at is null and v_source_updated is null and v_retrieved < v_prior.retrieved_at)) then
            continue;
          end if;
        end if;
        perform public.archive_garmin_legacy_health_evidence(p_user_id,v_sample_table,v_legacy_data);
        select string_agg(format('%I=r.%I',c,c),',') into v_update_sql from unnest(v_columns) c;
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2',v_sample_table,v_update_sql,v_sample_table)
          using v_data,v_sample_id;
      else
        select string_agg(format('%I=excluded.%I',c,c),',') into v_update_sql from unnest(v_columns) c;
        execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict (user_id,provider,foundation_record_key) where foundation_record_key is not null do update set %s',v_sample_table,v_column_sql,v_select_sql,v_sample_table,v_update_sql)
          using v_data;
      end if;
    end loop;
    -- Omitted keys are withdrawals too. Delete only managed projections whose
    -- identity this import previously covered and whose latest authority is this
    -- snapshot. A newer overlapping import (including a null/empty snapshot) wins.
    execute format('delete from public.%I t where t.user_id=$1 and t.provider=$2 and t.foundation_record_key=any($3)
      and not t.foundation_record_key=any($4) and not exists (
        select 1 from public.wearable_health_imports i where i.user_id=$1 and i.provider=$2
          and i.foundation_record_key is not null and i.id<>$5
          and (i.source_asset_metadata->''foundation_sample_keys'') ? t.foundation_record_key
          and ((i.source_updated_at is not null and ($6 is null or $6<i.source_updated_at))
            or ($6 is not null and i.source_updated_at is not null and $6=i.source_updated_at and $7<i.retrieved_at)
            or (i.source_updated_at is null and $6 is null and $7<i.retrieved_at)))',v_sample_table)
      using p_user_id,v_provider,v_ledger,v_seen_keys,v_import_id,v_source_updated,v_retrieved;
  end if;
  if v_type <> 'sleep' and jsonb_array_length(p_record->'stages') <> 0 then raise exception 'stages require sleep record' using errcode = '22023'; end if;
  if v_type = 'sleep' then
    v_sample_keys := '{}';
    for v_item in select value from jsonb_array_elements(p_record->'stages') loop
      if jsonb_typeof(v_item) <> 'object' or exists (select 1 from jsonb_object_keys(v_item) k where k not in
          ('stage_code','interval_start_at','interval_end_at','duration_seconds','raw_payload')) or
        not coalesce(v_item->>'interval_start_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$', false) or
        not coalesce(v_item->>'interval_end_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$', false) then
        raise exception 'invalid sleep stage interval' using errcode = '22023';
      end if;
      v_sample_key := v_key || ':' || ((v_item->>'interval_start_at')::timestamptz at time zone 'UTC')::text;
      if v_sample_key = any(v_sample_keys) then raise exception 'duplicate sleep interval' using errcode = '22023'; end if;
      v_sample_keys := array_append(v_sample_keys,v_sample_key);
      select count(*),(array_agg(id))[1] into v_count,v_sample_id from public.wearable_sleep_stage_intervals
        where user_id=p_user_id and sleep_session_id=v_projection_id and interval_start_at=(v_item->>'interval_start_at')::timestamptz;
      if v_count > 1 then raise exception 'ambiguous legacy sleep stage; audit required' using errcode = '21000'; end if;
      if v_sample_id is not null then
        select to_jsonb(t) into v_legacy_data from public.wearable_sleep_stage_intervals t where id=v_sample_id;
        perform public.archive_garmin_legacy_health_evidence(p_user_id,'wearable_sleep_stage_intervals',v_legacy_data);
        update public.wearable_sleep_stage_intervals set
          foundation_record_key=v_sample_key,stage_code=v_item->>'stage_code',
          interval_end_at=(v_item->>'interval_end_at')::timestamptz,
          ingestion_channel=v_channel,data_confidence=v_confidence,raw_payload=v_item->'raw_payload'
          where id=v_sample_id;
      else
        insert into public.wearable_sleep_stage_intervals
          (user_id,sleep_session_id,provider,ingestion_channel,stage_code,interval_start_at,interval_end_at,data_confidence,raw_payload,foundation_record_key)
        values (p_user_id,v_projection_id,v_provider,v_channel,v_item->>'stage_code',
          (v_item->>'interval_start_at')::timestamptz,(v_item->>'interval_end_at')::timestamptz,v_confidence,
          v_item->'raw_payload',v_sample_key)
        on conflict (user_id,provider,foundation_record_key) where foundation_record_key is not null do update set
          stage_code=excluded.stage_code,interval_end_at=excluded.interval_end_at,
          ingestion_channel=excluded.ingestion_channel,data_confidence=excluded.data_confidence,raw_payload=excluded.raw_payload;
      end if;
    end loop;
    delete from public.wearable_sleep_stage_intervals where sleep_session_id=v_projection_id
      and foundation_record_key is not null and not foundation_record_key=any(v_sample_keys);
  end if;
  return jsonb_build_object('status',case when v_current.id is null then 'inserted' when v_unchanged then 'unchanged' else 'updated' end,
    'health_import_id',v_import_id,'raw_payload_id',v_raw_id,'record_key',v_key);
end
$foundation$;

revoke all on function public.ingest_garmin_health_record(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ingest_garmin_health_record(uuid,jsonb) to service_role;

commit;

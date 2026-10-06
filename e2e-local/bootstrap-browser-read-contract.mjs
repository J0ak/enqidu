import { spawnSync } from "node:child_process";

// Disposable E2E compatibility fixture for pre-existing Activity detail reads.
// Provenance: src/main.jsx loadActivityDetail, fetchAllSessionSamples,
// fetchAllFitRecordSamples, fetchFitSessionPayload, fetchHeartRateZoneProfile;
// src/main.jsx fetchCanonicalTrainingSession. These columns predate
// this epic and are absent from the deliberately slim local baseline.
// This is NOT a product migration and cannot target remote infrastructure.
const dockerEnv = { ...process.env };
for (const name of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete dockerEnv[name];
const sql = `
begin;
alter table public.training_sessions
  add column if not exists canonical_session jsonb,
  add column if not exists summary_metrics jsonb,
  add column if not exists completion_score numeric,
  add column if not exists universal_schema_version text;
alter table public.fit_message_payloads add column if not exists message_order integer;
alter table public.session_samples add column if not exists sample_order integer,
  add column if not exists raw_payload jsonb, add column if not exists heart_rate_bpm numeric,
  add column if not exists temperature_c numeric;
alter table public.session_blocks add column if not exists temporal_metrics_source text,
  add column if not exists temporal_metrics_confidence text,
  add column if not exists order_index integer, add column if not exists block_format text,
  add column if not exists primary_measurement_type text, add column if not exists time_cap_s numeric,
  add column if not exists summary_metrics jsonb;
alter table public.session_laps add column if not exists source text,
  add column if not exists start_elapsed_seconds numeric, add column if not exists end_elapsed_seconds numeric,
  add column if not exists active_seconds numeric, add column if not exists rest_seconds numeric,
  add column if not exists heart_rate_avg_bpm numeric, add column if not exists heart_rate_max_bpm numeric,
  add column if not exists raw_payload jsonb;
create table if not exists public.block_items (
  id uuid primary key default gen_random_uuid(), block_id uuid not null references public.session_blocks(id) on delete cascade,
  order_index integer, item_type text, item_name text, station_label text, round_index integer, minute_slot integer,
  duration_s numeric, rest_s numeric, summary_metrics jsonb
);
create table if not exists public.session_garmin_sets (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.training_sessions(id) on delete cascade,
  source text, series_order integer, garmin_exercise_name text, start_elapsed_seconds numeric, end_elapsed_seconds numeric,
  duration_seconds numeric, active_seconds numeric, rest_seconds numeric, repetitions numeric, load_value numeric,
  load_unit text, heart_rate_avg_bpm numeric, heart_rate_max_bpm numeric, raw_payload jsonb, confidence text
);
create table if not exists public.enkidu_conversation_enrichments (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.training_sessions(id) on delete cascade,
  payload jsonb, enrichment_status text, created_at timestamptz default now()
);
create table if not exists public.user_heart_rate_zone_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  label text, source text, max_heart_rate numeric, zones jsonb, is_active boolean default true, updated_at timestamptz default now()
);
alter table public.block_items enable row level security;
alter table public.session_garmin_sets enable row level security;
alter table public.enkidu_conversation_enrichments enable row level security;
alter table public.user_heart_rate_zone_profiles enable row level security;
drop policy if exists "local_own_block_read" on public.block_items;
create policy "local_own_block_read" on public.block_items for select to authenticated using (
  exists (select 1 from public.session_blocks b join public.training_sessions s on s.id = b.session_id where b.id = block_id and s.user_id = auth.uid())
);
drop policy if exists "local_own_session_read" on public.session_garmin_sets;
create policy "local_own_session_read" on public.session_garmin_sets for select to authenticated using (
  exists (select 1 from public.training_sessions s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "local_own_session_read" on public.enkidu_conversation_enrichments;
create policy "local_own_session_read" on public.enkidu_conversation_enrichments for select to authenticated using (
  exists (select 1 from public.training_sessions s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "local_own_profile_read" on public.user_heart_rate_zone_profiles;
create policy "local_own_profile_read" on public.user_heart_rate_zone_profiles for select to authenticated using (user_id = auth.uid());
grant select on public.block_items, public.session_garmin_sets, public.enkidu_conversation_enrichments, public.user_heart_rate_zone_profiles to authenticated;
commit;
notify pgrst, 'reload schema';
`;
const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", "supabase_db_enqidu-e2e", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", env: dockerEnv });
if (result.status !== 0) throw new Error(`Disposable browser fixture failed: ${result.stderr || result.error?.message}`);
console.log("Disposable browser read contract ready; no product migrations or remote changes.");

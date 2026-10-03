-- Reconstruct the pre-migration ENQIDU contract for fresh local projects.
-- Every object is additive/idempotent because these tables predate this repository's migration history.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, experience_level text, primary_goal text,
  disciplines text[] default '{}', usual_environment text[] default '{}', considerations text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text, description text, goal_type text, priority integer, target_value numeric, target_unit text,
  target_date date, status text default 'active', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.user_training_locations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  display_name text, location_type text, access_mode text, prescription_scope text,
  coached_sessions_available boolean default false, notes text, is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(), name text not null, equipment_category text,
  equipment_type text, unit text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.user_equipment (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id uuid not null references public.equipment_catalog(id), quantity numeric, unit text,
  location_label text, available boolean default true, availability_notes text, valid_from date, valid_to date,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.user_memory (
  user_id uuid primary key references auth.users(id) on delete cascade, stable_context text, recent_context text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.training_sources (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  source_type text, source_name text, provider text, external_id text, file_name text, file_hash text,
  imported_at timestamptz default now(), raw_metadata jsonb default '{}'::jsonb, created_at timestamptz default now()
);
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.training_sources(id), session_date date, local_date date, session_status text default 'completed', data_quality_status text, tags text[] default '{}', external_reference text, session_structure jsonb default '{}'::jsonb, started_at timestamptz, ended_at timestamptz,
  title text, sport text, subsport text, activity_type text, raw_garmin_activity_type text,
  duration_seconds integer, moving_duration_seconds integer, distance_meters numeric, elevation_gain_meters numeric,
  calories_total numeric, average_heart_rate numeric, max_heart_rate numeric, training_load numeric,
  perceived_exertion numeric, notes text, location_name text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.session_blocks (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.training_sessions(id) on delete cascade,
  block_order integer, block_type text, title text, started_at timestamptz, ended_at timestamptz,
  duration_seconds integer, distance_meters numeric, rounds integer, notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.session_exercises (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.training_sessions(id) on delete cascade,
  block_id uuid references public.session_blocks(id) on delete cascade, exercise_order integer, name text,
  category text, sets integer, reps numeric, load_kg numeric, distance_meters numeric, duration_seconds integer,
  notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.session_metrics (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.training_sessions(id) on delete cascade,
  metric_code text not null, value_numeric numeric, value_text text, unit text, created_at timestamptz default now()
);
create table if not exists public.session_laps (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.training_sessions(id) on delete cascade,
  lap_index integer, started_at timestamptz, duration_seconds integer, distance_meters numeric,
  average_heart_rate numeric, max_heart_rate numeric, created_at timestamptz default now()
);
create table if not exists public.session_samples (
  id bigint generated by default as identity primary key, session_id uuid not null references public.training_sessions(id) on delete cascade,
  recorded_at timestamptz, elapsed_seconds numeric, heart_rate numeric, cadence numeric, speed_mps numeric,
  distance_meters numeric, altitude_meters numeric, power_watts numeric, payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create table if not exists public.fit_message_payloads (
  id uuid primary key default gen_random_uuid(), session_id uuid references public.training_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, message_type text, message_index integer,
  payload jsonb default '{}'::jsonb, created_at timestamptz default now()
);
create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null, weekly_focus text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), provider text, model_code text,
  feature_code text, execution_context text, input_tokens integer, output_tokens integer, reasoning_tokens integer,
  cached_input_tokens integer, calls_count integer, cost_status text, occurred_at timestamptz, usage_payload jsonb,
  training_session_id uuid, request_reference text, created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.user_goals enable row level security;
alter table public.user_training_locations enable row level security;
alter table public.user_equipment enable row level security;
alter table public.user_memory enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_sources enable row level security;

do $$ declare t text; begin
  foreach t in array array['profiles','user_goals','user_training_locations','user_equipment','user_memory','training_sessions','training_sources'] loop
    execute format('drop policy if exists "Users read own %s" on public.%I', t, t);
    execute format('create policy "Users read own %s" on public.%I for select to authenticated using (%s = auth.uid())', t, t, case when t = 'profiles' then 'id' else 'user_id' end);
  end loop;
end $$;
grant select on public.profiles, public.user_goals, public.user_training_locations, public.equipment_catalog,
  public.user_equipment, public.user_memory, public.training_sessions, public.training_sources,
  public.session_blocks, public.session_exercises, public.session_metrics, public.session_laps, public.weekly_plans to authenticated;

-- Columns used by the legacy pilot migrations that follow in chronological order.
alter table public.training_sources add column if not exists source_system text, add column if not exists source_version text,
  add column if not exists import_status text, add column if not exists provenance jsonb default '{}'::jsonb;
alter table public.training_sessions add column if not exists session_kind text, add column if not exists programming_mode text,
  add column if not exists load_decision_owner text;
alter table public.session_blocks add column if not exists name text, add column if not exists active_seconds integer,
  add column if not exists rest_seconds integer, add column if not exists start_elapsed_seconds numeric,
  add column if not exists end_elapsed_seconds numeric, add column if not exists heart_rate_avg_bpm numeric,
  add column if not exists heart_rate_max_bpm numeric, add column if not exists rounds_completed numeric,
  add column if not exists prescription jsonb default '{}'::jsonb, add column if not exists execution_notes text,
  add column if not exists data_confidence text;
alter table public.session_exercises add column if not exists reported_name text, add column if not exists execution_type text,
  add column if not exists sets_completed numeric, add column if not exists rounds_completed numeric,
  add column if not exists reps_per_set jsonb, add column if not exists load_value numeric, add column if not exists load_unit text,
  add column if not exists equipment_snapshot jsonb default '{}'::jsonb, add column if not exists tempo_or_pause text,
  add column if not exists side text, add column if not exists data_confidence text;
alter table public.session_metrics add column if not exists metric_name text, add column if not exists value_json jsonb,
  add column if not exists metric_scope text default 'session', add column if not exists scope_reference text default '',
  add column if not exists source_path text default '', add column if not exists confidence text;
create unique index if not exists session_metrics_logical_key on public.session_metrics(session_id,metric_code,metric_scope,scope_reference,source_path);

-- Incremental Garmin/FIT objective series layer.
-- Non-destructive: creates new tables/indexes only. Does not update/delete existing data.

create table if not exists public.session_garmin_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  source text not null default 'garmin_fit',
  series_order integer not null,
  garmin_exercise_name text,
  start_elapsed_seconds integer,
  end_elapsed_seconds integer,
  duration_seconds integer,
  active_seconds integer,
  work_seconds integer generated always as (active_seconds) stored,
  rest_seconds integer,
  repetitions integer,
  load_value numeric,
  load_unit text,
  heart_rate_avg_bpm integer,
  heart_rate_max_bpm integer,
  raw_payload jsonb not null default '{}'::jsonb,
  confidence text not null default 'reported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_garmin_sets_order_unique unique (session_id, source, series_order),
  constraint session_garmin_sets_elapsed_check check (
    start_elapsed_seconds is null
    or end_elapsed_seconds is null
    or end_elapsed_seconds >= start_elapsed_seconds
  )
);

create index if not exists session_garmin_sets_session_order_idx
  on public.session_garmin_sets (session_id, series_order);

create index if not exists session_garmin_sets_session_window_idx
  on public.session_garmin_sets (session_id, start_elapsed_seconds, end_elapsed_seconds);

create table if not exists public.session_block_garmin_series_map (
  id uuid primary key default gen_random_uuid(),
  session_block_id uuid not null references public.session_blocks(id) on delete cascade,
  garmin_series_id uuid not null references public.session_garmin_sets(id) on delete cascade,
  confidence numeric not null default 0,
  mapping_source text not null check (mapping_source in ('user_confirmed', 'ai_suggested', 'rule_based')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_block_garmin_series_map_unique unique (session_block_id, garmin_series_id)
);

create index if not exists session_block_garmin_series_map_block_idx
  on public.session_block_garmin_series_map (session_block_id);

create index if not exists session_block_garmin_series_map_series_idx
  on public.session_block_garmin_series_map (garmin_series_id);

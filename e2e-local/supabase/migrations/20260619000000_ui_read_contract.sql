-- Local-only read contract needed by the mounted UI during authenticated E2E.
-- These empty tables/columns prevent expected production reads from becoming noisy 4xx
-- responses while keeping all browser access read-only under RLS.

alter table public.profiles
  add column if not exists weekly_days integer,
  add column if not exists typical_minutes integer,
  add column if not exists uses_wearables boolean not null default false;

alter table public.training_sessions
  add column if not exists summary_metrics jsonb not null default '{}'::jsonb;

alter table public.training_sources
  add column if not exists original_filename text;

create table if not exists public.wearable_health_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_date date not null,
  resting_heart_rate_bpm numeric,
  steps integer,
  intensity_minutes integer,
  active_kcal numeric,
  average_stress_level numeric,
  body_battery_current numeric,
  spo2_avg_pct numeric,
  respiration_avg_brpm numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.user_wearable_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text,
  connection_status text,
  sync_mode text,
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wearable_sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_date date not null,
  total_duration_seconds integer,
  deep_sleep_seconds integer,
  light_sleep_seconds integer,
  rem_sleep_seconds integer,
  awake_seconds integer,
  sleep_score numeric,
  avg_sleep_heart_rate_bpm numeric,
  resting_heart_rate_bpm numeric,
  body_battery_change numeric,
  spo2_avg_pct numeric,
  spo2_min_pct numeric,
  respiration_avg_brpm numeric,
  hrv_last_night_avg_ms numeric,
  hrv_last_night_5min_high_ms numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.wearable_hrv_nightly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_date date not null,
  last_night_avg_ms numeric,
  last_night_5min_high_ms numeric,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.wearable_body_battery_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null,
  body_battery_value numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.wearable_stress_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null,
  stress_value numeric,
  stress_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.wearable_respiration_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null,
  breaths_per_minute numeric,
  context text,
  created_at timestamptz not null default now()
);

create table if not exists public.wearable_spo2_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null,
  spo2_percent numeric,
  context text,
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'wearable_health_daily',
    'user_wearable_connections',
    'wearable_sleep_sessions',
    'wearable_hrv_nightly_summaries',
    'wearable_body_battery_samples',
    'wearable_stress_samples',
    'wearable_respiration_samples',
    'wearable_spo2_samples'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Users read own %s" on public.%I', t, t);
    execute format(
      'create policy "Users read own %s" on public.%I for select to authenticated using (user_id = auth.uid())',
      t,
      t
    );
  end loop;
end
$$;

grant select on
  public.wearable_health_daily,
  public.user_wearable_connections,
  public.wearable_sleep_sessions,
  public.wearable_hrv_nightly_summaries,
  public.wearable_body_battery_samples,
  public.wearable_stress_samples,
  public.wearable_respiration_samples,
  public.wearable_spo2_samples
to authenticated;

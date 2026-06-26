-- ENQIDU Coach Context schema v0.
-- Prepared migration only: creates new coach_* tables, conservative RLS, and
-- local traceability surfaces. Does not touch Garmin/FIT, planned sessions,
-- existing Edge Functions, auth runtime, or existing tables.

create table if not exists public.coach_athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  fixture_user text null,
  display_name text null,
  profile_type text not null default 'fixture',
  product text not null default 'ENQIDU',
  source_key text not null,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_athlete_profiles_owner_check check (
    user_id is not null or fixture_user is not null
  ),
  constraint coach_athlete_profiles_profile_type_check check (
    profile_type in ('fixture', 'user', 'demo')
  ),
  constraint coach_athlete_profiles_product_check check (product = 'ENQIDU')
);

create table if not exists public.coach_athlete_training_goals (
  id uuid primary key default gen_random_uuid(),
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  goal_type text not null default 'training',
  priority text null,
  description text null,
  source_key text not null,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_athlete_training_goals_owner_check check (
    user_id is not null or fixture_user is not null
  )
);

create table if not exists public.coach_athlete_constraints (
  id uuid primary key default gen_random_uuid(),
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  constraint_type text not null default 'general',
  severity text null,
  description text null,
  active boolean not null default true,
  source_key text not null,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_athlete_constraints_owner_check check (
    user_id is not null or fixture_user is not null
  )
);

create table if not exists public.coach_equipment_locations (
  id uuid primary key default gen_random_uuid(),
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  location_id text not null,
  location_type text not null,
  label text null,
  constraints jsonb not null default '{}'::jsonb,
  source_key text not null,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_equipment_locations_owner_check check (
    user_id is not null or fixture_user is not null
  )
);

create table if not exists public.coach_equipment_items (
  id uuid primary key default gen_random_uuid(),
  equipment_location_id uuid not null references public.coach_equipment_locations(id) on delete cascade,
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  item_id text null,
  category text null,
  name text not null,
  quantity numeric null,
  unit text null,
  value jsonb null,
  raw_path text null,
  source_key text not null,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_equipment_items_owner_check check (
    user_id is not null or fixture_user is not null
  )
);

create table if not exists public.coach_context_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  fixture_user text null,
  source_key text not null,
  source_type text not null,
  raw_file text null,
  normalized_file text null,
  role text null,
  checksum text null,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_context_sources_owner_check check (
    user_id is not null or fixture_user is not null
  ),
  constraint coach_context_sources_type_check check (
    source_type in ('raw_json', 'normalized_json', 'seed_plan', 'manual')
  )
);

create table if not exists public.coach_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  snapshot_type text not null default 'normalized_context',
  schema_version text not null,
  source_key text not null,
  payload jsonb not null default '{}'::jsonb,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_context_snapshots_owner_check check (
    user_id is not null or fixture_user is not null
  )
);

create table if not exists public.coach_session_fixtures (
  id uuid primary key default gen_random_uuid(),
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  source_key text not null,
  session_date date null,
  title text null,
  sport text null,
  session_type text null,
  intent_type text null,
  location_type text null,
  duration_seconds integer null,
  distance_meters numeric null,
  calories_total numeric null,
  raw_source_file text null,
  normalized_source_file text null,
  payload jsonb not null default '{}'::jsonb,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_fixtures_owner_check check (
    user_id is not null or fixture_user is not null
  )
);

create table if not exists public.coach_session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_fixture_id uuid not null references public.coach_session_fixtures(id) on delete cascade,
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  source_key text not null,
  block_index integer not null,
  block_type text null,
  title text null,
  payload jsonb not null default '{}'::jsonb,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_blocks_owner_check check (
    user_id is not null or fixture_user is not null
  ),
  constraint coach_session_blocks_index_check check (block_index > 0)
);

create table if not exists public.coach_session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_fixture_id uuid not null references public.coach_session_fixtures(id) on delete cascade,
  block_id uuid null references public.coach_session_blocks(id) on delete set null,
  athlete_profile_id uuid not null references public.coach_athlete_profiles(id) on delete cascade,
  user_id uuid null,
  fixture_user text null,
  source_key text not null,
  exercise_index integer not null,
  name text null,
  category text null,
  sets jsonb null,
  metrics jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  source_traceability jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_exercises_owner_check check (
    user_id is not null or fixture_user is not null
  ),
  constraint coach_session_exercises_index_check check (exercise_index > 0)
);

create table if not exists public.coach_seed_runs (
  id uuid primary key default gen_random_uuid(),
  seed_key text not null,
  mode text not null,
  fixture_user text null,
  status text not null default 'draft',
  input_plan jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_seed_runs_mode_check check (
    mode in ('dry_run', 'planned', 'applied', 'rolled_back')
  ),
  constraint coach_seed_runs_status_check check (
    status in ('draft', 'success', 'failed', 'skipped')
  )
);

create index if not exists coach_athlete_profiles_user_idx
on public.coach_athlete_profiles(user_id);
create index if not exists coach_athlete_profiles_fixture_idx
on public.coach_athlete_profiles(fixture_user);
create index if not exists coach_athlete_profiles_source_key_idx
on public.coach_athlete_profiles(source_key);
create unique index if not exists coach_athlete_profiles_fixture_source_key_uidx
on public.coach_athlete_profiles(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_athlete_profiles_user_source_key_uidx
on public.coach_athlete_profiles(user_id, source_key)
where user_id is not null;

create index if not exists coach_athlete_training_goals_profile_idx
on public.coach_athlete_training_goals(athlete_profile_id);
create index if not exists coach_athlete_training_goals_user_idx
on public.coach_athlete_training_goals(user_id);
create index if not exists coach_athlete_training_goals_fixture_idx
on public.coach_athlete_training_goals(fixture_user);
create unique index if not exists coach_athlete_training_goals_fixture_source_key_uidx
on public.coach_athlete_training_goals(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_athlete_training_goals_user_source_key_uidx
on public.coach_athlete_training_goals(user_id, source_key)
where user_id is not null;

create index if not exists coach_athlete_constraints_profile_idx
on public.coach_athlete_constraints(athlete_profile_id);
create index if not exists coach_athlete_constraints_user_idx
on public.coach_athlete_constraints(user_id);
create index if not exists coach_athlete_constraints_fixture_idx
on public.coach_athlete_constraints(fixture_user);
create unique index if not exists coach_athlete_constraints_fixture_source_key_uidx
on public.coach_athlete_constraints(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_athlete_constraints_user_source_key_uidx
on public.coach_athlete_constraints(user_id, source_key)
where user_id is not null;

create index if not exists coach_equipment_locations_profile_idx
on public.coach_equipment_locations(athlete_profile_id);
create index if not exists coach_equipment_locations_user_idx
on public.coach_equipment_locations(user_id);
create index if not exists coach_equipment_locations_fixture_idx
on public.coach_equipment_locations(fixture_user);
create unique index if not exists coach_equipment_locations_fixture_source_key_uidx
on public.coach_equipment_locations(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_equipment_locations_user_source_key_uidx
on public.coach_equipment_locations(user_id, source_key)
where user_id is not null;

create index if not exists coach_equipment_items_location_idx
on public.coach_equipment_items(equipment_location_id);
create index if not exists coach_equipment_items_profile_idx
on public.coach_equipment_items(athlete_profile_id);
create index if not exists coach_equipment_items_user_idx
on public.coach_equipment_items(user_id);
create index if not exists coach_equipment_items_fixture_idx
on public.coach_equipment_items(fixture_user);
create unique index if not exists coach_equipment_items_fixture_source_key_uidx
on public.coach_equipment_items(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_equipment_items_user_source_key_uidx
on public.coach_equipment_items(user_id, source_key)
where user_id is not null;

create index if not exists coach_context_sources_user_idx
on public.coach_context_sources(user_id);
create index if not exists coach_context_sources_fixture_idx
on public.coach_context_sources(fixture_user);
create index if not exists coach_context_sources_source_key_idx
on public.coach_context_sources(source_key);
create unique index if not exists coach_context_sources_fixture_source_key_uidx
on public.coach_context_sources(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_context_sources_user_source_key_uidx
on public.coach_context_sources(user_id, source_key)
where user_id is not null;

create index if not exists coach_context_snapshots_profile_idx
on public.coach_context_snapshots(athlete_profile_id);
create index if not exists coach_context_snapshots_user_idx
on public.coach_context_snapshots(user_id);
create index if not exists coach_context_snapshots_fixture_idx
on public.coach_context_snapshots(fixture_user);
create unique index if not exists coach_context_snapshots_fixture_source_key_uidx
on public.coach_context_snapshots(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_context_snapshots_user_source_key_uidx
on public.coach_context_snapshots(user_id, source_key)
where user_id is not null;

create index if not exists coach_session_fixtures_profile_idx
on public.coach_session_fixtures(athlete_profile_id);
create index if not exists coach_session_fixtures_user_idx
on public.coach_session_fixtures(user_id);
create index if not exists coach_session_fixtures_fixture_idx
on public.coach_session_fixtures(fixture_user);
create index if not exists coach_session_fixtures_date_idx
on public.coach_session_fixtures(session_date);
create unique index if not exists coach_session_fixtures_fixture_source_key_uidx
on public.coach_session_fixtures(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_session_fixtures_user_source_key_uidx
on public.coach_session_fixtures(user_id, source_key)
where user_id is not null;

create index if not exists coach_session_blocks_session_idx
on public.coach_session_blocks(session_fixture_id);
create index if not exists coach_session_blocks_profile_idx
on public.coach_session_blocks(athlete_profile_id);
create index if not exists coach_session_blocks_user_idx
on public.coach_session_blocks(user_id);
create index if not exists coach_session_blocks_fixture_idx
on public.coach_session_blocks(fixture_user);
create unique index if not exists coach_session_blocks_fixture_source_key_uidx
on public.coach_session_blocks(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_session_blocks_user_source_key_uidx
on public.coach_session_blocks(user_id, source_key)
where user_id is not null;

create index if not exists coach_session_exercises_session_idx
on public.coach_session_exercises(session_fixture_id);
create index if not exists coach_session_exercises_block_idx
on public.coach_session_exercises(block_id);
create index if not exists coach_session_exercises_profile_idx
on public.coach_session_exercises(athlete_profile_id);
create index if not exists coach_session_exercises_user_idx
on public.coach_session_exercises(user_id);
create index if not exists coach_session_exercises_fixture_idx
on public.coach_session_exercises(fixture_user);
create unique index if not exists coach_session_exercises_fixture_source_key_uidx
on public.coach_session_exercises(fixture_user, source_key)
where fixture_user is not null;
create unique index if not exists coach_session_exercises_user_source_key_uidx
on public.coach_session_exercises(user_id, source_key)
where user_id is not null;

create index if not exists coach_seed_runs_fixture_idx
on public.coach_seed_runs(fixture_user);
create unique index if not exists coach_seed_runs_seed_key_uidx
on public.coach_seed_runs(seed_key);

create or replace function public.coach_context_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_athlete_profiles_updated_at on public.coach_athlete_profiles;
create trigger coach_athlete_profiles_updated_at
before update on public.coach_athlete_profiles
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_athlete_training_goals_updated_at on public.coach_athlete_training_goals;
create trigger coach_athlete_training_goals_updated_at
before update on public.coach_athlete_training_goals
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_athlete_constraints_updated_at on public.coach_athlete_constraints;
create trigger coach_athlete_constraints_updated_at
before update on public.coach_athlete_constraints
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_equipment_locations_updated_at on public.coach_equipment_locations;
create trigger coach_equipment_locations_updated_at
before update on public.coach_equipment_locations
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_equipment_items_updated_at on public.coach_equipment_items;
create trigger coach_equipment_items_updated_at
before update on public.coach_equipment_items
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_context_sources_updated_at on public.coach_context_sources;
create trigger coach_context_sources_updated_at
before update on public.coach_context_sources
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_context_snapshots_updated_at on public.coach_context_snapshots;
create trigger coach_context_snapshots_updated_at
before update on public.coach_context_snapshots
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_session_fixtures_updated_at on public.coach_session_fixtures;
create trigger coach_session_fixtures_updated_at
before update on public.coach_session_fixtures
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_session_blocks_updated_at on public.coach_session_blocks;
create trigger coach_session_blocks_updated_at
before update on public.coach_session_blocks
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_session_exercises_updated_at on public.coach_session_exercises;
create trigger coach_session_exercises_updated_at
before update on public.coach_session_exercises
for each row execute function public.coach_context_set_updated_at();

drop trigger if exists coach_seed_runs_updated_at on public.coach_seed_runs;
create trigger coach_seed_runs_updated_at
before update on public.coach_seed_runs
for each row execute function public.coach_context_set_updated_at();

alter table public.coach_athlete_profiles enable row level security;
alter table public.coach_athlete_training_goals enable row level security;
alter table public.coach_athlete_constraints enable row level security;
alter table public.coach_equipment_locations enable row level security;
alter table public.coach_equipment_items enable row level security;
alter table public.coach_context_sources enable row level security;
alter table public.coach_context_snapshots enable row level security;
alter table public.coach_session_fixtures enable row level security;
alter table public.coach_session_blocks enable row level security;
alter table public.coach_session_exercises enable row level security;
alter table public.coach_seed_runs enable row level security;

revoke all on public.coach_athlete_profiles from anon;
revoke all on public.coach_athlete_training_goals from anon;
revoke all on public.coach_athlete_constraints from anon;
revoke all on public.coach_equipment_locations from anon;
revoke all on public.coach_equipment_items from anon;
revoke all on public.coach_context_sources from anon;
revoke all on public.coach_context_snapshots from anon;
revoke all on public.coach_session_fixtures from anon;
revoke all on public.coach_session_blocks from anon;
revoke all on public.coach_session_exercises from anon;
revoke all on public.coach_seed_runs from anon;

grant select, insert, update on public.coach_athlete_profiles to authenticated;
grant select, insert, update on public.coach_athlete_training_goals to authenticated;
grant select, insert, update on public.coach_athlete_constraints to authenticated;
grant select, insert, update on public.coach_equipment_locations to authenticated;
grant select, insert, update on public.coach_equipment_items to authenticated;
grant select, insert, update on public.coach_context_sources to authenticated;
grant select, insert, update on public.coach_context_snapshots to authenticated;
grant select, insert, update on public.coach_session_fixtures to authenticated;
grant select, insert, update on public.coach_session_blocks to authenticated;
grant select, insert, update on public.coach_session_exercises to authenticated;
grant select, insert, update on public.coach_seed_runs to authenticated;

drop policy if exists "Users can read own coach athlete profiles" on public.coach_athlete_profiles;
create policy "Users can read own coach athlete profiles"
on public.coach_athlete_profiles
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach athlete profiles" on public.coach_athlete_profiles;
create policy "Users can insert own coach athlete profiles"
on public.coach_athlete_profiles
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach athlete profiles" on public.coach_athlete_profiles;
create policy "Users can update own coach athlete profiles"
on public.coach_athlete_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach athlete training goals" on public.coach_athlete_training_goals;
create policy "Users can read own coach athlete training goals"
on public.coach_athlete_training_goals
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach athlete training goals" on public.coach_athlete_training_goals;
create policy "Users can insert own coach athlete training goals"
on public.coach_athlete_training_goals
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach athlete training goals" on public.coach_athlete_training_goals;
create policy "Users can update own coach athlete training goals"
on public.coach_athlete_training_goals
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach athlete constraints" on public.coach_athlete_constraints;
create policy "Users can read own coach athlete constraints"
on public.coach_athlete_constraints
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach athlete constraints" on public.coach_athlete_constraints;
create policy "Users can insert own coach athlete constraints"
on public.coach_athlete_constraints
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach athlete constraints" on public.coach_athlete_constraints;
create policy "Users can update own coach athlete constraints"
on public.coach_athlete_constraints
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach equipment locations" on public.coach_equipment_locations;
create policy "Users can read own coach equipment locations"
on public.coach_equipment_locations
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach equipment locations" on public.coach_equipment_locations;
create policy "Users can insert own coach equipment locations"
on public.coach_equipment_locations
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach equipment locations" on public.coach_equipment_locations;
create policy "Users can update own coach equipment locations"
on public.coach_equipment_locations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach equipment items" on public.coach_equipment_items;
create policy "Users can read own coach equipment items"
on public.coach_equipment_items
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach equipment items" on public.coach_equipment_items;
create policy "Users can insert own coach equipment items"
on public.coach_equipment_items
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach equipment items" on public.coach_equipment_items;
create policy "Users can update own coach equipment items"
on public.coach_equipment_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach context sources" on public.coach_context_sources;
create policy "Users can read own coach context sources"
on public.coach_context_sources
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach context sources" on public.coach_context_sources;
create policy "Users can insert own coach context sources"
on public.coach_context_sources
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach context sources" on public.coach_context_sources;
create policy "Users can update own coach context sources"
on public.coach_context_sources
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach context snapshots" on public.coach_context_snapshots;
create policy "Users can read own coach context snapshots"
on public.coach_context_snapshots
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach context snapshots" on public.coach_context_snapshots;
create policy "Users can insert own coach context snapshots"
on public.coach_context_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach context snapshots" on public.coach_context_snapshots;
create policy "Users can update own coach context snapshots"
on public.coach_context_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach session fixtures" on public.coach_session_fixtures;
create policy "Users can read own coach session fixtures"
on public.coach_session_fixtures
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach session fixtures" on public.coach_session_fixtures;
create policy "Users can insert own coach session fixtures"
on public.coach_session_fixtures
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach session fixtures" on public.coach_session_fixtures;
create policy "Users can update own coach session fixtures"
on public.coach_session_fixtures
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach session blocks" on public.coach_session_blocks;
create policy "Users can read own coach session blocks"
on public.coach_session_blocks
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach session blocks" on public.coach_session_blocks;
create policy "Users can insert own coach session blocks"
on public.coach_session_blocks
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach session blocks" on public.coach_session_blocks;
create policy "Users can update own coach session blocks"
on public.coach_session_blocks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach session exercises" on public.coach_session_exercises;
create policy "Users can read own coach session exercises"
on public.coach_session_exercises
for select
to authenticated
using (auth.uid() = user_id);
drop policy if exists "Users can insert own coach session exercises" on public.coach_session_exercises;
create policy "Users can insert own coach session exercises"
on public.coach_session_exercises
for insert
to authenticated
with check (auth.uid() = user_id);
drop policy if exists "Users can update own coach session exercises" on public.coach_session_exercises;
create policy "Users can update own coach session exercises"
on public.coach_session_exercises
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own coach seed runs" on public.coach_seed_runs;
create policy "Users can read own coach seed runs"
on public.coach_seed_runs
for select
to authenticated
using (false);

-- Local-only E2E contract for the current Coach deterministic path.
-- This file is intentionally outside the production supabase/migrations tree.

alter table public.profiles
  add column if not exists timezone text;

alter table public.profiles
  drop constraint if exists profiles_timezone_nonempty;

alter table public.profiles
  add constraint profiles_timezone_nonempty
  check (timezone is null or btrim(timezone) <> '');

create table if not exists public.coach_athlete_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  constraint_type text not null default 'general',
  severity text null,
  description text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_athlete_constraints enable row level security;
revoke all on public.coach_athlete_constraints from anon, authenticated;
grant select on public.coach_athlete_constraints to authenticated;

drop policy if exists "Users read own coach constraints" on public.coach_athlete_constraints;
create policy "Users read own coach constraints"
on public.coach_athlete_constraints
for select
to authenticated
using (user_id = auth.uid());

create table if not exists public.planned_training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  planned_time time null,
  title text not null,
  session_type text not null,
  status text not null default 'planned',
  location_type text null,
  planned_intensity text null,
  planned_duration_min integer null,
  planned_duration_max integer null,
  objective text null,
  coach_notes text null,
  constraints jsonb not null default '[]'::jsonb,
  readiness_snapshot jsonb null,
  source text not null default 'enkidu_coach',
  linked_completed_session_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planned_session_blocks (
  id uuid primary key default gen_random_uuid(),
  planned_session_id uuid not null references public.planned_training_sessions(id) on delete cascade,
  block_order integer not null,
  block_type text null,
  title text not null,
  objective text null,
  planned_duration_seconds integer null,
  planned_rounds integer null,
  planned_exercises jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists planned_training_sessions_user_date_idx
  on public.planned_training_sessions(user_id, planned_date);

create index if not exists planned_session_blocks_session_order_idx
  on public.planned_session_blocks(planned_session_id, block_order);

alter table public.planned_training_sessions enable row level security;
alter table public.planned_session_blocks enable row level security;

revoke all on public.planned_training_sessions from anon, authenticated;
revoke all on public.planned_session_blocks from anon, authenticated;
grant select on public.planned_training_sessions to authenticated;
grant select on public.planned_session_blocks to authenticated;

drop policy if exists "Users read own planned sessions" on public.planned_training_sessions;
create policy "Users read own planned sessions"
on public.planned_training_sessions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read own planned blocks" on public.planned_session_blocks;
create policy "Users read own planned blocks"
on public.planned_session_blocks
for select
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions pts
    where pts.id = planned_session_blocks.planned_session_id
      and pts.user_id = auth.uid()
  )
);

alter table public.weekly_plans enable row level security;
drop policy if exists "Users read own weekly plans" on public.weekly_plans;
create policy "Users read own weekly plans"
on public.weekly_plans
for select
to authenticated
using (user_id = auth.uid());

-- Coach Actions V1.
-- Narrow transactional writer for a server-recalculated deterministic recommendation.
-- The browser keeps read-only access to planning tables; only service_role may execute this writer.

create or replace function public.save_coach_recommendation_plan(
  p_user_id uuid,
  p_planned_date date,
  p_session jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_existing_id uuid;
  v_planned_session_id uuid;
  v_title text;
  v_session_type text;
  v_duration integer;
  v_blocks jsonb;
  v_block jsonb;
  v_block_order integer := 0;
  v_block_duration integer;
begin
  if p_user_id is null or p_planned_date is null or p_session is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_planned_date::text, 0)
  );

  select id
    into v_existing_id
  from public.planned_training_sessions
  where user_id = p_user_id
    and planned_date = p_planned_date
  order by created_at asc
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'plan_already_exists',
      'planned_session_id', v_existing_id
    );
  end if;

  v_title := left(trim(coalesce(p_session ->> 'title', '')), 160);
  v_session_type := left(trim(coalesce(p_session ->> 'session_type', '')), 80);

  if v_title = '' or v_session_type = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_recommendation');
  end if;

  if coalesce(p_session ->> 'duration_minutes', '') ~ '^\d+$' then
    v_duration := (p_session ->> 'duration_minutes')::integer;
  else
    v_duration := null;
  end if;

  if v_duration is not null and (v_duration < 1 or v_duration > 360) then
    return jsonb_build_object('ok', false, 'error', 'invalid_duration');
  end if;

  v_blocks := case
    when jsonb_typeof(p_session -> 'blocks') = 'array' then p_session -> 'blocks'
    else '[]'::jsonb
  end;

  if jsonb_array_length(v_blocks) > 12 then
    return jsonb_build_object('ok', false, 'error', 'too_many_blocks');
  end if;

  insert into public.planned_training_sessions (
    user_id,
    planned_date,
    title,
    session_type,
    status,
    location_type,
    planned_intensity,
    planned_duration_min,
    planned_duration_max,
    objective,
    coach_notes,
    constraints,
    readiness_snapshot,
    source,
    linked_completed_session_id
  )
  values (
    p_user_id,
    p_planned_date,
    v_title,
    v_session_type,
    'planned',
    nullif(left(trim(coalesce(p_session ->> 'environment', '')), 80), ''),
    nullif(left(trim(coalesce(p_session ->> 'intensity', '')), 80), ''),
    v_duration,
    v_duration,
    nullif(left(trim(coalesce(p_session ->> 'objective', '')), 700), ''),
    'Guardada desde recomendación determinista ENQIDU.',
    '[]'::jsonb,
    null,
    'enkidu_coach',
    null
  )
  returning id into v_planned_session_id;

  for v_block in
    select value from jsonb_array_elements(v_blocks)
  loop
    v_block_order := v_block_order + 1;
    v_block_duration := case
      when coalesce(v_block ->> 'duration_minutes', '') ~ '^\d+$'
        then (v_block ->> 'duration_minutes')::integer * 60
      else null
    end;

    insert into public.planned_session_blocks (
      planned_session_id,
      block_order,
      block_type,
      title,
      objective,
      planned_duration_seconds,
      planned_rounds,
      planned_exercises,
      constraints,
      notes
    )
    values (
      v_planned_session_id,
      v_block_order,
      null,
      left(trim(coalesce(v_block ->> 'title', 'Bloque')), 160),
      null,
      v_block_duration,
      null,
      '[]'::jsonb,
      '[]'::jsonb,
      null
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'planned_session_id', v_planned_session_id,
    'inserted_blocks', v_block_order
  );
end;
$$;

revoke execute on function public.save_coach_recommendation_plan(uuid, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_coach_recommendation_plan(uuid, date, jsonb)
  to service_role;


grant select, insert on table public.planned_training_sessions to service_role;
grant insert on table public.planned_session_blocks to service_role;

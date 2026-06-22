-- ENQIDU Semana Viva: AI-planned session persistence for the ChatGPT manual pilot.
-- Additive only: does not touch Garmin/FIT import, completed sessions, coach blocks, or FIT parsing.

create table if not exists public.planned_training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  planned_time time null,
  title text not null,
  session_type text not null,
  location_type text null,
  status text not null default 'planned',
  priority text null,
  planned_intensity text null,
  planned_duration_min integer null,
  planned_duration_max integer null,
  objective text null,
  coach_notes text null,
  constraints jsonb not null default '[]'::jsonb,
  adaptation_reason text null,
  readiness_snapshot jsonb null,
  recurrence_rule text null,
  linked_completed_session_id uuid null,
  source text not null default 'ai_coach_plan',
  ai_generated boolean not null default true,
  ai_generation_source text not null default 'chatgpt_manual_pilot',
  ai_confidence text not null default 'coach_estimate',
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
  planned_rounds numeric null,
  planned_exercises jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  notes text null,
  created_at timestamptz not null default now()
);

alter table public.planned_training_sessions
  add column if not exists linked_completed_session_id uuid null,
  add column if not exists ai_generated boolean not null default true,
  add column if not exists ai_generation_source text not null default 'chatgpt_manual_pilot',
  add column if not exists ai_confidence text not null default 'coach_estimate';

alter table public.planned_training_sessions
  alter column source set default 'ai_coach_plan';

alter table public.planned_session_blocks
  add column if not exists planned_rounds numeric null;

alter table public.planned_session_blocks
  alter column planned_rounds type numeric using planned_rounds::numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planned_training_sessions_user_id_fkey'
      and conrelid = 'public.planned_training_sessions'::regclass
  ) then
    alter table public.planned_training_sessions
      add constraint planned_training_sessions_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

alter table public.planned_training_sessions
  drop constraint if exists planned_training_sessions_status_check;

alter table public.planned_training_sessions
  add constraint planned_training_sessions_status_check
  check (
    status in (
      'planned',
      'confirmed',
      'modified',
      'completed',
      'enriched',
      'skipped',
      'rescheduled',
      'probable',
      'adaptable',
      'recommended'
    )
  );

alter table public.planned_training_sessions
  drop constraint if exists planned_training_sessions_duration_check;

alter table public.planned_training_sessions
  add constraint planned_training_sessions_duration_check
  check (
    planned_duration_min is null
    or planned_duration_max is null
    or planned_duration_min <= planned_duration_max
  );

alter table public.planned_session_blocks
  drop constraint if exists planned_session_blocks_order_check;

alter table public.planned_session_blocks
  add constraint planned_session_blocks_order_check
  check (block_order > 0);

create index if not exists planned_training_sessions_user_date_idx
on public.planned_training_sessions(user_id, planned_date);

create index if not exists planned_training_sessions_linked_completed_idx
on public.planned_training_sessions(linked_completed_session_id);

create index if not exists planned_session_blocks_session_order_idx
on public.planned_session_blocks(planned_session_id, block_order);

alter table public.planned_training_sessions enable row level security;
alter table public.planned_session_blocks enable row level security;

grant select, insert, update, delete on public.planned_training_sessions to authenticated;
grant select, insert, update, delete on public.planned_session_blocks to authenticated;

drop policy if exists "Users can read own planned sessions" on public.planned_training_sessions;
create policy "Users can read own planned sessions"
on public.planned_training_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own planned sessions" on public.planned_training_sessions;
create policy "Users can insert own planned sessions"
on public.planned_training_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own planned sessions" on public.planned_training_sessions;
create policy "Users can update own planned sessions"
on public.planned_training_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own planned sessions" on public.planned_training_sessions;
create policy "Users can delete own planned sessions"
on public.planned_training_sessions
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own planned session blocks" on public.planned_session_blocks;
create policy "Users can read own planned session blocks"
on public.planned_session_blocks
for select
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions s
    where s.id = planned_session_blocks.planned_session_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own planned session blocks" on public.planned_session_blocks;
create policy "Users can insert own planned session blocks"
on public.planned_session_blocks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.planned_training_sessions s
    where s.id = planned_session_blocks.planned_session_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own planned session blocks" on public.planned_session_blocks;
create policy "Users can update own planned session blocks"
on public.planned_session_blocks
for update
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions s
    where s.id = planned_session_blocks.planned_session_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.planned_training_sessions s
    where s.id = planned_session_blocks.planned_session_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own planned session blocks" on public.planned_session_blocks;
create policy "Users can delete own planned session blocks"
on public.planned_session_blocks
for delete
to authenticated
using (
  exists (
    select 1
    from public.planned_training_sessions s
    where s.id = planned_session_blocks.planned_session_id
      and s.user_id = auth.uid()
  )
);

-- Remove earlier local seed rows if they were applied. Real AI plans use source='ai_coach_plan'.
delete from public.planned_training_sessions
where source = 'coach_plan'
  and planned_date between '2026-06-22'::date and '2026-06-28'::date
  and title in (
    'Hibrido fuera de casa',
    'Recuperacion activa',
    'Yoga',
    'Fuerza tecnica en casa',
    'Funcional',
    'Descanso'
  );

create or replace function public.chatgpt_pilot_week_plan_forbidden_keys()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'user_id',
    'raw_payload',
    'original_payload',
    'payload_sql',
    'sql',
    'query',
    'service_role',
    'api_key',
    'openai_api_key',
    'password',
    'secret',
    'token'
  ]::text[];
$$;

create or replace function public.chatgpt_pilot_week_plan_has_forbidden_key(p_json jsonb)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive walk(key_name, value) as (
    values (null::text, coalesce(p_json, 'null'::jsonb))
    union all
    select child.key_name, child.value
    from walk w
    cross join lateral (
      select e.key::text as key_name, e.value
      from jsonb_each(
        case when jsonb_typeof(w.value) = 'object' then w.value else '{}'::jsonb end
      ) as e(key, value)
      union all
      select null::text as key_name, a.value
      from jsonb_array_elements(
        case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end
      ) as a(value)
    ) child
  )
  select exists (
    select 1
    from walk
    where key_name is not null
      and lower(key_name) = any(public.chatgpt_pilot_week_plan_forbidden_keys())
  );
$$;

create or replace function public.chatgpt_pilot_validate_week_plan(p_plan jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config record;
  v_errors text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_week_text text;
  v_sessions jsonb := '[]'::jsonb;
  v_session jsonb;
  v_block jsonb;
  v_blocks jsonb;
  v_status text;
  v_session_count integer := 0;
  v_block_count integer := 0;
  v_index integer := 0;
  v_block_index integer := 0;
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if not found then
    v_errors := array_append(v_errors, 'pilot config missing');
  elsif not v_config.enabled then
    v_errors := array_append(v_errors, 'pilot is disabled');
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    v_errors := array_append(v_errors, 'plan must be a JSON object');
    return jsonb_build_object('ok', false, 'errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings));
  end if;

  if public.chatgpt_pilot_week_plan_has_forbidden_key(p_plan) then
    v_errors := array_append(v_errors, 'plan contains forbidden key');
  end if;

  v_week_text := p_plan ->> 'week_start';
  if coalesce(v_week_text, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    v_errors := array_append(v_errors, 'week_start must be YYYY-MM-DD');
  end if;

  if jsonb_typeof(p_plan -> 'sessions') <> 'array' then
    v_errors := array_append(v_errors, 'sessions must be an array');
  else
    v_sessions := p_plan -> 'sessions';
  end if;

  v_session_count := jsonb_array_length(v_sessions);
  if v_session_count > 14 then
    v_errors := array_append(v_errors, 'sessions cannot exceed 14');
  end if;

  for v_session in select value from jsonb_array_elements(v_sessions)
  loop
    v_index := v_index + 1;

    if jsonb_typeof(v_session) <> 'object' then
      v_errors := array_append(v_errors, format('sessions[%s] must be an object', v_index - 1));
      continue;
    end if;

    if coalesce(v_session ->> 'planned_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      v_errors := array_append(v_errors, format('sessions[%s].planned_date must be YYYY-MM-DD', v_index - 1));
    end if;

    if length(trim(coalesce(v_session ->> 'title', ''))) = 0 then
      v_errors := array_append(v_errors, format('sessions[%s].title is required', v_index - 1));
    end if;

    if length(trim(coalesce(v_session ->> 'session_type', ''))) = 0 then
      v_errors := array_append(v_errors, format('sessions[%s].session_type is required', v_index - 1));
    end if;

    v_status := coalesce(nullif(v_session ->> 'status', ''), 'planned');
    if v_status not in (
      'planned',
      'confirmed',
      'modified',
      'completed',
      'enriched',
      'skipped',
      'rescheduled',
      'probable',
      'adaptable',
      'recommended'
    ) then
      v_errors := array_append(v_errors, format('sessions[%s].status is not allowed', v_index - 1));
    end if;

    if v_session ? 'blocks' then
      if jsonb_typeof(v_session -> 'blocks') <> 'array' then
        v_errors := array_append(v_errors, format('sessions[%s].blocks must be an array', v_index - 1));
      elsif jsonb_array_length(v_session -> 'blocks') > 12 then
        v_errors := array_append(v_errors, format('sessions[%s].blocks cannot exceed 12', v_index - 1));
      else
        v_blocks := v_session -> 'blocks';
        v_block_count := v_block_count + jsonb_array_length(v_blocks);
        v_block_index := 0;

        for v_block in select value from jsonb_array_elements(v_blocks)
        loop
          v_block_index := v_block_index + 1;

          if jsonb_typeof(v_block) <> 'object' then
            v_errors := array_append(v_errors, format('sessions[%s].blocks[%s] must be an object', v_index - 1, v_block_index - 1));
          elsif length(trim(coalesce(v_block ->> 'title', ''))) = 0 then
            v_errors := array_append(v_errors, format('sessions[%s].blocks[%s].title is required', v_index - 1, v_block_index - 1));
          end if;
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', coalesce(array_length(v_errors, 1), 0) = 0,
    'week_start', v_week_text,
    'sessions_count', v_session_count,
    'blocks_count', v_block_count,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

create or replace function public.chatgpt_pilot_preview_week_plan(p_plan jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation jsonb;
begin
  v_validation := public.chatgpt_pilot_validate_week_plan(p_plan);

  return jsonb_build_object(
    'ok', (v_validation ->> 'ok')::boolean,
    'dry_run', true,
    'week_start', v_validation ->> 'week_start',
    'would_upsert_sessions', coalesce((v_validation ->> 'sessions_count')::integer, 0),
    'would_replace_blocks', coalesce((v_validation ->> 'blocks_count')::integer, 0),
    'errors', coalesce(v_validation -> 'errors', '[]'::jsonb),
    'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
  );
end;
$$;

create or replace function public.chatgpt_pilot_apply_week_plan(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation jsonb;
  v_config record;
  v_user_id uuid;
  v_generation_source text;
  v_sessions jsonb;
  v_session jsonb;
  v_block jsonb;
  v_planned_session_id uuid;
  v_planned_date date;
  v_planned_time time;
  v_status text;
  v_priority text;
  v_constraints jsonb;
  v_readiness jsonb;
  v_inserted_sessions integer := 0;
  v_inserted_blocks integer := 0;
  v_block_order integer;
  v_session_block_index integer := 0;
begin
  v_validation := public.chatgpt_pilot_validate_week_plan(p_plan);
  if not (v_validation ->> 'ok')::boolean then
    return jsonb_build_object(
      'ok', false,
      'week_start', v_validation ->> 'week_start',
      'inserted_or_updated_sessions', 0,
      'inserted_blocks', 0,
      'errors', coalesce(v_validation -> 'errors', '[]'::jsonb),
      'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
    );
  end if;

  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true
    and enabled is true;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'week_start', p_plan ->> 'week_start',
      'inserted_or_updated_sessions', 0,
      'inserted_blocks', 0,
      'errors', jsonb_build_array('pilot config missing or disabled'),
      'warnings', '[]'::jsonb
    );
  end if;

  v_user_id := v_config.pilot_user_id;
  v_generation_source := coalesce(nullif(public.chatgpt_pilot_truncate_text(p_plan ->> 'source', 80), ''), 'chatgpt_manual_pilot');
  v_sessions := p_plan -> 'sessions';

  for v_session in select value from jsonb_array_elements(v_sessions)
  loop
    v_planned_date := (v_session ->> 'planned_date')::date;
    v_planned_time := nullif(v_session ->> 'planned_time', '')::time;
    v_status := coalesce(nullif(v_session ->> 'status', ''), 'planned');
    v_priority := nullif(public.chatgpt_pilot_truncate_text(coalesce(v_session ->> 'priority', case when v_status in ('probable', 'adaptable', 'recommended') then v_status else null end), 80), '');
    v_constraints := case
      when jsonb_typeof(v_session -> 'constraints') = 'array' then v_session -> 'constraints'
      else '[]'::jsonb
    end;
    v_readiness := case
      when jsonb_typeof(v_session -> 'readiness_snapshot') = 'object' then v_session -> 'readiness_snapshot'
      else null
    end;

    select id
    into v_planned_session_id
    from public.planned_training_sessions
    where user_id = v_user_id
      and planned_date = v_planned_date
      and planned_time is not distinct from v_planned_time
      and title = public.chatgpt_pilot_truncate_text(v_session ->> 'title', 160)
      and session_type = public.chatgpt_pilot_truncate_text(v_session ->> 'session_type', 80)
      and source = 'ai_coach_plan'
    order by updated_at desc
    limit 1;

    if v_planned_session_id is null then
      insert into public.planned_training_sessions (
        user_id,
        planned_date,
        planned_time,
        title,
        session_type,
        location_type,
        status,
        priority,
        planned_intensity,
        planned_duration_min,
        planned_duration_max,
        objective,
        coach_notes,
        constraints,
        adaptation_reason,
        readiness_snapshot,
        recurrence_rule,
        linked_completed_session_id,
        source,
        ai_generated,
        ai_generation_source,
        ai_confidence
      )
      values (
        v_user_id,
        v_planned_date,
        v_planned_time,
        public.chatgpt_pilot_truncate_text(v_session ->> 'title', 160),
        public.chatgpt_pilot_truncate_text(v_session ->> 'session_type', 80),
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'location_type', 80), ''),
        v_status,
        v_priority,
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'planned_intensity', 80), ''),
        nullif(v_session ->> 'planned_duration_min', '')::integer,
        nullif(v_session ->> 'planned_duration_max', '')::integer,
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'objective', 700), ''),
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'coach_notes', 900), ''),
        v_constraints,
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'adaptation_reason', 500), ''),
        v_readiness,
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'recurrence_rule', 160), ''),
        nullif(v_session ->> 'linked_completed_session_id', '')::uuid,
        'ai_coach_plan',
        true,
        v_generation_source,
        coalesce(nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'ai_confidence', 80), ''), 'coach_estimate')
      )
      returning id into v_planned_session_id;
    else
      update public.planned_training_sessions
      set location_type = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'location_type', 80), ''),
          status = v_status,
          priority = v_priority,
          planned_intensity = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'planned_intensity', 80), ''),
          planned_duration_min = nullif(v_session ->> 'planned_duration_min', '')::integer,
          planned_duration_max = nullif(v_session ->> 'planned_duration_max', '')::integer,
          objective = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'objective', 700), ''),
          coach_notes = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'coach_notes', 900), ''),
          constraints = v_constraints,
          adaptation_reason = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'adaptation_reason', 500), ''),
          readiness_snapshot = v_readiness,
          recurrence_rule = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'recurrence_rule', 160), ''),
          linked_completed_session_id = nullif(v_session ->> 'linked_completed_session_id', '')::uuid,
          ai_generated = true,
          ai_generation_source = v_generation_source,
          ai_confidence = coalesce(nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'ai_confidence', 80), ''), 'coach_estimate'),
          updated_at = now()
      where id = v_planned_session_id;
    end if;

    v_inserted_sessions := v_inserted_sessions + 1;

    delete from public.planned_session_blocks
    where planned_session_id = v_planned_session_id;

    if jsonb_typeof(v_session -> 'blocks') = 'array' then
      v_session_block_index := 0;
      for v_block in select value from jsonb_array_elements(v_session -> 'blocks')
      loop
        v_session_block_index := v_session_block_index + 1;
        v_block_order := coalesce(nullif(v_block ->> 'block_order', '')::integer, v_session_block_index);
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
          nullif(public.chatgpt_pilot_truncate_text(v_block ->> 'block_type', 80), ''),
          public.chatgpt_pilot_truncate_text(v_block ->> 'title', 160),
          nullif(public.chatgpt_pilot_truncate_text(v_block ->> 'objective', 500), ''),
          nullif(v_block ->> 'planned_duration_seconds', '')::integer,
          nullif(v_block ->> 'planned_rounds', '')::numeric,
          case when jsonb_typeof(v_block -> 'planned_exercises') = 'array' then v_block -> 'planned_exercises' else '[]'::jsonb end,
          case when jsonb_typeof(v_block -> 'constraints') = 'array' then v_block -> 'constraints' else '[]'::jsonb end,
          nullif(public.chatgpt_pilot_truncate_text(v_block ->> 'notes', 500), '')
        );

        v_inserted_blocks := v_inserted_blocks + 1;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'week_start', p_plan ->> 'week_start',
    'inserted_or_updated_sessions', v_inserted_sessions,
    'inserted_blocks', v_inserted_blocks,
    'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.chatgpt_pilot_preview_week_plan(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_apply_week_plan(jsonb) to anon, authenticated, service_role;

revoke execute on function public.chatgpt_pilot_week_plan_forbidden_keys() from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_week_plan_has_forbidden_key(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_validate_week_plan(jsonb) from public, anon, authenticated;

grant execute on function public.chatgpt_pilot_week_plan_forbidden_keys() to service_role;
grant execute on function public.chatgpt_pilot_week_plan_has_forbidden_key(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_validate_week_plan(jsonb) to service_role;

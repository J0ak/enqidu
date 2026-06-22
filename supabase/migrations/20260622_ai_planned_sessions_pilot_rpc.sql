-- ENQIDU planned sessions pilot backend.
-- Additive only: creates planned-session storage and ChatGPT pilot RPCs.
-- Does not touch completed Garmin/FIT sessions, executed coach blocks, FIT import, samples, laps, metrics, or exercises.

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
  source text not null default 'chatgpt_pilot',
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

alter table public.planned_training_sessions
  alter column source set default 'chatgpt_pilot';

alter table public.planned_session_blocks
  alter column planned_rounds type integer using planned_rounds::integer;

alter table public.planned_training_sessions
  drop constraint if exists planned_training_sessions_status_check;

alter table public.planned_training_sessions
  add constraint planned_training_sessions_status_check
  check (
    status in (
      'planned',
      'confirmed',
      'adaptable',
      'probable',
      'recommended',
      'modified',
      'skipped',
      'rescheduled'
    )
  );

alter table public.planned_training_sessions
  drop constraint if exists planned_training_sessions_session_type_check;

alter table public.planned_training_sessions
  add constraint planned_training_sessions_session_type_check
  check (
    session_type in (
      'hybrid',
      'strength',
      'functional',
      'yoga',
      'mobility',
      'recovery',
      'running',
      'trail',
      'swim',
      'rest'
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

create unique index if not exists planned_training_sessions_logical_key_idx
on public.planned_training_sessions(user_id, planned_date, coalesce(planned_time::text, ''), title);

create index if not exists planned_session_blocks_session_order_idx
on public.planned_session_blocks(planned_session_id, block_order);

alter table public.planned_training_sessions enable row level security;
alter table public.planned_session_blocks enable row level security;

revoke all on public.planned_training_sessions from anon, authenticated;
revoke all on public.planned_session_blocks from anon, authenticated;
grant select on public.planned_training_sessions to authenticated;
grant select on public.planned_session_blocks to authenticated;

drop policy if exists "Users can read own planned sessions" on public.planned_training_sessions;
create policy "Users can read own planned sessions"
on public.planned_training_sessions
for select
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

create or replace function public.chatgpt_pilot_planned_allowed_session_types()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'hybrid',
    'strength',
    'functional',
    'yoga',
    'mobility',
    'recovery',
    'running',
    'trail',
    'swim',
    'rest'
  ]::text[];
$$;

create or replace function public.chatgpt_pilot_planned_allowed_statuses()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'planned',
    'confirmed',
    'adaptable',
    'probable',
    'recommended',
    'modified',
    'skipped',
    'rescheduled'
  ]::text[];
$$;

create or replace function public.chatgpt_pilot_planned_forbidden_keys()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'user_id',
    'linked_completed_session_id',
    'raw_payload',
    'original_payload',
    'payload_sql',
    'sql',
    'query',
    'table',
    'schema',
    'service_role',
    'api_key',
    'openai_api_key',
    'password',
    'secret',
    'token'
  ]::text[];
$$;

create or replace function public.chatgpt_pilot_planned_has_forbidden_key(p_json jsonb)
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
      and lower(key_name) = any(public.chatgpt_pilot_planned_forbidden_keys())
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
  v_week_start text;
  v_sessions jsonb := '[]'::jsonb;
  v_session jsonb;
  v_blocks jsonb;
  v_block jsonb;
  v_status text;
  v_session_type text;
  v_session_count integer := 0;
  v_block_count integer := 0;
  v_index integer := 0;
  v_block_index integer := 0;
  v_duration_min integer;
  v_duration_max integer;
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if not found then
    v_errors := array_append(v_errors, 'pilot config missing');
  elsif not v_config.enabled then
    v_errors := array_append(v_errors, 'pilot is disabled');
  elsif v_config.pilot_user_id is null then
    v_errors := array_append(v_errors, 'pilot user missing');
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    return jsonb_build_object(
      'valid', false,
      'ok', false,
      'errors', jsonb_build_array('plan must be a JSON object'),
      'warnings', to_jsonb(v_warnings)
    );
  end if;

  if public.chatgpt_pilot_planned_has_forbidden_key(p_plan) then
    v_errors := array_append(v_errors, 'plan contains forbidden key');
  end if;

  v_week_start := p_plan ->> 'week_start';
  if coalesce(v_week_start, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    v_errors := array_append(v_errors, 'week_start must be YYYY-MM-DD');
  end if;

  if jsonb_typeof(p_plan -> 'sessions') <> 'array' then
    v_errors := array_append(v_errors, 'sessions must be an array');
  else
    v_sessions := p_plan -> 'sessions';
  end if;

  v_session_count := jsonb_array_length(v_sessions);
  if v_session_count = 0 then
    v_errors := array_append(v_errors, 'sessions cannot be empty');
  elsif v_session_count > 14 then
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

    if coalesce(v_session ->> 'planned_time', '') <> ''
      and coalesce(v_session ->> 'planned_time', '') !~ '^\d{2}:\d{2}(:\d{2})?$' then
      v_errors := array_append(v_errors, format('sessions[%s].planned_time must be HH:MM or HH:MM:SS', v_index - 1));
    end if;

    if length(trim(coalesce(v_session ->> 'title', ''))) = 0 then
      v_errors := array_append(v_errors, format('sessions[%s].title is required', v_index - 1));
    end if;

    v_session_type := coalesce(nullif(v_session ->> 'session_type', ''), '');
    if v_session_type = '' then
      v_errors := array_append(v_errors, format('sessions[%s].session_type is required', v_index - 1));
    elsif not (v_session_type = any(public.chatgpt_pilot_planned_allowed_session_types())) then
      v_errors := array_append(v_errors, format('sessions[%s].session_type is not allowed', v_index - 1));
    end if;

    v_status := coalesce(nullif(v_session ->> 'status', ''), 'planned');
    if not (v_status = any(public.chatgpt_pilot_planned_allowed_statuses())) then
      v_errors := array_append(v_errors, format('sessions[%s].status is not allowed', v_index - 1));
    end if;

    if v_session ? 'planned_duration_min' and nullif(v_session ->> 'planned_duration_min', '') is not null then
      begin
        v_duration_min := (v_session ->> 'planned_duration_min')::integer;
        if v_duration_min < 0 then
          v_errors := array_append(v_errors, format('sessions[%s].planned_duration_min must be >= 0', v_index - 1));
        end if;
      exception when others then
        v_errors := array_append(v_errors, format('sessions[%s].planned_duration_min must be integer', v_index - 1));
      end;
    else
      v_duration_min := null;
    end if;

    if v_session ? 'planned_duration_max' and nullif(v_session ->> 'planned_duration_max', '') is not null then
      begin
        v_duration_max := (v_session ->> 'planned_duration_max')::integer;
        if v_duration_max < 0 then
          v_errors := array_append(v_errors, format('sessions[%s].planned_duration_max must be >= 0', v_index - 1));
        end if;
      exception when others then
        v_errors := array_append(v_errors, format('sessions[%s].planned_duration_max must be integer', v_index - 1));
      end;
    else
      v_duration_max := null;
    end if;

    if v_duration_min is not null and v_duration_max is not null and v_duration_min > v_duration_max then
      v_errors := array_append(v_errors, format('sessions[%s].planned_duration_min cannot exceed planned_duration_max', v_index - 1));
    end if;

    if v_session ? 'constraints' and jsonb_typeof(v_session -> 'constraints') <> 'array' then
      v_errors := array_append(v_errors, format('sessions[%s].constraints must be an array', v_index - 1));
    end if;

    if v_session ? 'readiness_snapshot' and jsonb_typeof(v_session -> 'readiness_snapshot') <> 'object' then
      v_errors := array_append(v_errors, format('sessions[%s].readiness_snapshot must be an object', v_index - 1));
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
            continue;
          end if;

          if length(trim(coalesce(v_block ->> 'title', ''))) = 0 then
            v_errors := array_append(v_errors, format('sessions[%s].blocks[%s].title is required', v_index - 1, v_block_index - 1));
          end if;

          if v_block ? 'block_order' and nullif(v_block ->> 'block_order', '') is not null then
            begin
              if (v_block ->> 'block_order')::integer <= 0 then
                v_errors := array_append(v_errors, format('sessions[%s].blocks[%s].block_order must be > 0', v_index - 1, v_block_index - 1));
              end if;
            exception when others then
              v_errors := array_append(v_errors, format('sessions[%s].blocks[%s].block_order must be integer', v_index - 1, v_block_index - 1));
            end;
          end if;

          if v_block ? 'planned_exercises' and jsonb_typeof(v_block -> 'planned_exercises') <> 'array' then
            v_errors := array_append(v_errors, format('sessions[%s].blocks[%s].planned_exercises must be an array', v_index - 1, v_block_index - 1));
          end if;

          if v_block ? 'constraints' and jsonb_typeof(v_block -> 'constraints') <> 'array' then
            v_errors := array_append(v_errors, format('sessions[%s].blocks[%s].constraints must be an array', v_index - 1, v_block_index - 1));
          end if;
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'valid', coalesce(array_length(v_errors, 1), 0) = 0,
    'ok', coalesce(array_length(v_errors, 1), 0) = 0,
    'week_start', v_week_start,
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
  v_config record;
  v_sessions jsonb := '[]'::jsonb;
  v_session jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_duplicates jsonb := '[]'::jsonb;
  v_existing_id uuid;
begin
  v_validation := public.chatgpt_pilot_validate_week_plan(p_plan);

  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if jsonb_typeof(p_plan -> 'sessions') = 'array' then
    v_sessions := p_plan -> 'sessions';
  end if;

  for v_session in select value from jsonb_array_elements(v_sessions)
  loop
    v_existing_id := null;
    if v_config.pilot_user_id is not null
      and coalesce(v_session ->> 'planned_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      select id
      into v_existing_id
      from public.planned_training_sessions
      where user_id = v_config.pilot_user_id
        and planned_date = (v_session ->> 'planned_date')::date
        and planned_time is not distinct from nullif(v_session ->> 'planned_time', '')::time
        and title = public.chatgpt_pilot_truncate_text(v_session ->> 'title', 160)
      order by updated_at desc
      limit 1;
    end if;

    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
      'planned_date', v_session ->> 'planned_date',
      'planned_time', nullif(v_session ->> 'planned_time', ''),
      'title', v_session ->> 'title',
      'session_type', v_session ->> 'session_type',
      'status', coalesce(nullif(v_session ->> 'status', ''), 'planned'),
      'blocks_count', case when jsonb_typeof(v_session -> 'blocks') = 'array' then jsonb_array_length(v_session -> 'blocks') else 0 end,
      'existing_planned_session_id', v_existing_id
    ));

    if v_existing_id is not null then
      v_duplicates := v_duplicates || jsonb_build_array(jsonb_build_object(
        'planned_date', v_session ->> 'planned_date',
        'planned_time', nullif(v_session ->> 'planned_time', ''),
        'title', v_session ->> 'title',
        'existing_planned_session_id', v_existing_id
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'valid', (v_validation ->> 'valid')::boolean,
    'ok', (v_validation ->> 'ok')::boolean,
    'dry_run', true,
    'week_start', v_validation ->> 'week_start',
    'sessions_count', coalesce((v_validation ->> 'sessions_count')::integer, 0),
    'blocks_count', coalesce((v_validation ->> 'blocks_count')::integer, 0),
    'dates', (
      select coalesce(jsonb_agg(distinct value ->> 'planned_date'), '[]'::jsonb)
      from jsonb_array_elements(v_sessions)
    ),
    'possible_duplicates', v_duplicates,
    'normalized_sessions', v_normalized,
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
  v_source text;
  v_sessions jsonb;
  v_session jsonb;
  v_block jsonb;
  v_planned_session_id uuid;
  v_planned_date date;
  v_planned_time time;
  v_status text;
  v_constraints jsonb;
  v_readiness jsonb;
  v_inserted_or_updated_sessions integer := 0;
  v_inserted_blocks integer := 0;
  v_block_order integer;
  v_block_index integer;
begin
  v_validation := public.chatgpt_pilot_validate_week_plan(p_plan);
  if not (v_validation ->> 'ok')::boolean then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
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

  if not found or v_config.pilot_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'week_start', p_plan ->> 'week_start',
      'inserted_or_updated_sessions', 0,
      'inserted_blocks', 0,
      'errors', jsonb_build_array('pilot config missing, disabled, or missing user'),
      'warnings', '[]'::jsonb
    );
  end if;

  v_user_id := v_config.pilot_user_id;
  v_source := coalesce(nullif(public.chatgpt_pilot_truncate_text(p_plan ->> 'source', 80), ''), 'chatgpt_pilot');
  v_sessions := p_plan -> 'sessions';

  for v_session in select value from jsonb_array_elements(v_sessions)
  loop
    v_planned_date := (v_session ->> 'planned_date')::date;
    v_planned_time := nullif(v_session ->> 'planned_time', '')::time;
    v_status := coalesce(nullif(v_session ->> 'status', ''), 'planned');
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
    order by updated_at desc
    limit 1;

    if v_planned_session_id is null then
      insert into public.planned_training_sessions (
        user_id,
        planned_date,
        planned_time,
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
        v_user_id,
        v_planned_date,
        v_planned_time,
        public.chatgpt_pilot_truncate_text(v_session ->> 'title', 160),
        public.chatgpt_pilot_truncate_text(v_session ->> 'session_type', 80),
        v_status,
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'location_type', 80), ''),
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'planned_intensity', 80), ''),
        nullif(v_session ->> 'planned_duration_min', '')::integer,
        nullif(v_session ->> 'planned_duration_max', '')::integer,
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'objective', 700), ''),
        nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'coach_notes', 900), ''),
        v_constraints,
        v_readiness,
        v_source,
        null
      )
      returning id into v_planned_session_id;
    else
      update public.planned_training_sessions
      set session_type = public.chatgpt_pilot_truncate_text(v_session ->> 'session_type', 80),
          status = v_status,
          location_type = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'location_type', 80), ''),
          planned_intensity = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'planned_intensity', 80), ''),
          planned_duration_min = nullif(v_session ->> 'planned_duration_min', '')::integer,
          planned_duration_max = nullif(v_session ->> 'planned_duration_max', '')::integer,
          objective = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'objective', 700), ''),
          coach_notes = nullif(public.chatgpt_pilot_truncate_text(v_session ->> 'coach_notes', 900), ''),
          constraints = v_constraints,
          readiness_snapshot = v_readiness,
          source = v_source,
          linked_completed_session_id = null,
          updated_at = now()
      where id = v_planned_session_id;
    end if;

    v_inserted_or_updated_sessions := v_inserted_or_updated_sessions + 1;

    delete from public.planned_session_blocks
    where planned_session_id = v_planned_session_id;

    if jsonb_typeof(v_session -> 'blocks') = 'array' then
      v_block_index := 0;
      for v_block in select value from jsonb_array_elements(v_session -> 'blocks')
      loop
        v_block_index := v_block_index + 1;
        v_block_order := coalesce(nullif(v_block ->> 'block_order', '')::integer, v_block_index);

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
          nullif(v_block ->> 'planned_rounds', '')::integer,
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
    'valid', true,
    'week_start', p_plan ->> 'week_start',
    'inserted_or_updated_sessions', v_inserted_or_updated_sessions,
    'inserted_blocks', v_inserted_blocks,
    'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.chatgpt_pilot_planned_allowed_session_types() from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_planned_allowed_statuses() from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_planned_forbidden_keys() from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_planned_has_forbidden_key(jsonb) from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_validate_week_plan(jsonb) from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_preview_week_plan(jsonb) from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_apply_week_plan(jsonb) from public, anon, authenticated;

grant execute on function public.chatgpt_pilot_preview_week_plan(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_apply_week_plan(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_planned_allowed_session_types() to service_role;
grant execute on function public.chatgpt_pilot_planned_allowed_statuses() to service_role;
grant execute on function public.chatgpt_pilot_planned_forbidden_keys() to service_role;
grant execute on function public.chatgpt_pilot_planned_has_forbidden_key(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_validate_week_plan(jsonb) to service_role;

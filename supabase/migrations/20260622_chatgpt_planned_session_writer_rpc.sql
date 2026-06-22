-- ENQIDU planned-session ChatGPT writer RPCs.
-- Additive/update-only on planned_* objects. Does not touch executed-session tables.

create or replace function public.chatgpt_pilot_validate_planned_session(p_session jsonb)
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
  v_status text;
  v_session_type text;
  v_blocks jsonb := '[]'::jsonb;
  v_block jsonb;
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

  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    return jsonb_build_object(
      'valid', false,
      'ok', false,
      'errors', jsonb_build_array('session must be a JSON object'),
      'warnings', to_jsonb(v_warnings)
    );
  end if;

  if public.chatgpt_pilot_planned_has_forbidden_key(p_session) then
    v_errors := array_append(v_errors, 'session contains forbidden key');
  end if;

  if coalesce(p_session ->> 'planned_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    v_errors := array_append(v_errors, 'planned_date must be YYYY-MM-DD');
  end if;

  if coalesce(p_session ->> 'planned_time', '') <> ''
    and coalesce(p_session ->> 'planned_time', '') !~ '^\d{2}:\d{2}(:\d{2})?$' then
    v_errors := array_append(v_errors, 'planned_time must be HH:MM or HH:MM:SS');
  end if;

  if length(trim(coalesce(p_session ->> 'title', ''))) = 0 then
    v_errors := array_append(v_errors, 'title is required');
  end if;

  v_session_type := coalesce(nullif(p_session ->> 'session_type', ''), '');
  if v_session_type = '' then
    v_errors := array_append(v_errors, 'session_type is required');
  elsif not (v_session_type = any(public.chatgpt_pilot_planned_allowed_session_types())) then
    v_errors := array_append(v_errors, 'session_type is not allowed');
  end if;

  v_status := coalesce(nullif(p_session ->> 'status', ''), 'planned');
  if not (v_status = any(public.chatgpt_pilot_planned_allowed_statuses())) then
    v_errors := array_append(v_errors, 'status is not allowed');
  end if;

  if p_session ? 'planned_duration_min' and nullif(p_session ->> 'planned_duration_min', '') is not null then
    begin
      v_duration_min := (p_session ->> 'planned_duration_min')::integer;
      if v_duration_min < 0 then
        v_errors := array_append(v_errors, 'planned_duration_min must be >= 0');
      end if;
    exception when others then
      v_errors := array_append(v_errors, 'planned_duration_min must be integer');
    end;
  else
    v_duration_min := null;
  end if;

  if p_session ? 'planned_duration_max' and nullif(p_session ->> 'planned_duration_max', '') is not null then
    begin
      v_duration_max := (p_session ->> 'planned_duration_max')::integer;
      if v_duration_max < 0 then
        v_errors := array_append(v_errors, 'planned_duration_max must be >= 0');
      end if;
    exception when others then
      v_errors := array_append(v_errors, 'planned_duration_max must be integer');
    end;
  else
    v_duration_max := null;
  end if;

  if v_duration_min is not null and v_duration_max is not null and v_duration_min > v_duration_max then
    v_errors := array_append(v_errors, 'planned_duration_min cannot exceed planned_duration_max');
  end if;

  if p_session ? 'constraints' and jsonb_typeof(p_session -> 'constraints') <> 'array' then
    v_errors := array_append(v_errors, 'constraints must be an array');
  end if;

  if p_session ? 'readiness_snapshot' and jsonb_typeof(p_session -> 'readiness_snapshot') <> 'object' then
    v_errors := array_append(v_errors, 'readiness_snapshot must be an object');
  end if;

  if p_session ? 'blocks' then
    if jsonb_typeof(p_session -> 'blocks') <> 'array' then
      v_errors := array_append(v_errors, 'blocks must be an array');
    elsif jsonb_array_length(p_session -> 'blocks') > 12 then
      v_errors := array_append(v_errors, 'blocks cannot exceed 12');
    else
      v_blocks := p_session -> 'blocks';
    end if;
  end if;

  for v_block in select value from jsonb_array_elements(v_blocks)
  loop
    v_block_index := v_block_index + 1;

    if jsonb_typeof(v_block) <> 'object' then
      v_errors := array_append(v_errors, format('blocks[%s] must be an object', v_block_index - 1));
      continue;
    end if;

    if length(trim(coalesce(v_block ->> 'title', ''))) = 0 then
      v_errors := array_append(v_errors, format('blocks[%s].title is required', v_block_index - 1));
    end if;

    if v_block ? 'block_order' and nullif(v_block ->> 'block_order', '') is not null then
      begin
        if (v_block ->> 'block_order')::integer <= 0 then
          v_errors := array_append(v_errors, format('blocks[%s].block_order must be > 0', v_block_index - 1));
        end if;
      exception when others then
        v_errors := array_append(v_errors, format('blocks[%s].block_order must be integer', v_block_index - 1));
      end;
    end if;

    if v_block ? 'planned_duration_seconds' and nullif(v_block ->> 'planned_duration_seconds', '') is not null then
      begin
        if (v_block ->> 'planned_duration_seconds')::integer < 0 then
          v_errors := array_append(v_errors, format('blocks[%s].planned_duration_seconds must be >= 0', v_block_index - 1));
        end if;
      exception when others then
        v_errors := array_append(v_errors, format('blocks[%s].planned_duration_seconds must be integer', v_block_index - 1));
      end;
    end if;

    if v_block ? 'planned_rounds' and nullif(v_block ->> 'planned_rounds', '') is not null then
      begin
        if (v_block ->> 'planned_rounds')::integer < 0 then
          v_errors := array_append(v_errors, format('blocks[%s].planned_rounds must be >= 0', v_block_index - 1));
        end if;
      exception when others then
        v_errors := array_append(v_errors, format('blocks[%s].planned_rounds must be integer', v_block_index - 1));
      end;
    end if;

    if v_block ? 'planned_exercises' and jsonb_typeof(v_block -> 'planned_exercises') <> 'array' then
      v_errors := array_append(v_errors, format('blocks[%s].planned_exercises must be an array', v_block_index - 1));
    end if;

    if v_block ? 'constraints' and jsonb_typeof(v_block -> 'constraints') <> 'array' then
      v_errors := array_append(v_errors, format('blocks[%s].constraints must be an array', v_block_index - 1));
    end if;
  end loop;

  return jsonb_build_object(
    'valid', coalesce(array_length(v_errors, 1), 0) = 0,
    'ok', coalesce(array_length(v_errors, 1), 0) = 0,
    'blocks_count', jsonb_array_length(v_blocks),
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

create or replace function public.chatgpt_pilot_preview_planned_session(p_session jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation jsonb;
  v_config record;
  v_existing_id uuid;
  v_time_is_valid boolean;
begin
  v_validation := public.chatgpt_pilot_validate_planned_session(p_session);

  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  v_time_is_valid := coalesce(p_session ->> 'planned_time', '') = ''
    or coalesce(p_session ->> 'planned_time', '') ~ '^\d{2}:\d{2}(:\d{2})?$';

  if v_config.pilot_user_id is not null
    and coalesce(p_session ->> 'planned_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and length(trim(coalesce(p_session ->> 'title', ''))) > 0
    and v_time_is_valid then
    select id
    into v_existing_id
    from public.planned_training_sessions
    where user_id = v_config.pilot_user_id
      and planned_date = (p_session ->> 'planned_date')::date
      and planned_time is not distinct from nullif(p_session ->> 'planned_time', '')::time
      and title = public.chatgpt_pilot_truncate_text(p_session ->> 'title', 160)
    order by updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'valid', (v_validation ->> 'valid')::boolean,
    'ok', (v_validation ->> 'ok')::boolean,
    'dry_run', true,
    'existing_planned_session_id', v_existing_id,
    'blocks_count', coalesce((v_validation ->> 'blocks_count')::integer, 0),
    'normalized_session', jsonb_build_object(
      'planned_date', p_session ->> 'planned_date',
      'planned_time', nullif(p_session ->> 'planned_time', ''),
      'title', p_session ->> 'title',
      'session_type', p_session ->> 'session_type',
      'status', coalesce(nullif(p_session ->> 'status', ''), 'planned'),
      'planned_intensity', nullif(p_session ->> 'planned_intensity', ''),
      'planned_duration_min', case
        when coalesce(p_session ->> 'planned_duration_min', '') ~ '^\d+$' then (p_session ->> 'planned_duration_min')::integer
        else null
      end,
      'planned_duration_max', case
        when coalesce(p_session ->> 'planned_duration_max', '') ~ '^\d+$' then (p_session ->> 'planned_duration_max')::integer
        else null
      end
    ),
    'errors', coalesce(v_validation -> 'errors', '[]'::jsonb),
    'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
  );
end;
$$;

create or replace function public.chatgpt_pilot_apply_planned_session(p_session jsonb)
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
  v_block jsonb;
  v_planned_session_id uuid;
  v_planned_date date;
  v_planned_time time;
  v_status text;
  v_constraints jsonb;
  v_readiness jsonb;
  v_inserted boolean := false;
  v_inserted_blocks integer := 0;
  v_block_order integer;
  v_block_index integer := 0;
begin
  v_validation := public.chatgpt_pilot_validate_planned_session(p_session);
  if not (v_validation ->> 'ok')::boolean then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'planned_session_id', null,
      'inserted', false,
      'updated', false,
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
      'planned_session_id', null,
      'inserted', false,
      'updated', false,
      'inserted_blocks', 0,
      'errors', jsonb_build_array('pilot config missing, disabled, or missing user'),
      'warnings', '[]'::jsonb
    );
  end if;

  v_user_id := v_config.pilot_user_id;
  v_source := coalesce(nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'source', 80), ''), 'chatgpt_pilot');
  v_planned_date := (p_session ->> 'planned_date')::date;
  v_planned_time := nullif(p_session ->> 'planned_time', '')::time;
  v_status := coalesce(nullif(p_session ->> 'status', ''), 'planned');
  v_constraints := case
    when jsonb_typeof(p_session -> 'constraints') = 'array' then p_session -> 'constraints'
    else '[]'::jsonb
  end;
  v_readiness := case
    when jsonb_typeof(p_session -> 'readiness_snapshot') = 'object' then p_session -> 'readiness_snapshot'
    else null
  end;

  select id
  into v_planned_session_id
  from public.planned_training_sessions
  where user_id = v_user_id
    and planned_date = v_planned_date
    and planned_time is not distinct from v_planned_time
    and title = public.chatgpt_pilot_truncate_text(p_session ->> 'title', 160)
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
      public.chatgpt_pilot_truncate_text(p_session ->> 'title', 160),
      public.chatgpt_pilot_truncate_text(p_session ->> 'session_type', 80),
      v_status,
      nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'location_type', 80), ''),
      nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'planned_intensity', 80), ''),
      nullif(p_session ->> 'planned_duration_min', '')::integer,
      nullif(p_session ->> 'planned_duration_max', '')::integer,
      nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'objective', 700), ''),
      nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'coach_notes', 900), ''),
      v_constraints,
      v_readiness,
      v_source,
      null
    )
    returning id into v_planned_session_id;
    v_inserted := true;
  else
    update public.planned_training_sessions
    set session_type = public.chatgpt_pilot_truncate_text(p_session ->> 'session_type', 80),
        status = v_status,
        location_type = nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'location_type', 80), ''),
        planned_intensity = nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'planned_intensity', 80), ''),
        planned_duration_min = nullif(p_session ->> 'planned_duration_min', '')::integer,
        planned_duration_max = nullif(p_session ->> 'planned_duration_max', '')::integer,
        objective = nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'objective', 700), ''),
        coach_notes = nullif(public.chatgpt_pilot_truncate_text(p_session ->> 'coach_notes', 900), ''),
        constraints = v_constraints,
        readiness_snapshot = v_readiness,
        source = v_source,
        linked_completed_session_id = null,
        updated_at = now()
    where id = v_planned_session_id;
  end if;

  delete from public.planned_session_blocks
  where planned_session_id = v_planned_session_id;

  if jsonb_typeof(p_session -> 'blocks') = 'array' then
    for v_block in select value from jsonb_array_elements(p_session -> 'blocks')
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

  return jsonb_build_object(
    'ok', true,
    'valid', true,
    'planned_session_id', v_planned_session_id,
    'inserted', v_inserted,
    'updated', not v_inserted,
    'inserted_blocks', v_inserted_blocks,
    'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
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
  v_week_validation jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_session jsonb;
  v_session_preview jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_duplicates jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_blocks_count integer := 0;
begin
  v_week_validation := public.chatgpt_pilot_validate_week_plan(p_plan);

  if jsonb_typeof(p_plan -> 'sessions') = 'array' then
    v_sessions := p_plan -> 'sessions';
  end if;

  for v_session in select value from jsonb_array_elements(v_sessions)
  loop
    v_session_preview := public.chatgpt_pilot_preview_planned_session(v_session);
    v_blocks_count := v_blocks_count + coalesce((v_session_preview ->> 'blocks_count')::integer, 0);
    v_normalized := v_normalized || jsonb_build_array(v_session_preview -> 'normalized_session');
    v_errors := v_errors || coalesce(v_session_preview -> 'errors', '[]'::jsonb);

    if v_session_preview ->> 'existing_planned_session_id' is not null then
      v_duplicates := v_duplicates || jsonb_build_array(jsonb_build_object(
        'planned_date', v_session ->> 'planned_date',
        'planned_time', nullif(v_session ->> 'planned_time', ''),
        'title', v_session ->> 'title',
        'existing_planned_session_id', v_session_preview ->> 'existing_planned_session_id'
      ));
    end if;
  end loop;

  v_errors := coalesce(v_week_validation -> 'errors', '[]'::jsonb) || v_errors;

  return jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'ok', jsonb_array_length(v_errors) = 0,
    'dry_run', true,
    'week_start', v_week_validation ->> 'week_start',
    'sessions_count', jsonb_array_length(v_sessions),
    'blocks_count', v_blocks_count,
    'dates', (
      select coalesce(jsonb_agg(distinct value ->> 'planned_date'), '[]'::jsonb)
      from jsonb_array_elements(v_sessions)
    ),
    'possible_duplicates', v_duplicates,
    'normalized_sessions', v_normalized,
    'errors', v_errors,
    'warnings', coalesce(v_week_validation -> 'warnings', '[]'::jsonb)
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
  v_preview jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_session jsonb;
  v_session_apply jsonb;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_inserted_or_updated_sessions integer := 0;
  v_inserted_blocks integer := 0;
  v_week_source text;
begin
  v_preview := public.chatgpt_pilot_preview_week_plan(p_plan);
  if not (v_preview ->> 'ok')::boolean then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'week_start', v_preview ->> 'week_start',
      'inserted_or_updated_sessions', 0,
      'inserted_blocks', 0,
      'session_results', '[]'::jsonb,
      'errors', coalesce(v_preview -> 'errors', '[]'::jsonb),
      'warnings', coalesce(v_preview -> 'warnings', '[]'::jsonb)
    );
  end if;

  if jsonb_typeof(p_plan -> 'sessions') = 'array' then
    v_sessions := p_plan -> 'sessions';
  end if;

  v_week_source := coalesce(nullif(p_plan ->> 'source', ''), 'chatgpt_pilot');

  for v_session in select value from jsonb_array_elements(v_sessions)
  loop
    v_session_apply := public.chatgpt_pilot_apply_planned_session(
      case
        when v_session ? 'source' then v_session
        else v_session || jsonb_build_object('source', v_week_source)
      end
    );

    v_results := v_results || jsonb_build_array(v_session_apply);

    if (v_session_apply ->> 'ok')::boolean then
      v_inserted_or_updated_sessions := v_inserted_or_updated_sessions + 1;
      v_inserted_blocks := v_inserted_blocks + coalesce((v_session_apply ->> 'inserted_blocks')::integer, 0);
    else
      v_errors := v_errors || coalesce(v_session_apply -> 'errors', '[]'::jsonb);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'valid', jsonb_array_length(v_errors) = 0,
    'week_start', p_plan ->> 'week_start',
    'inserted_or_updated_sessions', v_inserted_or_updated_sessions,
    'inserted_blocks', v_inserted_blocks,
    'session_results', v_results,
    'errors', v_errors,
    'warnings', coalesce(v_preview -> 'warnings', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.chatgpt_pilot_validate_planned_session(jsonb) from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_preview_planned_session(jsonb) from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_apply_planned_session(jsonb) from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_preview_week_plan(jsonb) from public, anon, authenticated;
revoke all on function public.chatgpt_pilot_apply_week_plan(jsonb) from public, anon, authenticated;

grant execute on function public.chatgpt_pilot_preview_planned_session(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_apply_planned_session(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_preview_week_plan(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_apply_week_plan(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_validate_planned_session(jsonb) to service_role;

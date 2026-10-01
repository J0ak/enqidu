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

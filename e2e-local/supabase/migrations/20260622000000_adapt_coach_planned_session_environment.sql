-- Coach Actions V1: recompute and replace one ENQIDU-generated planned
-- session for an explicit training environment. Browser planning tables remain
-- read-only; only the server-side service role can execute this writer.

create or replace function public.adapt_coach_planned_session_environment(
  p_user_id uuid,
  p_planned_date date,
  p_planned_session_id uuid,
  p_session jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_source text;
  v_status text;
  v_linked_completed_session_id uuid;
  v_title text;
  v_session_type text;
  v_environment text;
  v_intensity text;
  v_objective text;
  v_duration integer;
  v_blocks jsonb;
  v_block jsonb;
  v_block_order integer := 0;
  v_block_duration integer;
begin
  if p_user_id is null or p_planned_date is null
     or p_planned_session_id is null or p_session is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_planned_date::text, 0)
  );

  select source, status, linked_completed_session_id
    into v_source, v_status, v_linked_completed_session_id
  from public.planned_training_sessions
  where id = p_planned_session_id
    and user_id = p_user_id
    and planned_date = p_planned_date
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'source_plan_not_found');
  end if;

  if v_source <> 'enkidu_coach' then
    return jsonb_build_object('ok', false, 'error', 'unsupported_plan_source');
  end if;

  if v_linked_completed_session_id is not null or v_status = 'skipped' then
    return jsonb_build_object('ok', false, 'error', 'source_plan_not_adaptable');
  end if;

  v_title := left(trim(coalesce(p_session ->> 'title', '')), 160);
  v_session_type := left(trim(coalesce(p_session ->> 'session_type', '')), 80);
  v_environment := left(trim(coalesce(p_session ->> 'environment', '')), 80);
  v_intensity := nullif(left(trim(coalesce(p_session ->> 'intensity', '')), 80), '');
  v_objective := nullif(left(trim(coalesce(p_session ->> 'objective', '')), 700), '');

  if v_title = '' or v_session_type = '' or v_environment = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_recommendation');
  end if;

  if v_environment not in ('home', 'pool', 'trail', 'outdoor', 'functional_training_center') then
    return jsonb_build_object('ok', false, 'error', 'invalid_location');
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

  update public.planned_training_sessions
  set title = v_title,
      session_type = v_session_type,
      status = 'modified',
      location_type = v_environment,
      planned_intensity = v_intensity,
      planned_duration_min = v_duration,
      planned_duration_max = v_duration,
      objective = v_objective,
      coach_notes = 'Adaptada desde una instrucción explícita del Coach ENQIDU.',
      updated_at = now()
  where id = p_planned_session_id
    and user_id = p_user_id
    and planned_date = p_planned_date;

  delete from public.planned_session_blocks
  where planned_session_id = p_planned_session_id;

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
      p_planned_session_id,
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
    'planned_session_id', p_planned_session_id,
    'title', v_title,
    'session_type', v_session_type,
    'environment', v_environment,
    'duration_minutes', v_duration,
    'inserted_blocks', v_block_order
  );
end;
$$;

revoke execute on function public.adapt_coach_planned_session_environment(uuid, date, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.adapt_coach_planned_session_environment(uuid, date, uuid, jsonb)
  to service_role;

grant update (
  title,
  session_type,
  status,
  location_type,
  planned_intensity,
  planned_duration_min,
  planned_duration_max,
  objective,
  coach_notes,
  updated_at
) on table public.planned_training_sessions to service_role;

grant insert, delete on table public.planned_session_blocks to service_role;

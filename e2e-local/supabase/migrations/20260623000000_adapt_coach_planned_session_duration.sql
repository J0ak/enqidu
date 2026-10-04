-- Coach Actions V1: deterministically adjust the duration of one
-- ENQIDU-generated planned session while preserving its block structure.
-- The browser remains read-only; only the service-role RPC may write.

create or replace function public.adapt_coach_planned_session_duration(
  p_user_id uuid,
  p_planned_date date,
  p_planned_session_id uuid,
  p_duration_minutes integer,
  p_blocks jsonb
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
  v_current_block_count integer;
  v_payload_block_count integer;
  v_payload_distinct_count integer;
  v_matching_block_count integer;
  v_total_seconds integer;
  v_block jsonb;
  v_block_id_text text;
  v_block_seconds integer;
begin
  if p_user_id is null or p_planned_date is null
     or p_planned_session_id is null or p_duration_minutes is null
     or p_blocks is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  if p_duration_minutes < 10 or p_duration_minutes > 180 then
    return jsonb_build_object('ok', false, 'error', 'invalid_duration');
  end if;

  if jsonb_typeof(p_blocks) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  end if;

  v_payload_block_count := jsonb_array_length(p_blocks);
  if v_payload_block_count < 1 or v_payload_block_count > 12 then
    return jsonb_build_object('ok', false, 'error', 'invalid_blocks');
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

  select count(*)
    into v_current_block_count
  from public.planned_session_blocks
  where planned_session_id = p_planned_session_id;

  if v_current_block_count <> v_payload_block_count then
    return jsonb_build_object('ok', false, 'error', 'block_set_mismatch');
  end if;

  select count(distinct value ->> 'id')
    into v_payload_distinct_count
  from jsonb_array_elements(p_blocks);

  if v_payload_distinct_count <> v_payload_block_count then
    return jsonb_build_object('ok', false, 'error', 'block_set_mismatch');
  end if;

  select count(*)
    into v_matching_block_count
  from public.planned_session_blocks psb
  where psb.planned_session_id = p_planned_session_id
    and exists (
      select 1
      from jsonb_array_elements(p_blocks) item
      where item ->> 'id' = psb.id::text
    );

  if v_matching_block_count <> v_current_block_count then
    return jsonb_build_object('ok', false, 'error', 'block_set_mismatch');
  end if;

  v_total_seconds := 0;
  for v_block in
    select value from jsonb_array_elements(p_blocks)
  loop
    v_block_id_text := trim(coalesce(v_block ->> 'id', ''));
    if v_block_id_text = '' then
      return jsonb_build_object('ok', false, 'error', 'invalid_block');
    end if;

    if coalesce(v_block ->> 'duration_seconds', '') !~ '^\d+$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_block_duration');
    end if;

    v_block_seconds := (v_block ->> 'duration_seconds')::integer;
    if v_block_seconds < 60 or v_block_seconds > 10800 or mod(v_block_seconds, 60) <> 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_block_duration');
    end if;

    v_total_seconds := v_total_seconds + v_block_seconds;
  end loop;

  if v_total_seconds <> p_duration_minutes * 60 then
    return jsonb_build_object('ok', false, 'error', 'duration_sum_mismatch');
  end if;

  update public.planned_training_sessions
  set planned_duration_min = p_duration_minutes,
      planned_duration_max = p_duration_minutes,
      status = 'modified',
      coach_notes = 'Duración adaptada desde una instrucción explícita del Coach ENQIDU.',
      updated_at = now()
  where id = p_planned_session_id
    and user_id = p_user_id
    and planned_date = p_planned_date;

  for v_block in
    select value from jsonb_array_elements(p_blocks)
  loop
    update public.planned_session_blocks
    set planned_duration_seconds = (v_block ->> 'duration_seconds')::integer
    where planned_session_id = p_planned_session_id
      and id::text = v_block ->> 'id';

    if not found then
      raise exception 'validated block disappeared during duration adaptation';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'planned_session_id', p_planned_session_id,
    'duration_minutes', p_duration_minutes,
    'updated_blocks', v_payload_block_count
  );
end;
$$;

revoke execute on function public.adapt_coach_planned_session_duration(uuid, date, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.adapt_coach_planned_session_duration(uuid, date, uuid, integer, jsonb)
  to service_role;

grant update (
  planned_duration_min,
  planned_duration_max,
  status,
  coach_notes,
  updated_at
) on table public.planned_training_sessions to service_role;

grant update (planned_duration_seconds)
  on table public.planned_session_blocks to service_role;

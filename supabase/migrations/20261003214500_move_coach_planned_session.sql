-- Coach Actions V1: move one planned session to a future target date.
-- Browser planning tables remain read-only. The service-role-only RPC performs
-- a narrow update after the Edge Function validates the authenticated command.

create or replace function public.move_coach_planned_session(
  p_user_id uuid,
  p_source_date date,
  p_target_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_source_count integer;
  v_source_id uuid;
  v_source_title text;
  v_source_status text;
  v_linked_completed_session_id uuid;
  v_target_id uuid;
begin
  if p_user_id is null or p_source_date is null or p_target_date is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  if p_target_date <= p_source_date then
    return jsonb_build_object('ok', false, 'error', 'invalid_target_date');
  end if;

  -- Use the same date-scoped advisory-lock namespace as recommendation saves.
  -- Lock in chronological order so concurrent moves cannot invert lock order.
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_source_date::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || p_target_date::text, 0)
  );

  select count(*), min(id)
    into v_source_count, v_source_id
  from public.planned_training_sessions
  where user_id = p_user_id
    and planned_date = p_source_date;

  if v_source_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'source_plan_not_found');
  end if;

  if v_source_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'source_plan_ambiguous');
  end if;

  select title, status, linked_completed_session_id
    into v_source_title, v_source_status, v_linked_completed_session_id
  from public.planned_training_sessions
  where id = v_source_id;

  if v_linked_completed_session_id is not null
     or v_source_status = 'skipped' then
    return jsonb_build_object('ok', false, 'error', 'source_plan_not_movable');
  end if;

  select id
    into v_target_id
  from public.planned_training_sessions
  where user_id = p_user_id
    and planned_date = p_target_date
  order by created_at asc
  limit 1;

  if v_target_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'target_plan_already_exists',
      'planned_session_id', v_target_id
    );
  end if;

  update public.planned_training_sessions
  set planned_date = p_target_date,
      status = 'rescheduled',
      updated_at = now()
  where id = v_source_id
    and user_id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'source_plan_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'planned_session_id', v_source_id,
    'title', v_source_title,
    'source_date', p_source_date,
    'target_date', p_target_date
  );
end;
$$;

revoke execute on function public.move_coach_planned_session(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.move_coach_planned_session(uuid, date, date)
  to service_role;

grant update (planned_date, status, updated_at)
  on table public.planned_training_sessions
  to service_role;

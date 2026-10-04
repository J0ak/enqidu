-- Coach Actions V1: adapt the remaining current week after explicit
-- availability changes. The Edge Function computes a deterministic move set;
-- this service-role-only RPC revalidates and applies it atomically.

create or replace function public.adapt_coach_remaining_week(
  p_user_id uuid,
  p_from_date date,
  p_to_date date,
  p_moves jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_move jsonb;
  v_move_ids uuid[];
  v_move_id uuid;
  v_source_date date;
  v_target_date date;
  v_source text;
  v_status text;
  v_linked_completed_session_id uuid;
  v_conflict_id uuid;
  v_lock_date date;
  v_moved_count integer := 0;
begin
  if p_user_id is null
     or p_from_date is null
     or p_to_date is null
     or p_moves is null
     or jsonb_typeof(p_moves) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  if p_to_date < p_from_date
     or p_to_date > p_from_date + 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_week_range');
  end if;

  if jsonb_array_length(p_moves) > 7 then
    return jsonb_build_object('ok', false, 'error', 'too_many_moves');
  end if;

  if jsonb_array_length(p_moves) = 0 then
    return jsonb_build_object(
      'ok', true,
      'adapted', false,
      'moved_count', 0,
      'moves', '[]'::jsonb
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_moves) as item(value)
    group by value ->> 'planned_session_id'
    having count(*) > 1
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_planned_session');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_moves) as item(value)
    group by value ->> 'target_date'
    having count(*) > 1
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_target_date');
  end if;

  select array_agg((value ->> 'planned_session_id')::uuid)
    into v_move_ids
  from jsonb_array_elements(p_moves);

  -- Lock the whole remaining-week date namespace in chronological order so
  -- recommendation saves, single-session moves and this batch cannot race.
  v_lock_date := p_from_date;
  while v_lock_date <= p_to_date loop
    perform pg_advisory_xact_lock(
      hashtextextended(p_user_id::text || '|' || v_lock_date::text, 0)
    );
    v_lock_date := v_lock_date + 1;
  end loop;

  -- Validation pass: no writes occur until every move is known to be safe.
  for v_move in
    select value from jsonb_array_elements(p_moves)
  loop
    v_move_id := (v_move ->> 'planned_session_id')::uuid;
    v_source_date := (v_move ->> 'source_date')::date;
    v_target_date := (v_move ->> 'target_date')::date;

    if v_source_date < p_from_date
       or v_source_date > p_to_date
       or v_target_date < p_from_date
       or v_target_date > p_to_date
       or v_target_date <= v_source_date then
      return jsonb_build_object('ok', false, 'error', 'invalid_move_date');
    end if;

    select source, status, linked_completed_session_id
      into v_source, v_status, v_linked_completed_session_id
    from public.planned_training_sessions
    where id = v_move_id
      and user_id = p_user_id
      and planned_date = v_source_date
      and status <> 'cancelled'
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'source_plan_not_found');
    end if;

    if v_source <> 'enkidu_coach' then
      return jsonb_build_object('ok', false, 'error', 'unsupported_plan_source');
    end if;

    if v_linked_completed_session_id is not null
       or v_status = 'skipped' then
      return jsonb_build_object('ok', false, 'error', 'source_plan_not_adaptable');
    end if;

    select id
      into v_conflict_id
    from public.planned_training_sessions
    where user_id = p_user_id
      and planned_date = v_target_date
      and status <> 'cancelled'
      and not (id = any(v_move_ids))
    order by created_at asc
    limit 1;

    if v_conflict_id is not null then
      return jsonb_build_object(
        'ok', false,
        'error', 'target_plan_already_exists',
        'planned_session_id', v_conflict_id
      );
    end if;
  end loop;

  -- Apply pass. Row locks plus date advisory locks keep this atomic.
  for v_move in
    select value from jsonb_array_elements(p_moves)
    order by (value ->> 'source_date')::date desc
  loop
    v_move_id := (v_move ->> 'planned_session_id')::uuid;
    v_source_date := (v_move ->> 'source_date')::date;
    v_target_date := (v_move ->> 'target_date')::date;

    update public.planned_training_sessions
    set planned_date = v_target_date,
        status = 'rescheduled',
        updated_at = now()
    where id = v_move_id
      and user_id = p_user_id
      and planned_date = v_source_date
      and status <> 'cancelled';

    if not found then
      raise exception 'remaining_week_concurrent_change';
    end if;

    v_moved_count := v_moved_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'adapted', true,
    'moved_count', v_moved_count,
    'moves', p_moves
  );
end;
$$;

revoke execute on function public.adapt_coach_remaining_week(uuid, date, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.adapt_coach_remaining_week(uuid, date, date, jsonb)
  to service_role;

grant update (planned_date, status, updated_at)
  on table public.planned_training_sessions
  to service_role;

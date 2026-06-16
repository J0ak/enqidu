-- Backfill existing decoded FIT payloads into existing Garmin relational tables.
-- Non-destructive: inserts only when the target session currently has 0 rows.
-- Target session: eedf9854-3176-4d82-b8df-c2bdf1ab1df3

with target_session as (
  select 'eedf9854-3176-4d82-b8df-c2bdf1ab1df3'::uuid as session_id
), source_rows as (
  select
    f.session_id,
    f.message_type,
    f.message_order,
    f.payload,
    row_number() over (partition by f.message_type order by f.message_order) as row_order,
    coalesce(
      nullif(f.payload->>'total_elapsed_time', '')::numeric,
      nullif(f.payload->>'total_elapsed_time_seconds', '')::numeric,
      nullif(f.payload->>'elapsed_time', '')::numeric,
      nullif(f.payload->>'duration', '')::numeric,
      nullif(f.payload->>'total_timer_time', '')::numeric,
      nullif(f.payload->>'timer_time', '')::numeric
    ) as elapsed_seconds,
    coalesce(
      nullif(f.payload->>'total_timer_time', '')::numeric,
      nullif(f.payload->>'total_timer_time_seconds', '')::numeric,
      nullif(f.payload->>'timer_time', '')::numeric,
      nullif(f.payload->>'active_time', '')::numeric,
      nullif(f.payload->>'duration', '')::numeric
    ) as active_seconds,
    coalesce(
      nullif(f.payload->>'repetitions', '')::integer,
      nullif(f.payload->>'reps', '')::integer,
      nullif(f.payload->>'num_reps', '')::integer
    ) as repetitions,
    coalesce(nullif(f.payload->>'total_distance', '')::numeric, nullif(f.payload->>'distance', '')::numeric) as distance_meters,
    coalesce(nullif(f.payload->>'avg_heart_rate', '')::integer, nullif(f.payload->>'average_heart_rate', '')::integer) as hr_avg,
    coalesce(nullif(f.payload->>'max_heart_rate', '')::integer, nullif(f.payload->>'maximum_heart_rate', '')::integer) as hr_max
  from public.fit_message_payloads f
  join target_session ts on ts.session_id = f.session_id
  where f.message_type in ('set', 'lap', 'split', 'workout_step')
), preferred_rows as (
  select *
  from source_rows
  where message_type = case
    when exists (select 1 from source_rows where message_type = 'set') then 'set'
    when exists (select 1 from source_rows where message_type = 'lap') then 'lap'
    when exists (select 1 from source_rows where message_type = 'split') then 'split'
    else 'workout_step'
  end
), windows as (
  select
    *,
    coalesce(
      sum(coalesce(elapsed_seconds, active_seconds, 0)) over (order by row_order rows between unbounded preceding and 1 preceding),
      0
    ) as start_elapsed_seconds
  from preferred_rows
), normalized as (
  select
    session_id,
    row_order,
    'garmin_fit_' || message_type as source,
    payload,
    round(start_elapsed_seconds)::integer as start_elapsed_seconds,
    round(start_elapsed_seconds + coalesce(elapsed_seconds, active_seconds, 0))::integer as end_elapsed_seconds,
    round(coalesce(elapsed_seconds, active_seconds, 0))::integer as duration_seconds,
    round(active_seconds)::integer as active_seconds,
    greatest(0, round(coalesce(elapsed_seconds, active_seconds, 0) - coalesce(active_seconds, 0)))::integer as rest_seconds,
    repetitions,
    distance_meters,
    hr_avg,
    hr_max,
    coalesce(payload->>'exercise_name', payload->>'name', payload->>'category', payload->>'sport') as garmin_exercise_name,
    nullif(payload->>'weight', '')::numeric as load_value,
    case when payload ? 'weight' then coalesce(payload->>'load_unit', 'kg') end as load_unit
  from windows
  where coalesce(elapsed_seconds, active_seconds, repetitions, distance_meters) is not null
), inserted_sets as (
  insert into public.session_garmin_sets (
    session_id,
    source,
    series_order,
    garmin_exercise_name,
    start_elapsed_seconds,
    end_elapsed_seconds,
    duration_seconds,
    active_seconds,
    rest_seconds,
    repetitions,
    load_value,
    load_unit,
    heart_rate_avg_bpm,
    heart_rate_max_bpm,
    raw_payload,
    confidence
  )
  select
    n.session_id,
    n.source,
    n.row_order,
    n.garmin_exercise_name,
    n.start_elapsed_seconds,
    n.end_elapsed_seconds,
    n.duration_seconds,
    n.active_seconds,
    n.rest_seconds,
    n.repetitions,
    n.load_value,
    n.load_unit,
    n.hr_avg,
    n.hr_max,
    n.payload,
    case when n.source in ('garmin_fit_set', 'garmin_fit_lap') then 'reported' else 'derived_from_fit_payload' end
  from normalized n
  where not exists (
    select 1 from public.session_garmin_sets existing where existing.session_id = n.session_id
  )
  on conflict (session_id, source, series_order) do nothing
  returning id
), inserted_laps as (
  insert into public.session_laps (
    session_id,
    lap_index,
    source,
    start_elapsed_seconds,
    end_elapsed_seconds,
    duration_seconds,
    active_seconds,
    rest_seconds,
    distance_meters,
    heart_rate_avg_bpm,
    heart_rate_max_bpm,
    raw_payload
  )
  select
    n.session_id,
    n.row_order,
    n.source,
    n.start_elapsed_seconds,
    n.end_elapsed_seconds,
    n.duration_seconds,
    n.active_seconds,
    n.rest_seconds,
    n.distance_meters,
    n.hr_avg,
    n.hr_max,
    n.payload
  from normalized n
  where not exists (
    select 1 from public.session_laps existing where existing.session_id = n.session_id
  )
  returning id
)
select
  (select count(*) from inserted_sets) as inserted_garmin_sets,
  (select count(*) from inserted_laps) as inserted_session_laps;

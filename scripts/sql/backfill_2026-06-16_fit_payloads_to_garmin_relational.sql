-- Backfill existing decoded FIT payloads into existing Garmin relational tables.
-- Non-destructive: inserts only when the target session currently has 0 rows in
-- the matching target table. Does not create tables, delete data, update sessions,
-- or touch session_blocks.
-- Target session: eedf9854-3176-4d82-b8df-c2bdf1ab1df3

with target_session as (
  select 'eedf9854-3176-4d82-b8df-c2bdf1ab1df3'::uuid as session_id
), source_rows as (
  select
    f.session_id,
    lower(f.message_type) as message_type,
    f.message_order,
    f.payload,
    coalesce(
      nullif(f.payload->>'message_index', '')::integer,
      nullif(f.payload->>'message_number', '')::integer,
      nullif(f.payload->>'lap_index', '')::integer,
      nullif(f.payload->>'split_index', '')::integer,
      nullif(f.payload->>'set_index', '')::integer,
      row_number() over (partition by lower(f.message_type) order by f.message_order)
    ) as fit_order,
    row_number() over (partition by lower(f.message_type) order by f.message_order) as row_order,
    coalesce(
      nullif(f.payload->>'start_elapsed_seconds', '')::numeric,
      nullif(f.payload->>'start_time_seconds', '')::numeric,
      nullif(f.payload->>'start_elapsed_time', '')::numeric
    ) as explicit_start_seconds,
    coalesce(
      nullif(f.payload->>'end_elapsed_seconds', '')::numeric,
      nullif(f.payload->>'end_time_seconds', '')::numeric,
      nullif(f.payload->>'end_elapsed_time', '')::numeric
    ) as explicit_end_seconds,
    coalesce(
      nullif(f.payload->>'duration_seconds', '')::numeric,
      nullif(f.payload->>'total_elapsed_time', '')::numeric,
      nullif(f.payload->>'total_elapsed_time_seconds', '')::numeric,
      nullif(f.payload->>'elapsed_time', '')::numeric,
      nullif(f.payload->>'duration', '')::numeric,
      nullif(f.payload->>'total_timer_time', '')::numeric,
      nullif(f.payload->>'timer_time', '')::numeric
    ) as elapsed_seconds,
    coalesce(
      nullif(f.payload->>'active_seconds', '')::numeric,
      nullif(f.payload->>'active_time', '')::numeric,
      nullif(f.payload->>'total_timer_time', '')::numeric,
      nullif(f.payload->>'total_timer_time_seconds', '')::numeric,
      nullif(f.payload->>'timer_time', '')::numeric,
      nullif(f.payload->>'duration', '')::numeric
    ) as active_seconds,
    coalesce(
      nullif(f.payload->>'rest_seconds', '')::numeric,
      nullif(f.payload->>'total_rest_time', '')::numeric,
      nullif(f.payload->>'elapsed_rest_time', '')::numeric
    ) as rest_seconds,
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
  where lower(f.message_type) in (
    'set', 'sets', 'workout_step', 'workout_steps',
    'lap', 'laps', 'split', 'splits', 'split_summary', 'split_summaries'
  )
), set_source_type as (
  select case
    when exists (select 1 from source_rows where message_type = 'set') then 'set'
    when exists (select 1 from source_rows where message_type = 'sets') then 'sets'
    when exists (select 1 from source_rows where message_type = 'workout_step') then 'workout_step'
    when exists (select 1 from source_rows where message_type = 'workout_steps') then 'workout_steps'
  end as message_type
), lap_source_type as (
  select case
    when exists (select 1 from source_rows where message_type = 'lap') then 'lap'
    when exists (select 1 from source_rows where message_type = 'laps') then 'laps'
    when exists (select 1 from source_rows where message_type = 'split') then 'split'
    when exists (select 1 from source_rows where message_type = 'splits') then 'splits'
    when exists (select 1 from source_rows where message_type = 'split_summary') then 'split_summary'
    when exists (select 1 from source_rows where message_type = 'split_summaries') then 'split_summaries'
  end as message_type
), set_rows as (
  select s.*
  from source_rows s
  join set_source_type t on t.message_type = s.message_type
), lap_rows as (
  select s.*
  from source_rows s
  join lap_source_type t on t.message_type = s.message_type
), set_windows as (
  select
    *,
    coalesce(
      explicit_start_seconds,
      sum(coalesce(elapsed_seconds, active_seconds, 0)) over (order by row_order rows between unbounded preceding and 1 preceding),
      0
    ) as start_elapsed_seconds
  from set_rows
), lap_windows as (
  select
    *,
    coalesce(
      explicit_start_seconds,
      sum(coalesce(elapsed_seconds, active_seconds, 0)) over (order by row_order rows between unbounded preceding and 1 preceding),
      0
    ) as start_elapsed_seconds
  from lap_rows
), normalized_sets as (
  select
    session_id,
    fit_order,
    case
      when message_type in ('workout_step', 'workout_steps') then 'garmin_fit_workout_step'
      else 'garmin_fit_set'
    end as source,
    payload,
    round(start_elapsed_seconds)::integer as start_elapsed_seconds,
    round(coalesce(explicit_end_seconds, start_elapsed_seconds + coalesce(elapsed_seconds, active_seconds, 0)))::integer as end_elapsed_seconds,
    round(coalesce(elapsed_seconds, active_seconds, 0))::integer as duration_seconds,
    round(active_seconds)::integer as active_seconds,
    round(coalesce(rest_seconds, greatest(0, coalesce(elapsed_seconds, active_seconds, 0) - coalesce(active_seconds, 0))))::integer as rest_seconds,
    repetitions,
    hr_avg,
    hr_max,
    coalesce(payload->>'exercise_name', payload->>'name', payload->>'category', payload->>'sport') as garmin_exercise_name,
    nullif(payload->>'weight', '')::numeric as load_value,
    case when payload ? 'weight' then coalesce(payload->>'load_unit', 'kg') end as load_unit
  from set_windows
  where coalesce(elapsed_seconds, active_seconds, repetitions) is not null
), normalized_laps as (
  select
    session_id,
    fit_order,
    case
      when message_type in ('split_summary', 'split_summaries') then 'garmin_fit_split_summary'
      when message_type in ('split', 'splits') then 'garmin_fit_split'
      else 'garmin_fit_lap'
    end as source,
    payload,
    round(start_elapsed_seconds)::integer as start_elapsed_seconds,
    round(coalesce(explicit_end_seconds, start_elapsed_seconds + coalesce(elapsed_seconds, active_seconds, 0)))::integer as end_elapsed_seconds,
    round(coalesce(elapsed_seconds, active_seconds, 0))::integer as duration_seconds,
    round(active_seconds)::integer as active_seconds,
    round(coalesce(rest_seconds, greatest(0, coalesce(elapsed_seconds, active_seconds, 0) - coalesce(active_seconds, 0))))::integer as rest_seconds,
    distance_meters,
    hr_avg,
    hr_max
  from lap_windows
  where coalesce(elapsed_seconds, active_seconds, distance_meters) is not null
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
    n.fit_order,
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
    case when n.source = 'garmin_fit_set' then 'reported' else 'derived_from_fit_payload' end
  from normalized_sets n
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
    n.fit_order,
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
  from normalized_laps n
  where not exists (
    select 1 from public.session_laps existing where existing.session_id = n.session_id
  )
  returning id
)
select
  (select message_type from set_source_type) as set_source_type,
  (select message_type from lap_source_type) as lap_source_type,
  (select count(*) from inserted_sets) as inserted_garmin_sets,
  (select count(*) from inserted_laps) as inserted_session_laps;

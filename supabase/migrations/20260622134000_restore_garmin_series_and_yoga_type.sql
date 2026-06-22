create or replace function public.chatgpt_pilot_get_session_detail(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config record;
  v_session record;
  v_activity_type jsonb := '{}'::jsonb;
  v_garmin jsonb := '{}'::jsonb;
  v_blocks jsonb := '[]'::jsonb;
  v_metrics jsonb := '[]'::jsonb;
  v_hr_samples jsonb := '[]'::jsonb;
  v_respiration_samples jsonb := '[]'::jsonb;
  v_laps jsonb := '[]'::jsonb;
  v_hr_zones jsonb := '[]'::jsonb;
  v_power_zones jsonb := '[]'::jsonb;
  v_hr_source text := 'session_samples';
  v_hr_total integer := 0;
  v_respiration_total integer := 0;
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if not found or not v_config.enabled then
    return jsonb_build_object(
      'ok', false,
      'error', 'pilot_disabled',
      'source_warnings', jsonb_build_array('chatgpt pilot is disabled')
    );
  end if;

  select
    ts.id,
    ts.user_id,
    ts.title,
    ts.session_kind,
    ts.session_status,
    ts.local_date,
    ts.started_at,
    ts.ended_at,
    ts.duration_seconds,
    ts.distance_meters,
    ts.session_structure,
    coalesce(src.source_type, 'manual_entry') as source_type,
    coalesce(src.import_status, 'unknown') as import_status,
    coalesce(ts.data_quality_status, 'unverified') as quality
  into v_session
  from public.training_sessions ts
  left join public.training_sources src on src.id = ts.source_id
  where ts.id = p_session_id
    and ts.user_id = v_config.pilot_user_id
    and coalesce(ts.session_status, '') <> 'archived';

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'session_not_found_for_pilot',
      'source_warnings', jsonb_build_array('session does not belong to pilot user or is unavailable')
    );
  end if;

  v_activity_type := public.chatgpt_pilot_activity_type(v_session.session_structure, v_session.title, null);
  v_garmin := coalesce(v_session.session_structure -> 'garmin_fit_summary', '{}'::jsonb);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'metric_code', sm.metric_code,
      'metric_name', sm.metric_name,
      'value_numeric', sm.value_numeric,
      'value_text', sm.value_text,
      'value_json', case
        when sm.value_json is not null
          and sm.value_json::text !~* '(raw_payload|original_payload|service_role|api_key|fit_message_payloads|wearable_provider_raw_payloads)'
        then sm.value_json
        else null
      end,
      'unit', sm.unit,
      'metric_scope', sm.metric_scope,
      'scope_reference', sm.scope_reference,
      'confidence', sm.confidence
    )
    order by sm.metric_code, sm.id
  ), '[]'::jsonb)
  into v_metrics
  from public.session_metrics sm
  where sm.session_id = p_session_id
    and coalesce(sm.metric_code, '') !~* '(raw_payload|original_payload|service_role|api_key)'
    and coalesce(sm.metric_name, '') !~* '(raw_payload|original_payload|service_role|api_key)'
    and coalesce(sm.source_path, '') !~* '(raw_payload|original_payload|fit_message_payloads|wearable_provider_raw_payloads|service_role|api_key)';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', sb.id,
      'block_order', sb.block_order,
      'block_type', sb.block_type,
      'name', sb.name,
      'duration_seconds', sb.duration_seconds,
      'active_seconds', sb.active_seconds,
      'rest_seconds', sb.rest_seconds,
      'start_elapsed_seconds', sb.start_elapsed_seconds,
      'end_elapsed_seconds', sb.end_elapsed_seconds,
      'heart_rate_avg_bpm', sb.heart_rate_avg_bpm,
      'heart_rate_max_bpm', sb.heart_rate_max_bpm,
      'rounds_completed', sb.rounds_completed,
      'execution_notes', sb.execution_notes,
      'data_confidence', sb.data_confidence,
      'objective', sb.prescription ->> 'objective',
      'summary', sb.prescription ->> 'summary',
      'constraints', case
        when jsonb_typeof(sb.prescription -> 'constraints') = 'array' then sb.prescription -> 'constraints'
        else '[]'::jsonb
      end,
      'exercises', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', se.id,
            'exercise_order', se.exercise_order,
            'reported_name', se.reported_name,
            'execution_type', se.execution_type,
            'sets_completed', se.sets_completed,
            'rounds_completed', se.rounds_completed,
            'reps_per_set', se.reps_per_set,
            'duration_seconds', se.duration_seconds,
            'load_value', se.load_value,
            'load_unit', se.load_unit,
            'equipment_snapshot', coalesce(se.equipment_snapshot, '{}'::jsonb),
            'tempo_or_pause', se.tempo_or_pause,
            'side', se.side,
            'notes', se.notes,
            'data_confidence', se.data_confidence
          )
          order by se.exercise_order nulls last, se.id
        ), '[]'::jsonb)
        from public.session_exercises se
        where se.session_id = p_session_id
          and se.block_id = sb.id
      )
    )
    order by sb.block_order nulls last, sb.id
  ), '[]'::jsonb)
  into v_blocks
  from public.session_blocks sb
  where sb.session_id = p_session_id;

  with source_rows as (
    select
      sample_order,
      recorded_at,
      elapsed_seconds,
      distance_m,
      heart_rate_bpm,
      speed_mps,
      cadence_rpm,
      power_w,
      altitude_m,
      temperature_c
    from public.session_samples
    where session_id = p_session_id
      and heart_rate_bpm is not null
  ),
  counted as (
    select
      *,
      row_number() over (order by sample_order nulls last, elapsed_seconds nulls last, recorded_at nulls last) as rn,
      count(*) over () as total_count
    from source_rows
  ),
  sampled as (
    select *
    from counted
    where total_count <= 600
      or rn = 1
      or rn = total_count
      or mod(rn - 1, greatest(1, ceiling(total_count::numeric / 600)::integer)) = 0
  )
  select
    coalesce(max(total_count), 0),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'sample_order', sample_order,
      'recorded_at', recorded_at,
      'elapsed_seconds', elapsed_seconds,
      'distance_m', distance_m,
      'heart_rate_bpm', heart_rate_bpm,
      'speed_mps', speed_mps,
      'cadence_rpm', cadence_rpm,
      'power_w', power_w,
      'altitude_m', altitude_m,
      'temperature_c', temperature_c
    )) order by rn), '[]'::jsonb)
  into v_hr_total, v_hr_samples
  from sampled;

  if jsonb_array_length(v_hr_samples) = 0 then
    v_hr_source := 'fit_records_sanitized';

    with source_rows as (
      select
        message_order as sample_order,
        payload ->> 'timestamp' as recorded_at,
        case
          when coalesce(payload ->> 'elapsed_seconds', payload ->> 'elapsed_time', payload ->> 'timer_time', '') ~ '^-?\d+(\.\d+)?$'
            then coalesce(payload ->> 'elapsed_seconds', payload ->> 'elapsed_time', payload ->> 'timer_time')::numeric
          else message_order::numeric
        end as elapsed_seconds,
        case when coalesce(payload ->> 'distance', payload ->> 'distance_m', '') ~ '^-?\d+(\.\d+)?$' then coalesce(payload ->> 'distance', payload ->> 'distance_m')::numeric else null end as distance_m,
        case when coalesce(payload ->> 'heart_rate', payload ->> 'heart_rate_bpm', '') ~ '^\d+(\.\d+)?$' then coalesce(payload ->> 'heart_rate', payload ->> 'heart_rate_bpm')::numeric else null end as heart_rate_bpm,
        case when coalesce(payload ->> 'enhanced_speed', payload ->> 'speed', payload ->> 'speed_mps', '') ~ '^-?\d+(\.\d+)?$' then coalesce(payload ->> 'enhanced_speed', payload ->> 'speed', payload ->> 'speed_mps')::numeric else null end as speed_mps,
        case when coalesce(payload ->> 'cadence', payload ->> 'cadence_rpm', '') ~ '^-?\d+(\.\d+)?$' then coalesce(payload ->> 'cadence', payload ->> 'cadence_rpm')::numeric else null end as cadence_rpm,
        case when coalesce(payload ->> 'power', payload ->> 'power_w', '') ~ '^-?\d+(\.\d+)?$' then coalesce(payload ->> 'power', payload ->> 'power_w')::numeric else null end as power_w,
        case when coalesce(payload ->> 'enhanced_altitude', payload ->> 'altitude', payload ->> 'altitude_m', '') ~ '^-?\d+(\.\d+)?$' then coalesce(payload ->> 'enhanced_altitude', payload ->> 'altitude', payload ->> 'altitude_m')::numeric else null end as altitude_m,
        case when coalesce(payload ->> 'temperature', payload ->> 'temperature_c', '') ~ '^-?\d+(\.\d+)?$' then coalesce(payload ->> 'temperature', payload ->> 'temperature_c')::numeric else null end as temperature_c
      from public.fit_message_payloads
      where session_id = p_session_id
        and message_type in ('record', 'records')
        and coalesce(payload ->> 'heart_rate', payload ->> 'heart_rate_bpm') is not null
    ),
    counted as (
      select
        *,
        row_number() over (order by sample_order nulls last, elapsed_seconds nulls last) as rn,
        count(*) over () as total_count
      from source_rows
      where heart_rate_bpm is not null
    ),
    sampled as (
      select *
      from counted
      where total_count <= 600
        or rn = 1
        or rn = total_count
        or mod(rn - 1, greatest(1, ceiling(total_count::numeric / 600)::integer)) = 0
    )
    select
      coalesce(max(total_count), 0),
      coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'sample_order', sample_order,
        'recorded_at', recorded_at,
        'elapsed_seconds', elapsed_seconds,
        'distance_m', distance_m,
        'heart_rate_bpm', heart_rate_bpm,
        'speed_mps', speed_mps,
        'cadence_rpm', cadence_rpm,
        'power_w', power_w,
        'altitude_m', altitude_m,
        'temperature_c', temperature_c
      )) order by rn), '[]'::jsonb)
    into v_hr_total, v_hr_samples
    from sampled;
  end if;

  with source_rows as (
    select
      message_order as sample_order,
      payload ->> 'timestamp' as recorded_at,
      case
        when coalesce(payload ->> 'elapsed_seconds', payload ->> 'elapsed_time', payload ->> 'timer_time', '') ~ '^-?\d+(\.\d+)?$'
          then coalesce(payload ->> 'elapsed_seconds', payload ->> 'elapsed_time', payload ->> 'timer_time')::numeric
        else message_order::numeric
      end as elapsed_seconds,
      case
        when coalesce(payload ->> 'enhanced_respiration_rate', payload ->> 'respiration_rate', payload ->> 'respiration_brpm', '') ~ '^-?\d+(\.\d+)?$'
          then coalesce(payload ->> 'enhanced_respiration_rate', payload ->> 'respiration_rate', payload ->> 'respiration_brpm')::numeric
        else null
      end as respiration_brpm
    from public.fit_message_payloads
    where session_id = p_session_id
      and message_type in ('record', 'records')
      and coalesce(payload ->> 'enhanced_respiration_rate', payload ->> 'respiration_rate', payload ->> 'respiration_brpm') is not null
  ),
  counted as (
    select
      *,
      row_number() over (order by sample_order nulls last, elapsed_seconds nulls last) as rn,
      count(*) over () as total_count
    from source_rows
    where respiration_brpm is not null
  ),
  sampled as (
    select *
    from counted
    where total_count <= 600
      or rn = 1
      or rn = total_count
      or mod(rn - 1, greatest(1, ceiling(total_count::numeric / 600)::integer)) = 0
  )
  select
    coalesce(max(total_count), 0),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'sample_order', sample_order,
      'recorded_at', recorded_at,
      'elapsed_seconds', elapsed_seconds,
      'respiration_brpm', respiration_brpm
    )) order by rn), '[]'::jsonb)
  into v_respiration_total, v_respiration_samples
  from sampled;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'lap_order', lap_order,
    'duration_seconds', duration_seconds,
    'elapsed_seconds', elapsed_seconds,
    'distance_m', distance_m,
    'calories_kcal', calories_kcal,
    'heart_rate_avg_bpm', heart_rate_avg_bpm,
    'heart_rate_max_bpm', heart_rate_max_bpm,
    'active_seconds', active_seconds,
    'rest_seconds', rest_seconds
  )) order by lap_order), '[]'::jsonb)
  into v_laps
  from public.session_laps
  where session_id = p_session_id;

  with zone_metrics as (
    select value_json
    from public.session_metrics
    where session_id = p_session_id
      and metric_code ilike any (array['%zones%', '%zone%', '%time_in_zone%'])
      and value_json is not null
      and value_json::text !~* '(raw_payload|original_payload|service_role|api_key|fit_message_payloads|wearable_provider_raw_payloads)'
  ),
  raw_zones as (
    select
      case
        when jsonb_typeof(value_json -> 'heart_rate') = 'array' then value_json -> 'heart_rate'
        when jsonb_typeof(value_json -> 'zones') = 'array' then value_json -> 'zones'
        when jsonb_typeof(value_json) = 'array' then value_json
        else '[]'::jsonb
      end as zones
    from zone_metrics
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'zone', zone ->> 'zone',
    'label', coalesce(zone ->> 'label', zone ->> 'zone'),
    'seconds', case when coalesce(zone ->> 'seconds', '') ~ '^-?\d+(\.\d+)?$' then (zone ->> 'seconds')::numeric else null end,
    'min_bpm', case when coalesce(zone ->> 'min_bpm', zone ->> 'min_heart_rate_bpm', '') ~ '^-?\d+(\.\d+)?$' then coalesce(zone ->> 'min_bpm', zone ->> 'min_heart_rate_bpm')::numeric else null end,
    'max_bpm', case when coalesce(zone ->> 'max_bpm', zone ->> 'max_heart_rate_bpm', '') ~ '^-?\d+(\.\d+)?$' then coalesce(zone ->> 'max_bpm', zone ->> 'max_heart_rate_bpm')::numeric else null end
  ))), '[]'::jsonb)
  into v_hr_zones
  from raw_zones,
  lateral jsonb_array_elements(zones) as zone;

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'session_id', v_session.id,
      'date', v_session.local_date,
      'title', public.chatgpt_pilot_truncate_text(coalesce(v_session.title, 'Training session'), 160),
      'status', coalesce(v_session.session_status, 'completed'),
      'session_kind', coalesce(v_session.session_kind, 'completed'),
      'source_type', v_session.source_type,
      'garmin_type_key', v_activity_type ->> 'key',
      'garmin_type_label', v_activity_type ->> 'label',
      'has_fit', coalesce(v_session.source_type, '') in ('garmin_fit', 'garmin_connect', 'wearable_export'),
      'has_coach_blocks', jsonb_array_length(v_blocks) > 0,
      'duration_seconds', v_session.duration_seconds,
      'distance_meters', v_session.distance_meters,
      'started_at', v_session.started_at,
      'ended_at', v_session.ended_at,
      'blocks_count', jsonb_array_length(v_blocks),
      'exercises_count', (
        select coalesce(count(*), 0)
        from public.session_exercises se
        where se.session_id = p_session_id
      ),
      'metrics_count', jsonb_array_length(v_metrics),
      'quality', v_session.quality,
      'import_status', v_session.import_status
    ),
    'garmin_summary', jsonb_build_object(
      'duration_seconds', v_session.duration_seconds,
      'active_seconds', case when coalesce(v_garmin #>> '{duration_work_seconds}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{duration_work_seconds}')::numeric else null end,
      'rest_seconds', case when coalesce(v_garmin #>> '{duration_rest_seconds}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{duration_rest_seconds}')::numeric else null end,
      'distance_meters', v_session.distance_meters,
      'calories_kcal', case when coalesce(v_garmin #>> '{calories,total_kcal}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{calories,total_kcal}')::numeric else null end,
      'heart_rate_avg_bpm', case when coalesce(v_garmin #>> '{heart_rate,avg_bpm}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{heart_rate,avg_bpm}')::numeric else null end,
      'heart_rate_max_bpm', case when coalesce(v_garmin #>> '{heart_rate,max_bpm}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{heart_rate,max_bpm}')::numeric else null end,
      'training_effect_aerobic', case when coalesce(v_garmin #>> '{training_effect,aerobic}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{training_effect,aerobic}')::numeric else null end,
      'training_effect_anaerobic', case when coalesce(v_garmin #>> '{training_effect,anaerobic}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{training_effect,anaerobic}')::numeric else null end,
      'respiration_avg', case when coalesce(v_garmin #>> '{respiration,avg_brpm}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{respiration,avg_brpm}')::numeric else null end,
      'respiration_max', case when coalesce(v_garmin #>> '{respiration,max_brpm}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{respiration,max_brpm}')::numeric else null end,
      'respiration_min', case when coalesce(v_garmin #>> '{respiration,min_brpm}', '') ~ '^-?\d+(\.\d+)?$' then (v_garmin #>> '{respiration,min_brpm}')::numeric else null end
    ),
    'garmin_detail', jsonb_build_object(
      'samples', jsonb_build_object(
        'heart_rate', v_hr_samples,
        'respiration', v_respiration_samples,
        'power', '[]'::jsonb,
        'cadence', '[]'::jsonb,
        'speed', '[]'::jsonb
      ),
      'laps', v_laps,
      'zones', jsonb_build_object(
        'heart_rate', v_hr_zones,
        'power', v_power_zones
      ),
      'series_metadata', jsonb_build_object(
        'source', v_hr_source,
        'downsampled', v_hr_total > 600 or v_respiration_total > 600,
        'max_points', 600,
        'heart_rate_source_points', v_hr_total,
        'heart_rate_returned_points', jsonb_array_length(v_hr_samples),
        'respiration_source_points', v_respiration_total,
        'respiration_returned_points', jsonb_array_length(v_respiration_samples)
      )
    ),
    'metrics', v_metrics,
    'blocks', v_blocks,
    'source_warnings', '[]'::jsonb
  );
end;
$$;

revoke all on function public.chatgpt_pilot_get_session_detail(uuid) from public;
grant execute on function public.chatgpt_pilot_get_session_detail(uuid) to anon, authenticated;

-- Manual ChatGPT -> Supabase pilot bridge for ENQIDU.
-- This layer is intentionally separate from the normal authenticated AI context RPCs.

create table if not exists public.chatgpt_pilot_config (
  id boolean primary key default true,
  enabled boolean not null default false,
  pilot_user_id uuid not null,
  pilot_handle text not null default 'jotason',
  max_message_chars integer not null default 12000,
  max_blocks integer not null default 20,
  max_exercises integer not null default 80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatgpt_pilot_config_one_row check (id = true),
  constraint chatgpt_pilot_config_positive_limits check (
    max_message_chars between 1 and 20000
    and max_blocks between 0 and 50
    and max_exercises between 0 and 200
  )
);

alter table public.chatgpt_pilot_config enable row level security;

revoke all on public.chatgpt_pilot_config from anon, authenticated;

drop policy if exists "No direct public access to pilot config" on public.chatgpt_pilot_config;
create policy "No direct public access to pilot config"
on public.chatgpt_pilot_config
for select
to anon, authenticated
using (false);

insert into public.chatgpt_pilot_config (
  id,
  enabled,
  pilot_user_id,
  pilot_handle,
  max_message_chars,
  max_blocks,
  max_exercises
)
values (
  true,
  true,
  '80ce2507-48e3-4b48-9eba-b90a3fe4a241'::uuid,
  'jotason',
  12000,
  20,
  80
)
on conflict (id) do update
set enabled = excluded.enabled,
    pilot_user_id = excluded.pilot_user_id,
    pilot_handle = excluded.pilot_handle,
    max_message_chars = excluded.max_message_chars,
    max_blocks = excluded.max_blocks,
    max_exercises = excluded.max_exercises,
    updated_at = now();

create or replace function public.chatgpt_pilot_forbidden_keys()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'raw_payload',
    'original_payload',
    'payload_sql',
    'sql',
    'query',
    'table',
    'schema',
    'fit_message_payload',
    'session_samples',
    'wearable_provider_raw_payloads',
    'service_role',
    'openai_api_key',
    'password',
    'secret',
    'token'
  ]::text[];
$$;

create or replace function public.chatgpt_pilot_truncate_text(
  p_text text,
  p_max_chars integer default 800
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_text is null then null
    when length(p_text) <= greatest(coalesce(p_max_chars, 800), 0) then p_text
    else left(p_text, greatest(coalesce(p_max_chars, 800), 0)) || '...'
  end;
$$;

create or replace function public.chatgpt_pilot_has_forbidden_key(p_json jsonb)
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
      and lower(key_name) = any(public.chatgpt_pilot_forbidden_keys())
  );
$$;

create or replace function public.chatgpt_pilot_activity_type(
  p_session_structure jsonb default '{}'::jsonb,
  p_title text default null,
  p_source_name text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with src as (
    select
      coalesce(p_session_structure, '{}'::jsonb) as structure,
      coalesce(p_title, '') as title,
      coalesce(p_source_name, '') as source_name
  ),
  normalized as (
    select public.normalize_garmin_activity_type(
      coalesce(
        structure #>> '{garmin_fit_summary,sport}',
        structure #>> '{garmin,sport}',
        structure #>> '{fit,sport}',
        structure #>> '{sport}'
      ),
      coalesce(
        structure #>> '{garmin_fit_summary,subsport}',
        structure #>> '{garmin,subsport}',
        structure #>> '{fit,subsport}',
        structure #>> '{subsport}'
      ),
      coalesce(
        structure #>> '{garmin_fit_summary,activity_type}',
        structure #>> '{garmin,activity_type}',
        structure #>> '{fit,activity_type}',
        structure #>> '{activity_type}'
      ),
      title,
      source_name,
      coalesce(
        structure #>> '{garmin_fit_summary,raw_label}',
        structure #>> '{garmin_fit_summary,activity_type}',
        structure #>> '{garmin_fit_summary,sport}',
        structure #>> '{garmin,raw_label}',
        structure #>> '{fit,raw_label}',
        structure #>> '{raw_garmin_label}',
        source_name,
        title
      )
    ) as value,
    lower(
      title || ' ' ||
      source_name || ' ' ||
      coalesce(structure #>> '{garmin_fit_summary,sport}', '') || ' ' ||
      coalesce(structure #>> '{garmin_fit_summary,activity_type}', '') || ' ' ||
      coalesce(structure #>> '{activity_type}', '')
    ) as haystack
    from src
  )
  select case
    when haystack like '%yoga%' then jsonb_build_object('key', 'yoga', 'label', 'Yoga')
    when haystack like '%hiit%' or haystack ~ '(^|[^0-9])62([^0-9]|$)' then jsonb_build_object('key', 'hiit', 'label', 'HIIT')
    when haystack like '%pilates%' then jsonb_build_object('key', 'pilates', 'label', 'Pilates')
    else value
  end
  from normalized;
$$;

create or replace function public.chatgpt_pilot_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config record;
  v_rls_sets text := 'missing';
  v_rls_map text := 'missing';
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  select case when c.relrowsecurity then 'enabled' else 'disabled' end
  into v_rls_sets
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'session_garmin_sets';

  select case when c.relrowsecurity then 'enabled' else 'disabled' end
  into v_rls_map
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'session_block_garmin_series_map';

  return jsonb_build_object(
    'enabled', coalesce(v_config.enabled, false),
    'pilot_handle', v_config.pilot_handle,
    'pilot_user_configured', v_config.pilot_user_id is not null,
    'safe_to_use_from_chatgpt_connector', coalesce(v_config.enabled, false) and v_config.pilot_user_id is not null,
    'rls', jsonb_build_object(
      'session_garmin_sets', coalesce(v_rls_sets, 'missing'),
      'session_block_garmin_series_map', coalesce(v_rls_map, 'missing')
    ),
    'limits', jsonb_build_object(
      'max_message_chars', coalesce(v_config.max_message_chars, 0),
      'max_blocks', coalesce(v_config.max_blocks, 0),
      'max_exercises', coalesce(v_config.max_exercises, 0)
    )
  );
end;
$$;

create or replace function public.chatgpt_pilot_find_session(
  p_local_date date,
  p_activity_hint text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config record;
  v_sessions jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_action text := 'create_manual_session';
  v_reason text := 'no session found for date';
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if not found or not v_config.enabled then
    return jsonb_build_object(
      'date', p_local_date,
      'sessions_count', 0,
      'sessions', '[]'::jsonb,
      'recommendation', jsonb_build_object('action', 'disabled', 'reason', 'pilot is disabled')
    );
  end if;

  with session_rows as (
    select
      ts.id,
      ts.local_date,
      public.chatgpt_pilot_truncate_text(coalesce(ts.title, src.source_name, 'Training session'), 160) as title,
      public.chatgpt_pilot_activity_type(ts.session_structure, ts.title, src.source_name) as activity_type,
      coalesce(src.source_type, 'manual_entry') as source_type,
      (coalesce(src.source_type, '') in ('garmin_fit', 'garmin_connect', 'wearable_export')) as has_fit,
      coalesce(src.import_status, 'unknown') as import_status,
      ts.duration_seconds,
      coalesce(ts.session_status, 'recorded') as status,
      coalesce(ts.data_quality_status, 'unverified') as quality,
      (select count(*) from public.session_blocks sb where sb.session_id = ts.id) as blocks_count,
      (select count(*) from public.session_exercises se where se.session_id = ts.id) as exercises_count,
      (select count(*) from public.session_metrics sm where sm.session_id = ts.id) as metrics_count
    from public.training_sessions ts
    left join public.training_sources src on src.id = ts.source_id
    where ts.user_id = v_config.pilot_user_id
      and ts.local_date = p_local_date
      and (
        p_activity_hint is null
        or trim(p_activity_hint) = ''
        or lower(coalesce(ts.title, '') || ' ' || coalesce(src.source_name, '')) like '%' || lower(trim(p_activity_hint)) || '%'
      )
    order by ts.started_at nulls last, ts.created_at nulls last, ts.id
    limit 10
  )
  select
    coalesce(count(*), 0),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'session_id', id,
        'date', local_date,
        'title', title,
        'garmin_type_key', activity_type ->> 'key',
        'garmin_type_label', activity_type ->> 'label',
        'source_type', source_type,
        'has_fit', has_fit,
        'has_coach_blocks', blocks_count > 0,
        'blocks_count', blocks_count,
        'exercises_count', exercises_count,
        'metrics_count', metrics_count,
        'duration_seconds', duration_seconds,
        'status', status,
        'quality', quality,
        'import_status', import_status
      )
    ), '[]'::jsonb)
  into v_count, v_sessions
  from session_rows;

  if v_count = 1 then
    v_action := 'enrich_existing_session';
    v_reason := 'single session found for date';

    if (v_sessions #>> '{0,has_fit}')::boolean then
      v_reason := 'single Garmin/FIT session found for date';
    end if;
  elsif v_count > 1 then
    v_action := 'choose_session';
    v_reason := 'multiple sessions found for date';
  end if;

  return jsonb_build_object(
    'date', p_local_date,
    'sessions_count', v_count,
    'sessions', v_sessions,
    'recommendation', jsonb_build_object(
      'action', v_action,
      'reason', v_reason
    )
  );
end;
$$;

create or replace function public.chatgpt_pilot_get_safe_context(
  p_local_date date,
  p_session_id uuid default null,
  p_mode text default 'capture'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config record;
  v_target_session jsonb := null;
  v_find jsonb;
  v_goals jsonb := '[]'::jsonb;
  v_constraints jsonb := '[]'::jsonb;
  v_equipment jsonb := '[]'::jsonb;
  v_recent_memory text := null;
  v_recent_training jsonb := '{}'::jsonb;
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if not found or not v_config.enabled then
    return jsonb_build_object(
      'ok', false,
      'error', 'pilot is disabled'
    );
  end if;

  if p_session_id is not null then
    select jsonb_build_object(
      'session_id', ts.id,
      'title', public.chatgpt_pilot_truncate_text(coalesce(ts.title, src.source_name, 'Training session'), 160),
      'garmin_type_label', public.chatgpt_pilot_activity_type(ts.session_structure, ts.title, src.source_name) ->> 'label',
      'has_fit', coalesce(src.source_type, '') in ('garmin_fit', 'garmin_connect', 'wearable_export'),
      'blocks_count', (select count(*) from public.session_blocks sb where sb.session_id = ts.id),
      'exercises_count', (select count(*) from public.session_exercises se where se.session_id = ts.id),
      'duration_seconds', ts.duration_seconds,
      'status', ts.session_status,
      'quality', ts.data_quality_status
    )
    into v_target_session
    from public.training_sessions ts
    left join public.training_sources src on src.id = ts.source_id
    where ts.id = p_session_id
      and ts.user_id = v_config.pilot_user_id;
  else
    v_find := public.chatgpt_pilot_find_session(p_local_date, null);
    if (v_find ->> 'sessions_count')::integer = 1 then
      v_target_session := v_find #> '{sessions,0}';
    end if;
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_goals
  from (
    select jsonb_build_object(
      'name', public.chatgpt_pilot_truncate_text(name, 180),
      'goal_type', goal_type,
      'priority', priority,
      'status', status
    ) as item
    from public.user_goals
    where user_id = v_config.pilot_user_id
      and coalesce(status, 'active') not in ('archived', 'deleted')
    order by priority nulls last, created_at desc
    limit 8
  ) g;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_constraints
  from (
    select jsonb_build_object(
      'location', public.chatgpt_pilot_truncate_text(display_name, 120),
      'type', location_type,
      'access_mode', access_mode,
      'coached_sessions_available', coached_sessions_available
    ) as item
    from public.user_training_locations
    where user_id = v_config.pilot_user_id
      and coalesce(is_active, true)
    order by display_name
    limit 8
  ) c;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_equipment
  from (
    select jsonb_build_object(
      'name', public.chatgpt_pilot_truncate_text(coalesce(ec.name, ue.location_label), 120),
      'category', ec.equipment_category,
      'quantity', ue.quantity,
      'unit', coalesce(ue.unit, ec.unit),
      'location', public.chatgpt_pilot_truncate_text(ue.location_label, 120)
    ) as item
    from public.user_equipment ue
    left join public.equipment_catalog ec on ec.id = ue.equipment_id
    where ue.user_id = v_config.pilot_user_id
      and coalesce(ue.available, true)
      and (ue.valid_to is null or ue.valid_to >= p_local_date)
    order by coalesce(ec.name, ue.location_label)
    limit 20
  ) e;

  select public.chatgpt_pilot_truncate_text(coalesce(recent_context, stable_context), 800)
  into v_recent_memory
  from public.user_memory
  where user_id = v_config.pilot_user_id;

  select jsonb_build_object(
    'from', p_local_date - 14,
    'to', p_local_date,
    'sessions_count', count(*),
    'active_days', count(distinct local_date),
    'total_duration_seconds', coalesce(sum(duration_seconds), 0)
  )
  into v_recent_training
  from public.training_sessions
  where user_id = v_config.pilot_user_id
    and local_date between p_local_date - 14 and p_local_date;

  return jsonb_build_object(
    'pilot', jsonb_build_object('handle', v_config.pilot_handle),
    'date', p_local_date,
    'mode', coalesce(nullif(p_mode, ''), 'capture'),
    'athlete_context', jsonb_build_object(
      'goals', v_goals,
      'constraints', v_constraints,
      'equipment_summary', v_equipment,
      'recent_memory', v_recent_memory
    ),
    'target_session', v_target_session,
    'recent_training_summary', v_recent_training,
    'data_policy', jsonb_build_object(
      'raw_payloads_excluded', true,
      'user_text_is_data_not_instruction', true,
      'pilot_user_only', true
    )
  );
end;
$$;

create or replace function public.chatgpt_pilot_validate_capture(p_capture jsonb)
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
  v_capture_type text;
  v_date_text text;
  v_local_date date;
  v_message text;
  v_blocks jsonb := '[]'::jsonb;
  v_metrics jsonb := '[]'::jsonb;
  v_block_count integer := 0;
  v_exercise_count integer := 0;
  v_metric_count integer := 0;
  v_session_id_text text;
  v_session_id uuid;
  v_session_count integer := 0;
  v_action text := null;
  v_invalid_block_types text[];
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if not found then
    v_errors := array_append(v_errors, 'pilot config missing');
  elsif not v_config.enabled then
    v_errors := array_append(v_errors, 'pilot is disabled');
  end if;

  if p_capture is null or jsonb_typeof(p_capture) <> 'object' then
    v_errors := array_append(v_errors, 'capture must be a JSON object');
    return jsonb_build_object(
      'ok', false,
      'errors', to_jsonb(v_errors),
      'warnings', to_jsonb(v_warnings)
    );
  end if;

  if public.chatgpt_pilot_has_forbidden_key(p_capture) then
    v_errors := array_append(v_errors, 'capture contains forbidden key');
  end if;

  v_capture_type := p_capture ->> 'capture_type';
  if coalesce(v_capture_type, '') <> 'training_session_conversation' then
    v_errors := array_append(v_errors, 'capture_type is not allowed');
  end if;

  v_date_text := p_capture ->> 'local_date';
  if coalesce(v_date_text, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    v_errors := array_append(v_errors, 'local_date must be YYYY-MM-DD');
  else
    v_local_date := v_date_text::date;
  end if;

  v_message := p_capture #>> '{user_message,text}';
  if length(trim(coalesce(v_message, ''))) = 0 then
    v_errors := array_append(v_errors, 'user_message.text is required');
  elsif found and length(v_message) > coalesce(v_config.max_message_chars, 12000) then
    v_errors := array_append(v_errors, 'user_message.text exceeds max_message_chars');
  end if;

  if p_capture ? 'blocks' then
    if jsonb_typeof(p_capture -> 'blocks') <> 'array' then
      v_errors := array_append(v_errors, 'capture.blocks must be an array');
    else
      v_blocks := p_capture -> 'blocks';
      v_block_count := jsonb_array_length(v_blocks);
    end if;
  end if;

  if p_capture ? 'metrics' then
    if jsonb_typeof(p_capture -> 'metrics') <> 'array' then
      v_errors := array_append(v_errors, 'capture.metrics must be an array');
    else
      v_metrics := p_capture -> 'metrics';
      v_metric_count := jsonb_array_length(v_metrics);
    end if;
  end if;

  if found and v_block_count > coalesce(v_config.max_blocks, 20) then
    v_errors := array_append(v_errors, 'capture.blocks exceeds max_blocks');
  end if;

  select coalesce(count(*), 0)
  into v_exercise_count
  from jsonb_array_elements(v_blocks) b
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(b.value -> 'exercises') = 'array' then b.value -> 'exercises' else '[]'::jsonb end
  ) e;

  if found and v_exercise_count > coalesce(v_config.max_exercises, 80) then
    v_errors := array_append(v_errors, 'capture exercises exceed max_exercises');
  end if;

  select array_agg(distinct block_type)
  into v_invalid_block_types
  from (
    select lower(coalesce(b.value ->> 'type', 'other')) as block_type
    from jsonb_array_elements(v_blocks) b
  ) t
  where block_type not in (
    'warmup',
    'mobility',
    'strength',
    'skill',
    'conditioning',
    'metcon',
    'cardio',
    'cooldown',
    'recovery',
    'mixed',
    'other'
  );

  if v_invalid_block_types is not null then
    v_errors := array_append(v_errors, 'capture.blocks contains invalid block type');
  end if;

  v_session_id_text := nullif(p_capture #>> '{target,session_id}', '');
  if v_session_id_text is not null then
    if v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_errors := array_append(v_errors, 'target.session_id must be uuid');
    else
      v_session_id := v_session_id_text::uuid;

      if found and not exists (
        select 1
        from public.training_sessions ts
        where ts.id = v_session_id
          and ts.user_id = v_config.pilot_user_id
      ) then
        v_errors := array_append(v_errors, 'target.session_id does not belong to pilot user');
      else
        v_action := 'enrich_existing_session';
      end if;
    end if;
  elsif v_local_date is not null and found then
    select count(*), (array_agg(ts.id order by ts.started_at nulls last, ts.created_at nulls last, ts.id))[1]
    into v_session_count, v_session_id
    from public.training_sessions ts
    where ts.user_id = v_config.pilot_user_id
      and ts.local_date = v_local_date;

    if v_session_count = 0 then
      v_action := 'create_manual_session';
      v_session_id := null;
    elsif v_session_count = 1 then
      v_action := 'enrich_existing_session';
    else
      v_action := 'choose_session';
      v_errors := array_append(v_errors, 'multiple sessions found for date; provide target.session_id');
    end if;
  end if;

  return jsonb_build_object(
    'ok', coalesce(array_length(v_errors, 1), 0) = 0,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'local_date', v_local_date,
    'action', v_action,
    'target_session_id', v_session_id,
    'counts', jsonb_build_object(
      'blocks', v_block_count,
      'exercises', v_exercise_count,
      'metrics', v_metric_count
    )
  );
end;
$$;

create or replace function public.chatgpt_pilot_preview_capture(p_capture jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation jsonb;
  v_has_cost boolean := false;
begin
  v_validation := public.chatgpt_pilot_validate_capture(p_capture);
  v_has_cost := p_capture ? 'ai_cost_estimate';

  if not coalesce((v_validation ->> 'ok')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'dry_run', true,
      'errors', coalesce(v_validation -> 'errors', '[]'::jsonb),
      'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb),
      'action', v_validation ->> 'action',
      'target_session_id', v_validation ->> 'target_session_id'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'dry_run', true,
    'action', v_validation ->> 'action',
    'target_session_id', v_validation ->> 'target_session_id',
    'would_insert', jsonb_build_object(
      'enrichments', 1,
      'blocks', (v_validation #>> '{counts,blocks}')::integer,
      'exercises', (v_validation #>> '{counts,exercises}')::integer,
      'metrics', (v_validation #>> '{counts,metrics}')::integer,
      'cost_estimates', case when v_has_cost then 1 else 0 end
    ),
    'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
  );
end;
$$;

create or replace function public.chatgpt_pilot_record_cost_estimate(
  p_session_id uuid,
  p_enrichment_id uuid,
  p_estimate jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_config record;
  v_estimate_id uuid;
  v_model text;
  v_input_tokens integer;
  v_output_tokens integer;
  v_total_cost_eur numeric;
begin
  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  if not found or not v_config.enabled then
    return jsonb_build_object('ok', false, 'inserted', 0, 'error', 'pilot is disabled');
  end if;

  if p_estimate is null or jsonb_typeof(p_estimate) <> 'object' then
    return jsonb_build_object('ok', true, 'inserted', 0);
  end if;

  if public.chatgpt_pilot_has_forbidden_key(p_estimate) then
    return jsonb_build_object('ok', false, 'inserted', 0, 'error', 'cost estimate contains forbidden key');
  end if;

  if p_session_id is null or not exists (
    select 1
    from public.training_sessions ts
    where ts.id = p_session_id
      and ts.user_id = v_config.pilot_user_id
  ) then
    return jsonb_build_object('ok', false, 'inserted', 0, 'error', 'session does not belong to pilot user');
  end if;

  v_model := coalesce(nullif(public.chatgpt_pilot_truncate_text(p_estimate ->> 'model_simulated', 80), ''), 'chatgpt_manual_pilot');

  v_input_tokens := case
    when coalesce(p_estimate ->> 'input_tokens_estimated', '') ~ '^\d+$'
    then (p_estimate ->> 'input_tokens_estimated')::integer
    else null
  end;

  v_output_tokens := case
    when coalesce(p_estimate ->> 'output_tokens_estimated', '') ~ '^\d+$'
    then (p_estimate ->> 'output_tokens_estimated')::integer
    else null
  end;

  v_total_cost_eur := case
    when coalesce(p_estimate ->> 'total_cost_eur_estimated', '') ~ '^\d+(\.\d+)?$'
    then (p_estimate ->> 'total_cost_eur_estimated')::numeric
    else null
  end;

  insert into public.enkidu_ai_usage_estimates (
    model,
    phase,
    session_id,
    enrichment_id,
    token_source,
    input_tokens_estimated,
    output_tokens_estimated,
    total_cost_eur,
    pricing_payload,
    raw_usage_payload,
    exact_billing_available
  )
  values (
    v_model,
    'chatgpt_manual_pilot',
    p_session_id,
    p_enrichment_id,
    'estimated_from_chatgpt_manual_pilot',
    v_input_tokens,
    v_output_tokens,
    v_total_cost_eur,
    jsonb_build_object('source', 'chatgpt_manual_pilot', 'simulated', true),
    jsonb_build_object('source', 'chatgpt_manual_pilot', 'simulated', true),
    false
  )
  returning id into v_estimate_id;

  return jsonb_build_object(
    'ok', true,
    'inserted', 1,
    'estimate_id', v_estimate_id
  );
end;
$$;

create or replace function public.chatgpt_pilot_apply_capture(p_capture jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation jsonb;
  v_config record;
  v_action text;
  v_local_date date;
  v_session_id uuid;
  v_source_id uuid;
  v_enrichment_id uuid;
  v_cost_result jsonb := jsonb_build_object('inserted', 0);
  v_title text;
  v_payload jsonb;
  v_block jsonb;
  v_exercise jsonb;
  v_metric jsonb;
  v_block_id uuid;
  v_base_block_order integer := 0;
  v_capture_block_order integer;
  v_inserted_blocks integer := 0;
  v_inserted_exercises integer := 0;
  v_inserted_metrics integer := 0;
  v_summary jsonb;
begin
  v_validation := public.chatgpt_pilot_validate_capture(p_capture);

  if not coalesce((v_validation ->> 'ok')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'dry_run', false,
      'errors', coalesce(v_validation -> 'errors', '[]'::jsonb),
      'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb),
      'action', v_validation ->> 'action',
      'target_session_id', v_validation ->> 'target_session_id'
    );
  end if;

  select *
  into v_config
  from public.chatgpt_pilot_config
  where id = true;

  v_action := v_validation ->> 'action';
  v_local_date := (v_validation ->> 'local_date')::date;
  v_session_id := nullif(v_validation ->> 'target_session_id', '')::uuid;

  v_title := coalesce(
    nullif(public.chatgpt_pilot_truncate_text(p_capture #>> '{coach_interpretation,session_intent}', 160), ''),
    nullif(public.chatgpt_pilot_truncate_text(p_capture #>> '{coach_interpretation,summary}', 160), ''),
    'Sesion manual ChatGPT ' || v_local_date::text
  );

  if v_action = 'create_manual_session' then
    insert into public.training_sources (
      user_id,
      source_type,
      source_name,
      source_system,
      source_version,
      import_status,
      provenance
    )
    values (
      v_config.pilot_user_id,
      'manual_entry',
      'ChatGPT manual pilot',
      'chatgpt_manual_pilot',
      'v1',
      'imported',
      jsonb_build_object('source', 'chatgpt_manual_pilot', 'raw_payloads_excluded', true)
    )
    returning id into v_source_id;

    insert into public.training_sessions (
      user_id,
      source_id,
      title,
      session_kind,
      data_quality_status,
      session_status,
      local_date,
      session_structure,
      tags,
      programming_mode,
      load_decision_owner
    )
    values (
      v_config.pilot_user_id,
      v_source_id,
      v_title,
      'completed',
      'unverified',
      'recorded',
      v_local_date,
      jsonb_build_object(
        'source', 'chatgpt_manual_pilot',
        'summary', public.chatgpt_pilot_truncate_text(p_capture #>> '{coach_interpretation,summary}', 500)
      ),
      array['chatgpt_manual_pilot', 'conversation_enrichment'],
      'unknown',
      'unknown'
    )
    returning id into v_session_id;
  end if;

  v_payload := jsonb_build_object(
    'capture_type', p_capture ->> 'capture_type',
    'local_date', v_local_date,
    'target', jsonb_build_object('mode', v_action, 'session_id', v_session_id),
    'user_message', jsonb_build_object(
      'source', public.chatgpt_pilot_truncate_text(p_capture #>> '{user_message,source}', 120),
      'text', public.chatgpt_pilot_truncate_text(p_capture #>> '{user_message,text}', v_config.max_message_chars),
      'language', public.chatgpt_pilot_truncate_text(p_capture #>> '{user_message,language}', 20)
    ),
    'coach_interpretation', jsonb_build_object(
      'summary', public.chatgpt_pilot_truncate_text(p_capture #>> '{coach_interpretation,summary}', 500),
      'session_intent', public.chatgpt_pilot_truncate_text(p_capture #>> '{coach_interpretation,session_intent}', 240),
      'perceived_load', p_capture #> '{coach_interpretation,perceived_load}',
      'pain_or_risk_flags', coalesce(p_capture #> '{coach_interpretation,pain_or_risk_flags}', '[]'::jsonb),
      'confidence', public.chatgpt_pilot_truncate_text(p_capture #>> '{coach_interpretation,confidence}', 40)
    ),
    'blocks', coalesce(p_capture -> 'blocks', '[]'::jsonb),
    'metrics', coalesce(p_capture -> 'metrics', '[]'::jsonb),
    'raw_payloads_excluded', true
  );

  insert into public.enkidu_conversation_enrichments (
    session_id,
    local_date,
    enrichment_type,
    source,
    payload,
    ai_usage,
    status
  )
  values (
    v_session_id,
    v_local_date,
    'conversation_training_log',
    'chatgpt_manual_pilot',
    v_payload,
    jsonb_build_object('simulated_cost', p_capture -> 'ai_cost_estimate'),
    'active'
  )
  on conflict (session_id, enrichment_type, source) do update
  set local_date = excluded.local_date,
      payload = excluded.payload,
      ai_usage = excluded.ai_usage,
      status = 'active',
      updated_at = now()
  returning id into v_enrichment_id;

  select coalesce(max(block_order), 0)
  into v_base_block_order
  from public.session_blocks
  where session_id = v_session_id;

  for v_block in
    select value
    from jsonb_array_elements(coalesce(p_capture -> 'blocks', '[]'::jsonb))
    order by coalesce((value ->> 'order')::integer, 999)
  loop
    v_capture_block_order := coalesce(
      case when coalesce(v_block ->> 'order', '') ~ '^\d+$' then (v_block ->> 'order')::integer else null end,
      v_inserted_blocks + 1
    );

    insert into public.session_blocks (
      session_id,
      block_order,
      block_type,
      name,
      duration_seconds,
      rounds_completed,
      prescription,
      execution_notes,
      data_confidence
    )
    values (
      v_session_id,
      v_base_block_order + v_capture_block_order,
      lower(coalesce(nullif(v_block ->> 'type', ''), 'other')),
      public.chatgpt_pilot_truncate_text(coalesce(v_block ->> 'name', 'Bloque'), 160),
      case when coalesce(v_block ->> 'duration_seconds', '') ~ '^\d+$' then (v_block ->> 'duration_seconds')::integer else null end,
      case when coalesce(v_block ->> 'rounds_completed', '') ~ '^\d+(\.\d+)?$' then (v_block ->> 'rounds_completed')::numeric else null end,
      jsonb_build_object(
        'source', 'chatgpt_manual_pilot',
        'summary', public.chatgpt_pilot_truncate_text(v_block ->> 'summary', 500),
        'enrichment_id', v_enrichment_id
      ),
      public.chatgpt_pilot_truncate_text(v_block ->> 'summary', 500),
      coalesce(nullif(public.chatgpt_pilot_truncate_text(v_block ->> 'confidence', 40), ''), 'reported')
    )
    returning id into v_block_id;

    v_inserted_blocks := v_inserted_blocks + 1;

    for v_exercise in
      select value
      from jsonb_array_elements(
        case when jsonb_typeof(v_block -> 'exercises') = 'array' then v_block -> 'exercises' else '[]'::jsonb end
      )
      order by coalesce((value ->> 'order')::integer, 999)
    loop
      insert into public.session_exercises (
        session_id,
        block_id,
        exercise_order,
        reported_name,
        execution_type,
        sets_completed,
        rounds_completed,
        reps_per_set,
        duration_seconds,
        load_value,
        load_unit,
        equipment_snapshot,
        side,
        notes,
        data_confidence
      )
      values (
        v_session_id,
        v_block_id,
        case when coalesce(v_exercise ->> 'order', '') ~ '^\d+$' then (v_exercise ->> 'order')::integer else null end,
        public.chatgpt_pilot_truncate_text(coalesce(nullif(v_exercise ->> 'name', ''), 'Ejercicio reportado'), 200),
        'performed',
        case when coalesce(v_exercise ->> 'sets_completed', '') ~ '^\d+(\.\d+)?$' then (v_exercise ->> 'sets_completed')::numeric else null end,
        case when coalesce(v_exercise ->> 'rounds_completed', '') ~ '^\d+(\.\d+)?$' then (v_exercise ->> 'rounds_completed')::numeric else null end,
        v_exercise -> 'reps_per_set',
        case when coalesce(v_exercise ->> 'duration_seconds', '') ~ '^\d+$' then (v_exercise ->> 'duration_seconds')::integer else null end,
        case when coalesce(v_exercise ->> 'load_value', '') ~ '^\d+(\.\d+)?$' then (v_exercise ->> 'load_value')::numeric else null end,
        public.chatgpt_pilot_truncate_text(v_exercise ->> 'load_unit', 40),
        jsonb_build_object(
          'source', 'chatgpt_manual_pilot',
          'equipment', coalesce(v_exercise -> 'equipment', '[]'::jsonb)
        ),
        case
          when v_exercise ->> 'side' in ('left', 'right', 'bilateral', 'alternating', 'each_side', 'na') then v_exercise ->> 'side'
          else null
        end,
        public.chatgpt_pilot_truncate_text(v_exercise ->> 'notes', 500),
        coalesce(nullif(public.chatgpt_pilot_truncate_text(v_exercise ->> 'confidence', 40), ''), 'reported')
      );

      v_inserted_exercises := v_inserted_exercises + 1;
    end loop;
  end loop;

  for v_metric in
    select value
    from jsonb_array_elements(coalesce(p_capture -> 'metrics', '[]'::jsonb))
  loop
    if coalesce(v_metric ->> 'metric_code', v_metric ->> 'code') is not null then
      insert into public.session_metrics (
        session_id,
        metric_code,
        metric_name,
        value_numeric,
        value_text,
        unit,
        metric_scope,
        scope_reference,
        source_path,
        confidence
      )
      values (
        v_session_id,
        public.chatgpt_pilot_truncate_text(coalesce(v_metric ->> 'metric_code', v_metric ->> 'code'), 100),
        public.chatgpt_pilot_truncate_text(coalesce(v_metric ->> 'metric_name', v_metric ->> 'name'), 160),
        case when coalesce(v_metric ->> 'value_numeric', '') ~ '^-?\d+(\.\d+)?$' then (v_metric ->> 'value_numeric')::numeric else null end,
        public.chatgpt_pilot_truncate_text(v_metric ->> 'value_text', 240),
        public.chatgpt_pilot_truncate_text(v_metric ->> 'unit', 40),
        coalesce(nullif(public.chatgpt_pilot_truncate_text(v_metric ->> 'metric_scope', 40), ''), 'session'),
        coalesce(public.chatgpt_pilot_truncate_text(v_metric ->> 'scope_reference', 120), ''),
        'chatgpt_manual_pilot',
        coalesce(nullif(public.chatgpt_pilot_truncate_text(v_metric ->> 'confidence', 40), ''), 'reported')
      )
      on conflict (session_id, metric_code, metric_scope, scope_reference, source_path) do update
      set metric_name = excluded.metric_name,
          value_numeric = excluded.value_numeric,
          value_text = excluded.value_text,
          unit = excluded.unit,
          confidence = excluded.confidence;

      v_inserted_metrics := v_inserted_metrics + 1;
    end if;
  end loop;

  if p_capture ? 'ai_cost_estimate' then
    v_cost_result := public.chatgpt_pilot_record_cost_estimate(
      v_session_id,
      v_enrichment_id,
      p_capture -> 'ai_cost_estimate'
    );
  end if;

  select jsonb_build_object(
    'date', ts.local_date,
    'title', public.chatgpt_pilot_truncate_text(coalesce(ts.title, src.source_name, v_title), 160),
    'has_fit', coalesce(src.source_type, '') in ('garmin_fit', 'garmin_connect', 'wearable_export'),
    'has_coach_blocks', exists (
      select 1
      from public.session_blocks sb
      where sb.session_id = ts.id
    )
  )
  into v_summary
  from public.training_sessions ts
  left join public.training_sources src on src.id = ts.source_id
  where ts.id = v_session_id;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'session_id', v_session_id,
    'inserted', jsonb_build_object(
      'enrichment_id', v_enrichment_id,
      'blocks', v_inserted_blocks,
      'exercises', v_inserted_exercises,
      'metrics', v_inserted_metrics,
      'cost_estimate', coalesce((v_cost_result ->> 'inserted')::integer, 0)
    ),
    'summary', v_summary,
    'warnings', coalesce(v_validation -> 'warnings', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.chatgpt_pilot_status() to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_find_session(date, text) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_get_safe_context(date, uuid, text) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_preview_capture(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_apply_capture(jsonb) to anon, authenticated, service_role;
grant execute on function public.chatgpt_pilot_record_cost_estimate(uuid, uuid, jsonb) to anon, authenticated, service_role;

revoke execute on function public.chatgpt_pilot_forbidden_keys() from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_truncate_text(text, integer) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_has_forbidden_key(jsonb) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_activity_type(jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.chatgpt_pilot_validate_capture(jsonb) from public, anon, authenticated;

grant execute on function public.chatgpt_pilot_forbidden_keys() to service_role;
grant execute on function public.chatgpt_pilot_truncate_text(text, integer) to service_role;
grant execute on function public.chatgpt_pilot_has_forbidden_key(jsonb) to service_role;
grant execute on function public.chatgpt_pilot_activity_type(jsonb, text, text) to service_role;
grant execute on function public.chatgpt_pilot_validate_capture(jsonb) to service_role;

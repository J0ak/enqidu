-- ENQIDU Tools V1: atomic acceptance of an explicitly confirmed plan command.
-- Local/CI migration only until the documented rollout is approved. No tables,
-- data rewrites, writer replacements, authenticated grants or FIT/history access.
-- The service supplies ownership after authentication. Expected facts and command
-- are server-built closed DTOs; the preview digest is never an authorization token.
create or replace function public.apply_enqidu_action_v1(
  p_user_id uuid,
  p_action text,
  p_expected jsonb,
  p_command jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_expected jsonb := p_expected;
  v_calendar date;
  v_from date;
  v_to date;
  v_source_date date;
  v_target_date date;
  v_date date;
  v_session_id uuid;
  v_block_ids uuid[];
  v_plan_ids uuid[];
  v_timezone text;
  v_actual jsonb;
  v_row jsonb;
  v_value jsonb;
  v_array jsonb;
  v_normalized jsonb;
  v_path text[];
  v_kind text;
  v_schema jsonb;
  v_nonnull text[];
  v_keys text[];
  v_key text;
  v_type text;
  v_move jsonb;
  v_source jsonb;
  v_result jsonb;
  v_count integer;
  v_total integer;
  v_integer integer;
  v_is_closed_loop boolean;
begin
  if current_user <> 'service_role' or p_user_id is null
     or p_action is null or p_action not in (
       'move_session', 'adapt_duration', 'adapt_environment', 'cancel_session', 'adapt_remaining_week'
     ) or jsonb_typeof(p_expected) is distinct from 'object'
     or jsonb_typeof(p_command) is distinct from 'object'
     or octet_length(p_expected::text) > 1048576
     or octet_length(p_command::text) > 32768 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  v_keys := array['version','calendar','scope','plans','blocks','availability','prescription'];
  if not (p_expected ?& v_keys) or p_expected - v_keys <> '{}'::jsonb
     or p_expected->'version' is distinct from '1'::jsonb
     or jsonb_typeof(p_expected->'calendar') is distinct from 'object'
     or jsonb_typeof(p_expected->'scope') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  v_keys := array['date','timezone'];
  if not (p_expected->'calendar' ?& v_keys) or (p_expected->'calendar') - v_keys <> '{}'::jsonb
     or jsonb_typeof(p_expected#>'{calendar,date}') is distinct from 'string'
     or jsonb_typeof(p_expected#>'{calendar,timezone}') is distinct from 'string'
     or p_expected#>>'{calendar,date}' !~ '^\d{4}-\d{2}-\d{2}$'
     or length(p_expected#>>'{calendar,timezone}') not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  v_calendar := (p_expected#>>'{calendar,date}')::date;
  v_keys := array['from_date','to_date','block_session_ids','selection'];
  if not (p_expected->'scope' ?& v_keys) or (p_expected->'scope') - v_keys <> '{}'::jsonb
     or jsonb_typeof(p_expected#>'{scope,from_date}') is distinct from 'string'
     or jsonb_typeof(p_expected#>'{scope,to_date}') is distinct from 'string'
     or p_expected#>>'{scope,from_date}' !~ '^\d{4}-\d{2}-\d{2}$'
     or p_expected#>>'{scope,to_date}' !~ '^\d{4}-\d{2}-\d{2}$'
     or jsonb_typeof(p_expected#>'{scope,block_session_ids}') is distinct from 'array'
     or jsonb_typeof(p_expected#>'{scope,selection}') is distinct from 'string'
     or p_expected#>>'{scope,selection}' not in ('action','closed_loop_target') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  v_from := (p_expected#>>'{scope,from_date}')::date;
  v_to := (p_expected#>>'{scope,to_date}')::date;
  v_is_closed_loop := p_expected#>>'{scope,selection}' = 'closed_loop_target';
  if v_from < v_calendar or v_to < v_from or v_to > v_from + 366
     or jsonb_array_length(p_expected#>'{scope,block_session_ids}') > 100
     or (v_is_closed_loop and p_action <> 'adapt_duration') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  for v_value in select value from jsonb_array_elements(p_expected#>'{scope,block_session_ids}') loop
    if jsonb_typeof(v_value) <> 'string'
       or v_value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
  end loop;
  select coalesce(array_agg((value#>>'{}')::uuid order by value#>>'{}'), '{}'::uuid[])
    into v_block_ids from jsonb_array_elements(p_expected#>'{scope,block_session_ids}');
  if cardinality(v_block_ids) <> (select count(distinct id) from unnest(v_block_ids) id) then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  if p_action = 'adapt_environment' then
    v_keys := array['constraints','locations','equipment','catalog'];
    if jsonb_typeof(p_expected->'prescription') is distinct from 'object'
       or not (p_expected->'prescription' ?& v_keys)
       or (p_expected->'prescription') - v_keys <> '{}'::jsonb then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
  elsif p_expected->'prescription' is distinct from 'null'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  -- Validate each closed canonical projection before type conversion. No JSON
  -- string is coerced to a boolean/number; timestamp normalization only reconciles
  -- equivalent PostgREST/libpq representations, not different state.
  foreach v_kind in array array['plans','blocks','availability','constraints','locations','equipment','catalog'] loop
    if v_kind in ('plans','blocks','availability') then
      v_path := array[v_kind];
    elsif p_action = 'adapt_environment' then
      v_path := array['prescription',v_kind];
    else
      continue;
    end if;
    v_array := p_expected #> v_path;
    if jsonb_typeof(v_array) is distinct from 'array' or jsonb_array_length(v_array) >
       (case when v_kind = 'blocks' then 1200 else 100 end) then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    case v_kind
      when 'plans' then
        v_schema := '{"id":"uuid","user_id":"uuid","planned_date":"date","planned_time":"time","title":"text","status":"text","source":"text","linked_completed_session_id":"uuid","location_type":"text","session_type":"text","planned_intensity":"text","planned_duration_min":"integer","planned_duration_max":"integer","objective":"text","coach_notes":"text","constraints":"json","created_at":"timestamp","updated_at":"timestamp"}'::jsonb;
        v_nonnull := string_to_array('id user_id planned_date title status source session_type created_at updated_at', ' ');
      when 'blocks' then
        v_schema := '{"id":"uuid","planned_session_id":"uuid","block_order":"integer","block_type":"text","title":"text","objective":"text","planned_duration_seconds":"integer","planned_rounds":"integer","planned_exercises":"json","constraints":"json","notes":"text","created_at":"timestamp"}'::jsonb;
        v_nonnull := string_to_array('id planned_session_id block_order title created_at', ' ');
      when 'availability' then
        v_schema := '{"user_id":"uuid","calendar_date":"date","availability_status":"text","source":"text"}'::jsonb;
        v_nonnull := string_to_array('user_id calendar_date availability_status source', ' ');
      when 'constraints' then
        v_schema := '{"id":"uuid","user_id":"uuid","constraint_type":"text","severity":"text","description":"text","active":"boolean","updated_at":"timestamp"}'::jsonb;
        v_nonnull := string_to_array('id user_id constraint_type active updated_at', ' ');
      when 'locations' then
        v_schema := '{"id":"uuid","user_id":"uuid","display_name":"text","location_type":"text","access_mode":"text","prescription_scope":"text","coached_sessions_available":"boolean","is_active":"boolean","updated_at":"timestamp"}'::jsonb;
        v_nonnull := string_to_array('id user_id updated_at', ' ');
      when 'equipment' then
        v_schema := '{"id":"uuid","user_id":"uuid","equipment_id":"uuid","quantity":"number","unit":"text","location_label":"text","available":"boolean","valid_from":"date","valid_to":"date","updated_at":"timestamp"}'::jsonb;
        v_nonnull := string_to_array('id user_id equipment_id updated_at', ' ');
      when 'catalog' then
        v_schema := '{"id":"uuid","name":"text","equipment_category":"text","unit":"text","updated_at":"timestamp"}'::jsonb;
        v_nonnull := string_to_array('id name updated_at', ' ');
    end case;
    select array_agg(key) into v_keys from jsonb_object_keys(v_schema) key;
    v_normalized := '[]'::jsonb;
    for v_row in select value from jsonb_array_elements(v_array) loop
      if jsonb_typeof(v_row) is distinct from 'object' or not (v_row ?& v_keys)
         or v_row - v_keys <> '{}'::jsonb then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      for v_key, v_type in select key,value from jsonb_each_text(v_schema) loop
        v_value := v_row->v_key;
        if v_value = 'null'::jsonb then
          if v_key = any(v_nonnull) then
            return jsonb_build_object('ok', false, 'error', 'invalid_request');
          end if;
          continue;
        end if;
        if (v_type in ('text','uuid','date','timestamp','time') and jsonb_typeof(v_value) <> 'string')
           or (v_type in ('number','integer') and jsonb_typeof(v_value) <> 'number')
           or (v_type = 'boolean' and jsonb_typeof(v_value) <> 'boolean') then
          return jsonb_build_object('ok', false, 'error', 'invalid_request');
        end if;
        if v_type = 'uuid' then
          if v_value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            return jsonb_build_object('ok', false, 'error', 'invalid_request');
          end if;
        elsif v_type = 'date' then
          if v_value#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' then
            return jsonb_build_object('ok', false, 'error', 'invalid_request');
          end if;
          v_row := jsonb_set(v_row,array[v_key],to_jsonb((v_value#>>'{}')::date));
        elsif v_type = 'timestamp' then
          if v_value#>>'{}' !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$' then
            return jsonb_build_object('ok', false, 'error', 'invalid_request');
          end if;
          v_row := jsonb_set(v_row,array[v_key],to_jsonb((v_value#>>'{}')::timestamptz));
        elsif v_type = 'time' then
          if v_value#>>'{}' !~ '^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$' then
            return jsonb_build_object('ok', false, 'error', 'invalid_request');
          end if;
          v_row := jsonb_set(v_row,array[v_key],to_jsonb((v_value#>>'{}')::time));
        elsif v_type = 'integer' then
          if v_value::text !~ '^-?\d+$' or (v_value::text)::numeric not between -2147483648 and 2147483647 then
            return jsonb_build_object('ok', false, 'error', 'invalid_request');
          end if;
        end if;
      end loop;
      if v_row ? 'user_id' and v_row->>'user_id' is distinct from p_user_id::text then
        return jsonb_build_object('ok', false, 'error', 'preview_stale');
      end if;
      if v_kind = 'plans' and (v_row->>'planned_date')::date not between v_from and v_to
         or v_kind = 'blocks' and not ((v_row->>'planned_session_id')::uuid = any(v_block_ids))
         or v_kind = 'availability' and (v_row->>'calendar_date')::date not between v_from and v_to
         or v_kind = 'constraints' and v_row->'active' <> 'true'::jsonb then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      v_normalized := v_normalized || jsonb_build_array(v_row);
    end loop;
    -- Ordering is canonicalized rather than trusting a caller's array order.
    if v_kind = 'plans' then
      select coalesce(jsonb_agg(value order by value->>'planned_date',value->>'id'),'[]') into v_normalized from jsonb_array_elements(v_normalized);
    elsif v_kind = 'blocks' then
      select coalesce(jsonb_agg(value order by (value->>'block_order')::integer,value->>'id'),'[]') into v_normalized from jsonb_array_elements(v_normalized);
    elsif v_kind = 'availability' then
      select coalesce(jsonb_agg(value order by value->>'calendar_date'),'[]') into v_normalized from jsonb_array_elements(v_normalized);
    else
      select coalesce(jsonb_agg(value order by value->>'id'),'[]') into v_normalized from jsonb_array_elements(v_normalized);
    end if;
    if exists (select from jsonb_array_elements(v_normalized) item group by
      case when v_kind='availability' then item->>'calendar_date' else item->>'id' end having count(*) > 1) then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    v_expected := jsonb_set(v_expected,v_path,v_normalized);
  end loop;

  -- Closed command DTO: there is deliberately no RPC name, table, patch, owner,
  -- free-form action or SQL input. All identifiers are bound to expected scope.
  v_keys := case p_action
    when 'move_session' then array['sourceDate','targetDate']
    when 'adapt_duration' then array['sourceDate','sessionId','duration','blocks']
    when 'adapt_environment' then array['sourceDate','sessionId','session']
    when 'cancel_session' then array['sourceDate','sessionId']
    when 'adapt_remaining_week' then array['from','to','moves'] end;
  if not (p_command ?& v_keys) or p_command - v_keys <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  if p_action = 'adapt_remaining_week' then
    if jsonb_typeof(p_command->'from') is distinct from 'string'
       or jsonb_typeof(p_command->'to') is distinct from 'string'
       or p_command->>'from' <> v_from::text or p_command->>'to' <> v_to::text
       or v_from <> v_calendar or v_to-v_from > 6
       or extract(isodow from v_to) <> 7
       or jsonb_typeof(p_command->'moves') is distinct from 'array'
       or jsonb_array_length(p_command->'moves') not between 1 and 7 then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    select coalesce(array_agg((value->>'id')::uuid order by value->>'id'),'{}'::uuid[])
      into v_plan_ids from jsonb_array_elements(v_expected->'plans');
    if v_block_ids is distinct from v_plan_ids then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    for v_move in select value from jsonb_array_elements(p_command->'moves') loop
      v_keys := array['planned_session_id','source_date','target_date'];
      if jsonb_typeof(v_move) is distinct from 'object' or not (v_move ?& v_keys)
         or v_move - v_keys <> '{}'::jsonb
         or jsonb_typeof(v_move->'planned_session_id') is distinct from 'string'
         or v_move->>'planned_session_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or jsonb_typeof(v_move->'source_date') is distinct from 'string'
         or jsonb_typeof(v_move->'target_date') is distinct from 'string'
         or v_move->>'source_date' !~ '^\d{4}-\d{2}-\d{2}$'
         or v_move->>'target_date' !~ '^\d{4}-\d{2}-\d{2}$' then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      v_source_date := (v_move->>'source_date')::date;
      v_target_date := (v_move->>'target_date')::date;
      if v_source_date not between v_from and v_to or v_target_date not between v_from and v_to
         or v_target_date <= v_source_date then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      select value into v_source from jsonb_array_elements(v_expected->'plans') where value->>'id'=v_move->>'planned_session_id';
      if v_source is null or v_source->>'planned_date' <> v_source_date::text
         or v_source->>'source' <> 'enkidu_coach'
         or v_source->>'status' in ('cancelled','skipped','completed','canceled','enriched')
         or v_source->'linked_completed_session_id' <> 'null'::jsonb
         or exists(select from jsonb_array_elements(v_expected->'availability') where value->>'calendar_date'=v_target_date::text and value->>'availability_status'='unavailable') then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
    end loop;
  else
    if jsonb_typeof(p_command->'sourceDate') is distinct from 'string'
       or p_command->>'sourceDate' !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    v_source_date := (p_command->>'sourceDate')::date;
    if v_is_closed_loop then
      if v_from <> v_calendar+1 or v_to <> v_source_date then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
    elsif v_from <> v_source_date then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    select count(*) into v_count from jsonb_array_elements(v_expected->'plans') where value->>'planned_date'=v_source_date::text and value->>'status'<>'cancelled';
    select value into v_source from jsonb_array_elements(v_expected->'plans') where value->>'planned_date'=v_source_date::text and value->>'status'<>'cancelled' limit 1;
    if v_count <> 1 or v_source->>'status' in ('skipped','completed','canceled','enriched')
       or v_source->'linked_completed_session_id' <> 'null'::jsonb then
      return jsonb_build_object('ok', false, 'error', 'preview_stale');
    end if;
    v_session_id := (v_source->>'id')::uuid;
    if v_block_ids is distinct from array[v_session_id]
       or (p_action in ('adapt_duration','adapt_environment') and v_source->>'source'<>'enkidu_coach') then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    if v_is_closed_loop and exists(select from jsonb_array_elements(v_expected->'plans') where
       value->>'status' not in ('cancelled','skipped','completed','canceled','enriched')
       and value->'linked_completed_session_id'='null'::jsonb
       and (value->>'planned_date',value->>'id') < (v_source_date::text,v_session_id::text)) then
      return jsonb_build_object('ok', false, 'error', 'preview_stale');
    end if;
    if p_action = 'move_session' then
      if jsonb_typeof(p_command->'targetDate') is distinct from 'string'
         or p_command->>'targetDate' !~ '^\d{4}-\d{2}-\d{2}$' then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      v_target_date := (p_command->>'targetDate')::date;
      if v_target_date <> v_to or v_target_date <= v_source_date
         or exists(select from jsonb_array_elements(v_expected->'plans') where value->>'planned_date'=v_target_date::text and value->>'status'<>'cancelled')
         or exists(select from jsonb_array_elements(v_expected->'availability') where value->>'calendar_date'=v_target_date::text and value->>'availability_status'='unavailable') then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
    else
      if v_to <> v_source_date or jsonb_typeof(p_command->'sessionId') is distinct from 'string'
         or p_command->>'sessionId' <> v_session_id::text then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      if p_action in ('adapt_duration','adapt_environment') and exists(select from jsonb_array_elements(v_expected->'availability') where value->>'calendar_date'=v_source_date::text and value->>'availability_status'='unavailable') then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
    end if;
  end if;

  if p_action = 'adapt_duration' then
    if jsonb_typeof(p_command->'duration') is distinct from 'number'
       or (p_command->'duration')::text !~ '^\d+$'
       or (p_command->>'duration')::numeric not between 10 and 180
       or jsonb_typeof(p_command->'blocks') is distinct from 'array'
       or jsonb_array_length(p_command->'blocks') not between 1 and 12 then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    v_total := 0;
    for v_row in select value from jsonb_array_elements(p_command->'blocks') loop
      v_keys := array['id','duration_seconds'];
      if jsonb_typeof(v_row) is distinct from 'object' or not(v_row ?& v_keys)
         or v_row-v_keys <> '{}'::jsonb or jsonb_typeof(v_row->'id') is distinct from 'string'
         or jsonb_typeof(v_row->'duration_seconds') is distinct from 'number'
         or (v_row->'duration_seconds')::text !~ '^\d+$'
         or (v_row->>'duration_seconds')::numeric not between 60 and 10800
         or not exists(select from jsonb_array_elements(v_expected->'blocks') where value->>'id'=v_row->>'id') then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      v_integer := (v_row->>'duration_seconds')::integer;
      if mod(v_integer,60)<>0 then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
      v_total := v_total + v_integer;
    end loop;
    if v_total<>(p_command->>'duration')::integer*60
       or jsonb_array_length(p_command->'blocks')<>jsonb_array_length(v_expected->'blocks')
       or exists(select from jsonb_array_elements(p_command->'blocks') group by value->>'id' having count(*)>1) then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
  elsif p_action = 'adapt_environment' then
    v_row := p_command->'session';
    v_keys := array['title','session_type','environment','intensity','objective','duration_minutes','blocks'];
    if jsonb_typeof(v_row) is distinct from 'object' or not(v_row ?& v_keys) or v_row-v_keys <> '{}'::jsonb
       or jsonb_typeof(v_row->'title') is distinct from 'string'
       or length(v_row->>'title') not between 1 and 160 or btrim(v_row->>'title')<>v_row->>'title'
       or jsonb_typeof(v_row->'session_type') is distinct from 'string'
       or length(v_row->>'session_type') not between 1 and 80 or btrim(v_row->>'session_type')<>v_row->>'session_type'
       or jsonb_typeof(v_row->'environment') is distinct from 'string'
       or v_row->>'environment' not in ('home','pool','trail','outdoor','functional_training_center')
       or (v_row->'intensity'<>'null'::jsonb and (jsonb_typeof(v_row->'intensity')<>'string' or length(v_row->>'intensity') not between 1 and 80 or btrim(v_row->>'intensity')<>v_row->>'intensity'))
       or (v_row->'objective'<>'null'::jsonb and (jsonb_typeof(v_row->'objective')<>'string' or length(v_row->>'objective') not between 1 and 700 or btrim(v_row->>'objective')<>v_row->>'objective'))
       or jsonb_typeof(v_row->'duration_minutes') is distinct from 'number'
       or (v_row->'duration_minutes')::text !~ '^\d+$'
       or (v_row->>'duration_minutes')::numeric not between 1 and 360
       or jsonb_typeof(v_row->'blocks') is distinct from 'array'
       or jsonb_array_length(v_row->'blocks') not between 1 and 12 then
      return jsonb_build_object('ok', false, 'error', 'invalid_request');
    end if;
    for v_row in select value from jsonb_array_elements(p_command#>'{session,blocks}') loop
      v_keys := array['title','duration_minutes'];
      if jsonb_typeof(v_row) is distinct from 'object' or not(v_row ?& v_keys) or v_row-v_keys <> '{}'::jsonb
         or jsonb_typeof(v_row->'title') is distinct from 'string'
         or length(v_row->>'title') not between 1 and 160 or btrim(v_row->>'title')<>v_row->>'title'
         or jsonb_typeof(v_row->'duration_minutes') is distinct from 'number'
         or (v_row->'duration_minutes')::text !~ '^\d+$'
         or (v_row->>'duration_minutes')::numeric not between 1 and 360 then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
    end loop;
  end if;

  -- Same namespaces and chronological order as the existing Coach writers.
  -- Acquire ALL advisory locks before table locks: a wrapper must not hold a
  -- table while waiting on the date lock of an existing single-action writer.
  v_date := v_from;
  while v_date <= v_to loop
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || '|' || v_date::text,0));
    v_date := v_date+1;
  end loop;
  v_date := v_from;
  while v_date <= v_to loop
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || '|availability|' || v_date::text,0));
    v_date := v_date+1;
  end loop;

  -- Row locks alone do not protect empty target dates, replaced/inserted child
  -- blocks, or absent availability rows against direct canonical DML. With no
  -- new tables/triggers/indexes, these short table locks are the conservative
  -- phantom barrier. They serialize planning writes across users; reads continue.
  -- Existing service_role table UPDATE/DELETE privileges are required, unchanged.
  lock table public.planned_training_sessions in share row exclusive mode;
  lock table public.planned_session_blocks in share row exclusive mode;
  lock table public.training_availability_overrides in share row exclusive mode;
  if p_action='adapt_environment' then
    lock table public.coach_athlete_constraints in share mode;
    lock table public.user_training_locations in share mode;
    lock table public.user_equipment in share mode;
    lock table public.equipment_catalog in share mode;
  end if;
  select timezone into v_timezone from public.profiles where id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'error','preview_stale'); end if;
  if v_timezone is null or not exists(select from pg_timezone_names where name=v_timezone)
     or v_timezone <> p_expected#>>'{calendar,timezone}' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  perform 1 from public.planned_training_sessions where user_id=p_user_id and planned_date between v_from and v_to order by planned_date,id for update;
  perform 1 from public.planned_session_blocks where planned_session_id=any(v_block_ids) order by planned_session_id,block_order,id for update;
  perform 1 from public.training_availability_overrides where user_id=p_user_id and calendar_date between v_from and v_to order by calendar_date for update;

  -- All following canonical reads and the existing writer share this transaction
  -- and its locks. PostgreSQL READ COMMITTED gets fresh snapshots after waiting;
  -- stricter isolation is rejected below instead of trusting an old snapshot.
  select coalesce(jsonb_agg(to_jsonb(r) order by r.planned_date,r.id),'[]') into v_actual
    from (select id,user_id,planned_date,planned_time,title,status,source,linked_completed_session_id,location_type,session_type,planned_intensity,planned_duration_min,planned_duration_max,objective,coach_notes,constraints,created_at,updated_at from public.planned_training_sessions where user_id=p_user_id and planned_date between v_from and v_to) r;
  if v_actual is distinct from v_expected->'plans' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.block_order,r.id),'[]') into v_actual
    from (select id,planned_session_id,block_order,block_type,title,objective,planned_duration_seconds,planned_rounds,planned_exercises,constraints,notes,created_at from public.planned_session_blocks where planned_session_id=any(v_block_ids)) r;
  if v_actual is distinct from v_expected->'blocks' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.calendar_date),'[]') into v_actual
    from (select user_id,calendar_date,availability_status,source from public.training_availability_overrides where user_id=p_user_id and calendar_date between v_from and v_to) r;
  if v_actual is distinct from v_expected->'availability' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  if p_action='adapt_environment' then
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into v_actual
    from (select id,user_id,constraint_type,severity,description,active,updated_at from public.coach_athlete_constraints where user_id=p_user_id and active=true) r;
  if v_actual is distinct from v_expected#>'{prescription,constraints}' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into v_actual
    from (select id,user_id,display_name,location_type,access_mode,prescription_scope,coached_sessions_available,is_active,updated_at from public.user_training_locations where user_id=p_user_id) r;
  if v_actual is distinct from v_expected#>'{prescription,locations}' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into v_actual
    from (select id,user_id,equipment_id,quantity,unit,location_label,available,valid_from,valid_to,updated_at from public.user_equipment where user_id=p_user_id) r;
  if v_actual is distinct from v_expected#>'{prescription,equipment}' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into v_actual
    from (select id,name,equipment_category,unit,updated_at from public.equipment_catalog where id in (select equipment_id from public.user_equipment where user_id=p_user_id)) r;
  if v_actual is distinct from v_expected#>'{prescription,catalog}' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;
  end if;
  -- calendar.date is the trusted server admission date, resolved with the
  -- profile timezone before preparing the absolute command. Clock passage is
  -- not mutable database authority and cannot be held by a transaction lock;
  -- the runtime checks freshness/expiry at admission, including midnight.
  if current_setting('transaction_isolation') <> 'read committed' then
    return jsonb_build_object('ok',false,'error','preview_stale');
  end if;

  -- No second domain writer: invoke exactly the existing functions. Reentrant
  -- advisory locks are held until the outer transaction commits. A thrown writer
  -- error rolls back this entire function block before returning a safe code.
  case p_action
    when 'move_session' then
      v_result := public.move_coach_planned_session(p_user_id,v_source_date,v_target_date);
    when 'adapt_duration' then
      v_result := public.adapt_coach_planned_session_duration(p_user_id,v_source_date,v_session_id,(p_command->>'duration')::integer,p_command->'blocks');
    when 'adapt_environment' then
      v_result := public.adapt_coach_planned_session_environment(p_user_id,v_source_date,v_session_id,p_command->'session');
    when 'cancel_session' then
      v_result := public.cancel_coach_planned_session(p_user_id,v_source_date,v_session_id);
    when 'adapt_remaining_week' then
      v_result := public.adapt_coach_remaining_week(p_user_id,v_from,v_to,p_command->'moves');
  end case;
  if v_result->'ok' is distinct from 'true'::jsonb then
    -- Reject through the exception boundary, so even a future legacy writer
    -- returning failure after a write cannot leave partial effects behind.
    -- Never forward its internal IDs or database details.
    raise exception using errcode='EN001', message='enqidu_writer_rejected';
  end if;
  return v_result;
exception
  when sqlstate 'EN001' then
    return jsonb_build_object('ok',false,'error','plan_write_rejected');
  when serialization_failure or deadlock_detected then
    return jsonb_build_object('ok',false,'error','preview_stale');
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or invalid_parameter_value then
    return jsonb_build_object('ok',false,'error','invalid_request');
  when others then
    return jsonb_build_object('ok',false,'error','plan_write_failed');
end;
$$;

revoke execute on function public.apply_enqidu_action_v1(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_enqidu_action_v1(uuid,text,jsonb,jsonb) to service_role;
comment on function public.apply_enqidu_action_v1(uuid,text,jsonb,jsonb) is
  'ENQIDU atomic acceptance V1; server-owned closed expected/command DTOs; unchanged Coach writers; service-role only; advisory evidence excluded.';

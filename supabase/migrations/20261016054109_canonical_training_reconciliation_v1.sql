-- No data backfill. All matching and mutation is server-side and tenant scoped.
create schema if not exists training_reconciliation;
revoke all on schema training_reconciliation from public, anon, authenticated;

create table public.training_reconciliation_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references public.training_sessions(id),
 source_id uuid references public.training_sources(id),
 plan_id uuid references public.planned_training_sessions(id),
 reason text not null,
 before_state jsonb not null,
 after_state jsonb not null,
 created_at timestamptz not null default now(),
 rolled_back_at timestamptz
);
alter table public.training_reconciliation_events enable row level security;
revoke all on public.training_reconciliation_events from public, anon, authenticated;
grant select, insert, update on public.training_reconciliation_events to service_role;

-- SECURITY INVOKER workers need explicit table privileges; BYPASSRLS is not a grant.
grant select on public.training_sessions, public.training_sources,
  public.session_source_links, public.session_blocks, public.session_exercises,
  public.planned_training_sessions to service_role;
grant insert, delete on public.session_source_links, public.session_blocks,
  public.session_exercises to service_role;
grant update on public.planned_training_sessions to service_role;
create index training_reconciliation_events_owner on public.training_reconciliation_events(user_id,created_at);
create index if not exists training_sessions_reconciliation_day on public.training_sessions(user_id,local_date,id);
create index if not exists training_sessions_reconciliation_observed on public.training_sessions(user_id,started_at,id);
create index if not exists training_sources_reconciliation_day on public.training_sources(user_id,((original_json->>'session_date')));

create function training_reconciliation.number(value text) returns numeric
language sql immutable set search_path='' as $$
 select case when value ~ '^[0-9]{1,8}([.][0-9]{1,6})?$' then value::numeric end
$$;
create function training_reconciliation.instant(value text) returns timestamptz
language plpgsql immutable set search_path='' as $$
begin
 if value !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return null; end if;
 return value::timestamptz;
exception when others then return null;
end $$;
create function training_reconciliation.modality(sport text, sub_sport text default null) returns text
language sql immutable set search_path='' as $$
 select case
 when lower(sub_sport) in ('yoga','pilates') then lower(sub_sport)
 when lower(sub_sport)='strength_training' then 'strength'
 when lower(sport) in ('strength_training','strength') then 'strength'
 when lower(sport) in ('62','hiit','hybrid','hyrox') then 'hybrid'
 when lower(sport) in ('cycling','bike') then 'cycling'
 when lower(sport) in ('running','run') then 'running'
 when lower(sport) in ('yoga','pilates') then lower(sport)
 else null end
$$;

-- One evaluator, shared by dry-run and apply. No title matching and no cross-user input.
create function training_reconciliation.decisions(p_user uuid,p_day date)
returns table(kind text, entity_id uuid, session_id uuid, outcome text, reason text)
language sql stable set search_path='' as $$
 with executions as (
 select s.*, training_reconciliation.modality(s.session_structure#>>'{garmin_fit_summary,sport}',s.session_structure#>>'{garmin_fit_summary,sub_sport}') modality,
   substring(t.original_json->>'innerFitName' from '^([0-9]+)_ACTIVITY[.]fit$') activity_id
 from public.training_sessions s join public.training_sources t on t.id=s.source_id and t.user_id=p_user and t.source_type='garmin_fit'
 join public.profiles profile on profile.id=p_user
 where s.user_id=p_user and s.session_kind='completed' and s.session_status in ('completed','recorded')
 and s.started_at >= (p_day::timestamp at time zone profile.timezone)
 and s.started_at < ((p_day+1)::timestamp at time zone profile.timezone)
 ), sources as (
 select t.*,coalesce(t.original_json#>>'{garmin_matching_hint,activity_id}',t.provenance->>'garmin_connector_activity_id') activity_id,
 training_reconciliation.instant(t.original_json#>>'{garmin_matching_hint,start_time_local}') instant,
 training_reconciliation.modality(t.original_json#>>'{garmin_matching_hint,activity_type}') modality,
 training_reconciliation.number(coalesce(t.original_json#>>'{garmin_matching_hint,duration_s}',t.original_json#>>'{garmin_matching_hint,recorded_duration_s}')) duration
 from public.training_sources t where t.user_id=p_user and t.source_type in ('manual_entry','manual_description','trainer_evidence')
 and t.original_json->>'session_date'=p_day::text
 ), source_candidates as (
 select t.id source_id,s.id session_id from sources t join executions s on
 -- Explicit target still requires coherent physical evidence; IDs cannot override contradictions.
 (t.provenance->>'fused_session_id' is null or t.provenance->>'fused_session_id'=s.id::text)
 and (t.activity_id is null or t.activity_id=s.activity_id)
 and t.instant is not null and abs(extract(epoch from (t.instant-s.started_at)))<=60
 and t.modality=s.modality and t.duration is not null and abs(t.duration-s.duration_seconds)<=greatest(5,t.duration*0.01)
 ), source_results as (
 select 'source'::text kind,t.id entity_id,
 coalesce((select l.session_id from public.session_source_links l join public.training_sessions owner on owner.id=l.session_id and owner.user_id=p_user where l.source_id=t.id order by l.session_id limit 1),(select c.session_id from source_candidates c where c.source_id=t.id order by c.session_id limit 1)) session_id,
 case when exists(select 1 from public.session_source_links l where l.source_id=t.id) then 'already_reconciled'
 when exists(select 1 from public.training_sessions s where s.source_id=t.id) then 'ambiguous'
 when (select count(*) from source_candidates c where c.source_id=t.id)>1 then 'ambiguous'
 when (select count(*) from source_candidates c where c.source_id=t.id)=1 then 'matched'
 else 'skipped' end outcome,
 case when exists(select 1 from public.session_source_links l where l.source_id=t.id) then 'existing_source_link_preserved'
 when exists(select 1 from public.training_sessions s where s.source_id=t.id) then 'source_already_has_physical_session'
 when (select count(*) from source_candidates c where c.source_id=t.id)>1 then 'multiple_physical_candidates'
 when (select count(*) from source_candidates c where c.source_id=t.id)=1 then 'observed_identity_time_modality_duration'
 else 'insufficient_or_conflicting_physical_evidence' end reason
 from sources t
 ), plans as (
 select p.* from public.planned_training_sessions p where p.user_id=p_user and p.planned_date=p_day
 ), plan_candidates as (
 select p.id plan_id,s.id session_id from plans p join executions s on
 training_reconciliation.modality(p.session_type)=s.modality
 and p.planned_duration_min is not null and p.planned_duration_max is not null
 and s.duration_seconds between p.planned_duration_min*60 and p.planned_duration_max*60
 and (
   exists(select 1 from source_candidates sc join sources semantic on semantic.id=sc.source_id
     where sc.session_id=s.id and semantic.original_json->>'planned_session_id'=p.id::text)
   or (p.planned_time is not null and abs(extract(epoch from ((s.started_at at time zone (select timezone from public.profiles where id=p_user))::time-p.planned_time)))<=900)
 )
 where p.status in ('planned','confirmed','modified') and p.linked_completed_session_id is null
 and not exists(select 1 from public.planned_training_sessions other where other.linked_completed_session_id=s.id)
 )
 select * from source_results
 union all
 select 'plan',p.id,coalesce(p.linked_completed_session_id,(select c.session_id from plan_candidates c where c.plan_id=p.id order by c.session_id limit 1)),
 case when p.linked_completed_session_id is not null then 'already_reconciled'
 when (select count(*) from plan_candidates c where c.plan_id=p.id)>1 or exists(select 1 from plan_candidates c join plan_candidates other on other.session_id=c.session_id and other.plan_id<>c.plan_id where c.plan_id=p.id) then 'ambiguous'
 when (select count(*) from plan_candidates c where c.plan_id=p.id)=1 then 'matched' else 'skipped' end,
 case when p.linked_completed_session_id is not null then 'existing_plan_link_preserved'
 when (select count(*) from plan_candidates c where c.plan_id=p.id)>1 or exists(select 1 from plan_candidates c join plan_candidates other on other.session_id=c.session_id and other.plan_id<>c.plan_id where c.plan_id=p.id) then 'non_unique_plan_execution'
 when (select count(*) from plan_candidates c where c.plan_id=p.id)=1 then 'unique_reciprocal_plan_anchor_modality_duration'
 else 'no_execution_with_sufficient_plan_anchor' end
 from plans p
$$;

create function public.reconcile_training_day_v1(p_user_id uuid,p_day date,p_dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 d record; t public.training_sources%rowtype; b jsonb; e jsonb; blocks jsonb;
 bid uuid; eid uuid; event_id uuid; ids jsonb; block_ids jsonb; exercise_ids jsonb;
 block_index integer; exercise_index integer; old_link uuid; result jsonb:='[]';
begin
 if p_user_id is null or p_day is null or p_dry_run is null then raise exception 'Missing scope'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and timezone is not null) then raise exception 'Missing athlete timezone'; end if;
 -- Entire day serializes retries and overlapping arrival paths, never just a source ID.
 if not p_dry_run then perform pg_advisory_xact_lock(hashtextextended('training-reconciliation:'||p_user_id::text,0)); end if;
 for d in select * from training_reconciliation.decisions(p_user_id,p_day) order by kind,entity_id loop
   if d.outcome <> 'matched' then result:=result||jsonb_build_array(to_jsonb(d)); continue; end if;
   if d.kind='source' then
     select * into t from public.training_sources where id=d.entity_id and user_id=p_user_id;
     if t.original_json->>'semantic_role'='trainer_evidence' then
       if not p_dry_run then
         insert into public.session_source_links(session_id,source_id,source_role,is_primary) values(d.session_id,t.id,'supporting',false);
         insert into public.training_reconciliation_events(user_id,session_id,source_id,reason,before_state,after_state)
         values(p_user_id,d.session_id,t.id,'trainer_supporting_evidence','{}',jsonb_build_object('blocks','[]'::jsonb,'exercises','[]'::jsonb,'link',jsonb_build_object('session_id',d.session_id,'source_id',t.id,'source_role','supporting','is_primary',false)));
       end if;
       result:=result||jsonb_build_array(to_jsonb(d)||jsonb_build_object('candidate',true,'applied',not p_dry_run)); continue;
     end if;
     blocks:=coalesce(t.original_json->'blocks',t.original_json#>'{sessions,0,blocks}');
     -- A second semantic interpretation is never appended blindly to existing exercises.
     if exists(select 1 from public.session_blocks where session_id=d.session_id) then
       d.outcome:='ambiguous'; d.reason:='existing_semantics_require_review';
       result:=result||jsonb_build_array(to_jsonb(d)); continue;
     end if;
     if jsonb_typeof(blocks) is distinct from 'array' or jsonb_array_length(blocks)=0 then
       d.outcome:='skipped'; d.reason:='unsupported_semantic_shape_preserved';
       result:=result||jsonb_build_array(to_jsonb(d)); continue;
     end if;
     if jsonb_array_length(blocks)>100 or exists(select 1 from jsonb_array_elements(blocks) x where jsonb_typeof(x)<>'object' or (x ? 'exercises' and jsonb_typeof(x->'exercises')<>'array') or (x ? 'segments' and jsonb_typeof(x->'segments')<>'array')) then
       d.outcome:='skipped'; d.reason:='invalid_semantic_shape'; result:=result||jsonb_build_array(to_jsonb(d)); continue;
     end if;
     if exists(select 1 from jsonb_array_elements(blocks) semantic_block cross join lateral jsonb_array_elements(coalesce(semantic_block->'exercises',semantic_block->'segments','[]')) semantic_exercise
       where jsonb_typeof(semantic_exercise)<>'object' or nullif(coalesce(semantic_exercise->>'reported_name',semantic_exercise->>'name',semantic_exercise->>'exercise'),'') is null)
       or (select coalesce(sum(jsonb_array_length(coalesce(semantic_block->'exercises',semantic_block->'segments','[]'))),0) from jsonb_array_elements(blocks) semantic_block)>1000 then
       d.outcome:='skipped'; d.reason:='invalid_or_unbounded_exercises'; result:=result||jsonb_build_array(to_jsonb(d)); continue;
     end if;
     if not p_dry_run then
       block_ids:='[]'; exercise_ids:='[]'; block_index:=0; exercise_index:=0;
       for b in select value from jsonb_array_elements(blocks) with ordinality x(value,n) order by coalesce(training_reconciliation.number(value->>'order'),training_reconciliation.number(value->>'block_order'),n),n loop
         block_index:=block_index+1;
         insert into public.session_blocks(session_id,block_order,block_type,name,rounds_completed,prescription,execution_notes,data_confidence)
         values(d.session_id,block_index,
           case when coalesce(b->>'block_type',b->>'type') in ('warmup','mobility','strength','skill','conditioning','metcon','cardio','cooldown','recovery','mixed','other') then coalesce(b->>'block_type',b->>'type') else 'other' end,
           coalesce(b->>'name',b->>'block_name',b->>'type','Bloque'),
           training_reconciliation.number(coalesce(b->>'rounds_completed',b->>'rounds')),
           b||jsonb_build_object('reconciliation_source_id',t.id),coalesce(b->>'execution_notes',b->>'details',b->>'summary'),'manual') returning id into bid;
         block_ids:=block_ids||jsonb_build_array(bid);
         for e in select value from jsonb_array_elements(coalesce(b->'exercises',b->'segments','[]')) with ordinality x(value,n) order by coalesce(training_reconciliation.number(value->>'order'),n),n loop
           if coalesce(e->>'reported_name',e->>'name',e->>'exercise') is null then raise exception 'Exercise name required'; end if;
           exercise_index:=exercise_index+1;
           insert into public.session_exercises(session_id,block_id,exercise_order,reported_name,execution_type,sets_completed,rounds_completed,reps_per_set,load_value,load_unit,equipment_snapshot,tempo_or_pause,duration_seconds,side,notes,data_confidence)
           values(d.session_id,bid,exercise_index,coalesce(e->>'reported_name',e->>'name',e->>'exercise'),
             case when coalesce(e->>'execution_type',e->>'execution',e->>'status') in ('performed','planned','modified','substituted','skipped') then coalesce(e->>'execution_type',e->>'execution',e->>'status') else 'performed' end,
             training_reconciliation.number(coalesce(e->>'sets_completed',e->>'sets')),
             training_reconciliation.number(coalesce(e->>'rounds_completed',b->>'rounds_completed',b->>'rounds')),
             coalesce(e->'reps_per_set',case when e ? 'reps' then jsonb_build_array(e->'reps') when e ? 'reps_per_side' then jsonb_build_object('per_side',e->'reps_per_side') end),
             training_reconciliation.number(coalesce(e->>'load_value',e->>'load_total_kg',e->>'load_kg',b->>'load_kg')),
             coalesce(e->>'load_unit',case when e ? 'load_total_kg' or e ? 'load_kg' or b ? 'load_kg' then 'kg' end),
             e||jsonb_build_object('reconciliation_source_id',t.id),coalesce(e->>'tempo_or_pause',e->>'tempo'),
             training_reconciliation.number(e->>'duration_seconds')::integer,
             case when e->>'side' in ('left','right','bilateral','alternating','each_side','na') then e->>'side' end,
             concat_ws(E'\n',e->>'notes',e->>'details',e->>'load_detail'),'manual') returning id into eid;
           exercise_ids:=exercise_ids||jsonb_build_array(eid);
         end loop;
       end loop;
       insert into public.session_source_links(session_id,source_id,source_role,is_primary) values(d.session_id,t.id,'manual_description',false);
       insert into public.training_reconciliation_events(user_id,session_id,source_id,reason,before_state,after_state)
       values(p_user_id,d.session_id,t.id,d.reason,'{}',jsonb_build_object('blocks',(select jsonb_agg(to_jsonb(x)) from public.session_blocks x where id in(select value::uuid from jsonb_array_elements_text(block_ids))), 'exercises',(select jsonb_agg(to_jsonb(x)) from public.session_exercises x where id in(select value::uuid from jsonb_array_elements_text(exercise_ids))),'link',jsonb_build_object('session_id',d.session_id,'source_id',t.id,'source_role','manual_description','is_primary',false)));
     end if;
   else
     if not p_dry_run then
       select linked_completed_session_id into old_link from public.planned_training_sessions where id=d.entity_id and user_id=p_user_id for update;
       if old_link is not null then raise exception 'Plan changed; retry'; end if;
       update public.planned_training_sessions set linked_completed_session_id=d.session_id where id=d.entity_id and user_id=p_user_id and linked_completed_session_id is null;
       insert into public.training_reconciliation_events(user_id,session_id,plan_id,reason,before_state,after_state)
       values(p_user_id,d.session_id,d.entity_id,d.reason,jsonb_build_object('linked_completed_session_id',old_link),jsonb_build_object('linked_completed_session_id',d.session_id));
     end if;
   end if;
   result:=result||jsonb_build_array(to_jsonb(d)||jsonb_build_object('candidate',true,'applied',not p_dry_run));
 end loop;
 -- Physical identity verdict is separate from the backfill/action outcome.
 select coalesce(jsonb_agg(item||jsonb_build_object('match_status',case
   when item->>'outcome'='ambiguous' then 'AMBIGUOUS'
   when item->>'session_id' is null then 'NO_MATCH'
   else 'MATCH' end) order by ordinal),'[]'::jsonb) into result
 from jsonb_array_elements(result) with ordinality rows(item,ordinal);
 return jsonb_build_object('version',1,'dry_run',p_dry_run,'user_id',p_user_id,'day',p_day,'decisions',result);
end $$;
revoke all on function public.reconcile_training_day_v1(uuid,date,boolean) from public,anon,authenticated;
grant usage on schema training_reconciliation to service_role;
grant execute on all functions in schema training_reconciliation to service_role;
grant execute on function public.reconcile_training_day_v1(uuid,date,boolean) to service_role;

-- Minimal event adapters: no matching policy here. SECURITY DEFINER is confined
-- to the private schema; actor is checked before delegating to the closed worker.
create function training_reconciliation.on_arrival() returns trigger
language plpgsql security definer set search_path='' as $$
declare day date; owner uuid;
begin
 owner:=new.user_id;
 if owner is null then return new; end if;
 if auth.uid() is not null and auth.uid()<>owner then raise exception 'Foreign reconciliation scope'; end if;
 if tg_table_name='training_sources' then
   if new.source_type not in ('manual_entry','manual_description','trainer_evidence') then return new; end if;
   begin day:=(new.original_json->>'session_date')::date; exception when others then return new; end;
 elsif tg_table_name='planned_training_sessions' then day:=new.planned_date;
 else
   if new.processing_status<>'persisted' or new.session_id is null then return new; end if;
   select (s.started_at at time zone p.timezone)::date into day from public.training_sessions s join public.profiles p on p.id=owner where s.id=new.session_id and s.user_id=owner;
 end if;
 if day is not null then perform public.reconcile_training_day_v1(owner,day,false); end if;
 return new;
end $$;
revoke all on function training_reconciliation.on_arrival() from public,anon,authenticated;
create trigger reconcile_manual_source_arrival after insert or update of original_json on public.training_sources for each row execute function training_reconciliation.on_arrival();
create trigger reconcile_plan_arrival after insert or update of planned_date,session_type,planned_duration_min,planned_duration_max on public.planned_training_sessions for each row execute function training_reconciliation.on_arrival();
create trigger reconcile_fit_completion after insert or update of processing_status,session_id on public.wearable_activity_imports for each row execute function training_reconciliation.on_arrival();

create function public.rollback_training_reconciliation_v1(p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ev public.training_reconciliation_events%rowtype; actual uuid[]; expected uuid[]; links jsonb;
begin
 select * into ev from public.training_reconciliation_events where id=p_event_id;
 if not found then raise exception 'Unknown event'; end if;
 perform pg_advisory_xact_lock(hashtextextended('training-reconciliation:'||ev.user_id::text,0));
 select * into ev from public.training_reconciliation_events where id=p_event_id for update;
 if ev.rolled_back_at is not null then return jsonb_build_object('already_rolled_back',true); end if;
 if ev.plan_id is not null then
   with restored as (
     update public.planned_training_sessions
       set linked_completed_session_id=(ev.before_state->>'linked_completed_session_id')::uuid
       where id=ev.plan_id and user_id=ev.user_id and linked_completed_session_id=ev.session_id
       returning id
   ) select coalesce(array_agg(id),'{}'::uuid[]) into actual from restored;
   if actual <> array[ev.plan_id] then raise exception 'Plan changed since reconciliation'; end if;
 else
   -- Compare and delete atomically. Any later mismatch raises and rolls back ALL deletes.
   select coalesce(array_agg((x->>'id')::uuid order by (x->>'id')::uuid),'{}'::uuid[]) into expected
     from jsonb_array_elements(coalesce(nullif(ev.after_state->'exercises','null'::jsonb),'[]')) x;
   with removed as (
     delete from public.session_exercises e where exists (
       select 1 from jsonb_array_elements(coalesce(nullif(ev.after_state->'exercises','null'::jsonb),'[]')) x
       where e.id=(x->>'id')::uuid and to_jsonb(e)=x
     ) returning e.id
   ) select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from removed;
   if actual <> expected then raise exception 'Semantics changed since reconciliation'; end if;

   select coalesce(array_agg((x->>'id')::uuid order by (x->>'id')::uuid),'{}'::uuid[]) into expected
     from jsonb_array_elements(ev.after_state->'blocks') x;
   with removed as (
     delete from public.session_blocks b where exists (
       select 1 from jsonb_array_elements(ev.after_state->'blocks') x
       where b.id=(x->>'id')::uuid and to_jsonb(b)=x
     ) and not exists(select 1 from public.session_exercises e where e.block_id=b.id)
     returning b.id
   ) select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from removed;
   if actual <> expected then raise exception 'Semantics changed since reconciliation'; end if;

   with removed as (
     delete from public.session_source_links l
       where l.session_id=ev.session_id and l.source_id=ev.source_id
         and to_jsonb(l)-'created_at'=ev.after_state->'link'
       returning l.session_id,l.source_id
   ) select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into links from removed r;
   if links <> jsonb_build_array(jsonb_build_object('session_id',ev.session_id,'source_id',ev.source_id))
     then raise exception 'Source link changed since reconciliation'; end if;
 end if;
 update public.training_reconciliation_events set rolled_back_at=now() where id=ev.id;
 return jsonb_build_object('rolled_back',true,'event_id',ev.id);
end $$;
revoke all on function public.rollback_training_reconciliation_v1(uuid) from public,anon,authenticated;
grant execute on function public.rollback_training_reconciliation_v1(uuid) to service_role;
revoke execute on all functions in schema training_reconciliation from public,anon,authenticated;

-- Narrow authenticated entry for the existing explicit session-detail capture.
-- A description cannot create another physical session or choose a tenant.
create function public.capture_training_semantics_v1(p_session_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.training_sessions%rowtype; fit public.training_sources%rowtype; source uuid; envelope jsonb; fingerprint text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into s from public.training_sessions where id=p_session_id and user_id=auth.uid();
 if not found then raise exception 'Owned session required'; end if;
 select * into fit from public.training_sources where id=s.source_id and user_id=auth.uid() and source_type='garmin_fit';
 if not found then raise exception 'Explicit canonical FIT session required'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>262144 then raise exception 'Invalid semantic payload'; end if;
 envelope:=p_payload||jsonb_build_object(
   'capture_payload',p_payload,
   'session_date',(s.started_at at time zone (select timezone from public.profiles where id=auth.uid()))::date,
   'garmin_matching_hint',jsonb_build_object(
     'activity_id',substring(fit.original_json->>'innerFitName' from '^([0-9]+)_ACTIVITY[.]fit$'),
     'start_time_local',to_char(s.started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
     'duration_s',s.duration_seconds,
     'activity_type',case when s.session_structure#>>'{garmin_fit_summary,sub_sport}' in ('strength_training','yoga','pilates') then s.session_structure#>>'{garmin_fit_summary,sub_sport}' else s.session_structure#>>'{garmin_fit_summary,sport}' end));
 fingerprint:='semantic-v1:'||md5(auth.uid()::text||p_session_id::text||p_payload::text);
 insert into public.training_sources(user_id,source_type,source_name,source_system,source_version,original_json,file_checksum,provenance)
 values(auth.uid(),'manual_entry','Descripción del entrenamiento','enqidu_coach','reconciliation_v1',envelope,fingerprint,jsonb_build_object('explicit_session_id',p_session_id,'fused_session_id',p_session_id,'channel','authenticated_session_capture'))
 on conflict(user_id,file_checksum) do nothing returning id into source;
 if source is null then
   select id into source from public.training_sources where user_id=auth.uid() and file_checksum=fingerprint and original_json=envelope;
   if source is null then raise exception 'Conflicting capture identity'; end if;
 end if;
 return jsonb_build_object('source_id',source,'session_id',p_session_id,'reconciled',exists(select 1 from public.session_source_links where session_id=p_session_id and source_id=source));
end $$;
revoke all on function public.capture_training_semantics_v1(uuid,jsonb) from public,anon;
grant execute on function public.capture_training_semantics_v1(uuid,jsonb) to authenticated;

-- Retire bypasses from API roles once the canonical entry exists. Keep definitions
-- for forensic history; neither legacy RPC may create/replace a physical session.
do $$
begin
 if to_regprocedure('public.chatgpt_pilot_apply_capture(jsonb)') is not null then
   revoke execute on function public.chatgpt_pilot_apply_capture(jsonb) from public,anon,authenticated,service_role;
 end if;
 if to_regprocedure('public.persist_conversation_enrichment(uuid,jsonb,jsonb)') is not null then
   revoke execute on function public.persist_conversation_enrichment(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
 end if;
end $$;

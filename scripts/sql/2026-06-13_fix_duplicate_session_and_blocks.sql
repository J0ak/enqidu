-- ENQIDU production repair for the 2026-06-13 duplicate session incident.
-- Run in Supabase SQL Editor for project rdduqsziboqxlgeqouxq.
-- Guarded and transactional: it aborts unless the good session exists and is completed.

-- Part A: verification before changes.
select id, title, local_date, duration_seconds, session_status, session_kind, data_quality_status
from public.training_sessions
where id in (
  '2af770fa-b21f-4847-91aa-19a5e75642b8',
  '404886e4-1de6-42b6-a712-df22d82b9471'
)
order by local_date, title;

select id, block_order, name, block_type, prescription
from public.session_blocks
where session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
order by block_order;

select block_id, exercise_order, reported_name, execution_type, sets_completed, rounds_completed, reps_per_set, duration_seconds, load_value, load_unit, side, notes
from public.session_exercises
where session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
order by block_id, exercise_order;

begin;

do $$
begin
  if exists (
    select 1
    from public.training_sessions
    where id = '404886e4-1de6-42b6-a712-df22d82b9471'
      and session_status = 'completed'
  ) then
    raise notice 'Good session exists and is completed.';
  else
    raise exception 'Abort: good session missing or not completed.';
  end if;
end $$;

-- Part C: insert only missing block orders for the good session.
with desired_blocks (
  session_id, block_order, name, block_type,
  duration_seconds, active_seconds, rest_seconds, heart_rate_avg_bpm, heart_rate_max_bpm,
  temporal_metrics_source, temporal_metrics_confidence, prescription, data_confidence
) as (
  values
('404886e4-1de6-42b6-a712-df22d82b9471'::uuid, 1, 'Calentamiento', 'mobility', null::integer, null::integer, null::integer, null::integer, null::integer, 'fit_unavailable_or_unmapped', 'unknown', '{"format":"warmup","exercises":[{"name":"Cat-Cow"},{"name":"Bird Dog","sets_completed":2,"reps_per_side":6,"side":"each_side"},{"name":"Dead Bug","sets_completed":2,"reps_per_side":6,"side":"each_side"},{"name":"Sentadilla profunda asistida","sets_completed":2,"duration_seconds":45},{"name":"Buenos días barra vacía","sets_completed":2,"reps_per_set":10,"load_value":20,"load_unit":"kg"},{"name":"Puente glúteo","sets_completed":2,"reps_per_set":12},{"name":"3 rondas suaves","notes":"10 air squats, 8 push-ups, 20 jumping jacks. Confirmado: jumping jacks, no comba."}],"coach_interpretation":["Activación progresiva y control lumbar antes del trabajo de fuerza."]}'::jsonb, 'manual'),
('404886e4-1de6-42b6-a712-df22d82b9471'::uuid, 2, 'Fuerza técnica', 'strength', null::integer, null::integer, null::integer, null::integer, null::integer, 'fit_unavailable_or_unmapped', 'unknown', '{"format":"strength_technical","exercises":[{"name":"Front squat","sets_completed":5,"reps_per_set":[8,5,5,5,5],"loads":[{"load_value":20,"load_unit":"kg","reps":8},{"load_value":40,"load_unit":"kg","reps":5},{"load_value":50,"load_unit":"kg","reps":5},{"load_value":53,"load_unit":"kg","reps":5},{"load_value":55,"load_unit":"kg","reps":5}]},{"name":"Landmine press","sets_completed":4,"reps_per_side":8,"side":"each_side","load_value":30,"load_unit":"kg","notes":"30 kg total"},{"name":"Ring row","sets_completed":4,"reps_per_set":8,"notes":"full strict"}],"coach_interpretation":["Bloque principal de fuerza con progresión técnica y tracción estricta."]}'::jsonb, 'manual'),
('404886e4-1de6-42b6-a712-df22d82b9471'::uuid, 3, 'EMOM híbrido controlado', 'conditioning', null::integer, null::integer, null::integer, null::integer, null::integer, 'fit_unavailable_or_unmapped', 'unknown', '{"format":"emom_controlado","exercises":[{"name":"Wall ball","reps_per_set":10,"load_value":18,"load_unit":"lb","notes":"10 reps/ronda"},{"name":"Push-up","reps_per_set":8,"notes":"8 reps/ronda"},{"name":"Step-ups","duration_seconds":60,"notes":"Sustituyen a comba; 1 minuto entero/ronda; por tiempo, no reps"},{"name":"Ring row","reps_per_set":8,"notes":"8 reps/ronda, full strict"}],"coach_interpretation":["Densidad híbrida controlada sin usar comba; step-ups por tiempo."]}'::jsonb, 'manual'),
('404886e4-1de6-42b6-a712-df22d82b9471'::uuid, 4, 'Core anti-lumbar', 'skill', null::integer, null::integer, null::integer, null::integer, null::integer, 'fit_unavailable_or_unmapped', 'unknown', '{"format":"core","sets_completed":2,"exercises":[{"name":"Pallof press goma azul claro","sets_completed":2,"reps_per_side":8,"side":"each_side"},{"name":"Side plank","sets_completed":2,"duration_seconds":35,"side":"each_side","notes":"35 s aprox/lado"},{"name":"Dead bug","sets_completed":2,"reps_per_side":6,"side":"each_side"}],"coach_interpretation":["Trabajo anti-rotación y anti-extensión para proteger zona lumbar."]}'::jsonb, 'manual'),
('404886e4-1de6-42b6-a712-df22d82b9471'::uuid, 5, 'Vuelta a la calma', 'recovery', null::integer, null::integer, null::integer, null::integer, null::integer, 'fit_unavailable_or_unmapped', 'unknown', '{"format":"cooldown","exercises":[{"name":"Respiración 90/90"},{"name":"Flexor de cadera"},{"name":"Glúteo/piriforme suave"},{"name":"Foam roller suave"}],"coach_interpretation":["Bajada parasimpática y descarga suave posterior al bloque híbrido."]}'::jsonb, 'manual')
)
insert into public.session_blocks (
  session_id, block_order, name, block_type,
  duration_seconds, active_seconds, rest_seconds, heart_rate_avg_bpm, heart_rate_max_bpm,
  temporal_metrics_source, temporal_metrics_confidence, prescription, data_confidence
)
select desired.*
from desired_blocks desired
where not exists (
  select 1
  from public.session_blocks existing
  where existing.session_id = desired.session_id
    and existing.block_order = desired.block_order
);

-- Part B: delete only the known bad duplicate and related child rows.
delete from public.enkidu_ai_usage_estimates where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.enkidu_conversation_enrichments where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.session_exercises where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.session_blocks where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.session_laps where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.session_samples where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.session_source_links where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.fit_message_payloads where session_id = '2af770fa-b21f-4847-91aa-19a5e75642b8';
delete from public.training_sessions
where id = '2af770fa-b21f-4847-91aa-19a5e75642b8'
  and title = 'Reentrada controlada fuerza + híbrido';

commit;

-- Part A: verification after changes.
select id, title, local_date, duration_seconds, session_status, session_kind, data_quality_status
from public.training_sessions
where id in (
  '2af770fa-b21f-4847-91aa-19a5e75642b8',
  '404886e4-1de6-42b6-a712-df22d82b9471'
)
order by local_date, title;

select id, block_order, name, block_type, prescription
from public.session_blocks
where session_id = '404886e4-1de6-42b6-a712-df22d82b9471'
order by block_order;

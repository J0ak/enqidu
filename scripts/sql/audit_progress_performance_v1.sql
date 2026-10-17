-- READ ONLY. No raw payloads, user identities or data corrections.
begin read only;
select count(*) exercises, count(load_value) loads, count(load_unit) units,
 count(reps_per_set) reps_sql_non_null, count(sets_completed) sets,
 count(rounds_completed) rounds, count(exercise_id) catalog_ids
from public.session_exercises;
select load_unit, jsonb_typeof(reps_per_set) reps_type, count(*)
from public.session_exercises group by 1,2 order by 1,2;
select session_status, count(*) sessions, count(duration_seconds) duration,
 count(distance_meters) distance, count(elevation_gain_meters) elevation,
 min(local_date),max(local_date)
from public.training_sessions group by 1;
select status,count(*) plans,count(linked_completed_session_id) links
from public.planned_training_sessions group by 1;
select m.code,count(*) sessions from public.training_sessions s
left join public.sport_modalities m on m.id=s.modality_id group by 1;
select local_date,title,
 (select count(*) from public.session_blocks b where b.session_id=s.id) blocks,
 (select count(*) from public.session_exercises e where e.session_id=s.id) exercises,
 (select count(*) from public.session_source_links l where l.session_id=s.id) sources
from public.training_sessions s where local_date in ('2026-07-21','2026-10-07','2026-10-14','2026-10-15')
order by local_date,title;
rollback;

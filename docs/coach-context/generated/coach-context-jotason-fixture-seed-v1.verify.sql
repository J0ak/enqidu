-- ENQIDU Coach Context Jotason fixture seed v1 verification.
-- SELECT-only verification; safe to run after seed.

select 'coach_athlete_profiles' as table_name, count(*)::bigint as row_count from public.coach_athlete_profiles where fixture_user = 'jotason'
union all
select 'coach_athlete_training_goals' as table_name, count(*)::bigint as row_count from public.coach_athlete_training_goals where fixture_user = 'jotason'
union all
select 'coach_athlete_constraints' as table_name, count(*)::bigint as row_count from public.coach_athlete_constraints where fixture_user = 'jotason'
union all
select 'coach_equipment_locations' as table_name, count(*)::bigint as row_count from public.coach_equipment_locations where fixture_user = 'jotason'
union all
select 'coach_equipment_items' as table_name, count(*)::bigint as row_count from public.coach_equipment_items where fixture_user = 'jotason'
union all
select 'coach_context_sources' as table_name, count(*)::bigint as row_count from public.coach_context_sources where fixture_user = 'jotason'
union all
select 'coach_context_snapshots' as table_name, count(*)::bigint as row_count from public.coach_context_snapshots where fixture_user = 'jotason'
union all
select 'coach_session_fixtures' as table_name, count(*)::bigint as row_count from public.coach_session_fixtures where fixture_user = 'jotason'
union all
select 'coach_session_blocks' as table_name, count(*)::bigint as row_count from public.coach_session_blocks where fixture_user = 'jotason'
union all
select 'coach_session_exercises' as table_name, count(*)::bigint as row_count from public.coach_session_exercises where fixture_user = 'jotason'
union all
select 'coach_seed_runs' as table_name, count(*)::bigint as row_count from public.coach_seed_runs where fixture_user = 'jotason' or seed_key = 'coach_context_jotason_fixture_v1';

select 'fixture_rows_with_user_id' as check_name, count(*)::bigint as issue_count from (
  select user_id from public.coach_athlete_profiles where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_athlete_training_goals where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_athlete_constraints where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_equipment_locations where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_equipment_items where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_context_sources where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_context_snapshots where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_session_fixtures where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_session_blocks where fixture_user = 'jotason' and user_id is not null
  union all select user_id from public.coach_session_exercises where fixture_user = 'jotason' and user_id is not null
) rows;

select 'duplicate_source_keys' as check_name, count(*)::bigint as issue_count from (
  select 'coach_athlete_profiles' as table_name, source_key from public.coach_athlete_profiles where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_athlete_training_goals', source_key from public.coach_athlete_training_goals where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_athlete_constraints', source_key from public.coach_athlete_constraints where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_equipment_locations', source_key from public.coach_equipment_locations where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_equipment_items', source_key from public.coach_equipment_items where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_context_sources', source_key from public.coach_context_sources where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_context_snapshots', source_key from public.coach_context_snapshots where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_session_fixtures', source_key from public.coach_session_fixtures where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_session_blocks', source_key from public.coach_session_blocks where fixture_user = 'jotason' group by source_key having count(*) > 1
  union all select 'coach_session_exercises', source_key from public.coach_session_exercises where fixture_user = 'jotason' group by source_key having count(*) > 1
) duplicates;

select 'orphan_relationships' as check_name, count(*)::bigint as issue_count from (
  select g.id from public.coach_athlete_training_goals g left join public.coach_athlete_profiles p on p.id = g.athlete_profile_id where g.fixture_user = 'jotason' and p.id is null
  union all select c.id from public.coach_athlete_constraints c left join public.coach_athlete_profiles p on p.id = c.athlete_profile_id where c.fixture_user = 'jotason' and p.id is null
  union all select i.id from public.coach_equipment_items i left join public.coach_equipment_locations l on l.id = i.equipment_location_id left join public.coach_athlete_profiles p on p.id = i.athlete_profile_id where i.fixture_user = 'jotason' and (l.id is null or p.id is null)
  union all select b.id from public.coach_session_blocks b left join public.coach_session_fixtures s on s.id = b.session_fixture_id where b.fixture_user = 'jotason' and s.id is null
  union all select e.id from public.coach_session_exercises e left join public.coach_session_fixtures s on s.id = e.session_fixture_id where e.fixture_user = 'jotason' and s.id is null
) orphaned;

select 'garmin_fit_untouched' as check_name, 'documented_local_guard' as result;

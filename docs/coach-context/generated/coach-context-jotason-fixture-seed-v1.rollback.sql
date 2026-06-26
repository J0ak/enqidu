-- ENQIDU Coach Context Jotason fixture seed v1 rollback.
-- Deletes only fixture rows owned by fixture_user = 'jotason' or this seed key.
begin;
delete from public.coach_session_exercises where fixture_user = 'jotason';
delete from public.coach_session_blocks where fixture_user = 'jotason';
delete from public.coach_session_fixtures where fixture_user = 'jotason';
delete from public.coach_context_snapshots where fixture_user = 'jotason';
delete from public.coach_context_sources where fixture_user = 'jotason';
delete from public.coach_equipment_items where fixture_user = 'jotason';
delete from public.coach_equipment_locations where fixture_user = 'jotason';
delete from public.coach_athlete_constraints where fixture_user = 'jotason';
delete from public.coach_athlete_training_goals where fixture_user = 'jotason';
delete from public.coach_seed_runs where seed_key = 'coach_context_jotason_fixture_v1' or fixture_user = 'jotason';
delete from public.coach_athlete_profiles where fixture_user = 'jotason';
commit;

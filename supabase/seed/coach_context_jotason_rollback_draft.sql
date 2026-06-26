-- DRAFT ONLY - DO NOT APPLY AUTOMATICALLY
-- Rollback sketch for Coach Context Jotason fixture seed.
-- Review target environment, backups, and exact seed run before applying.

begin;

-- Fixture-only rollback sketch. Keep Garmin/FIT and planned/executed tables out
-- of scope. This assumes a future approved seed recorded fixture_user and
-- source_key consistently.

delete from public.coach_session_exercises
where fixture_user = 'jotason';

delete from public.coach_session_blocks
where fixture_user = 'jotason';

delete from public.coach_session_fixtures
where fixture_user = 'jotason';

delete from public.coach_context_snapshots
where fixture_user = 'jotason';

delete from public.coach_context_sources
where fixture_user = 'jotason';

delete from public.coach_equipment_items
where fixture_user = 'jotason';

delete from public.coach_equipment_locations
where fixture_user = 'jotason';

delete from public.coach_athlete_constraints
where fixture_user = 'jotason';

delete from public.coach_athlete_training_goals
where fixture_user = 'jotason';

delete from public.coach_athlete_profiles
where fixture_user = 'jotason';

update public.coach_seed_runs
set mode = 'rolled_back',
    status = 'success',
    result_summary = jsonb_build_object('fixture_user', 'jotason', 'rollback', 'draft_sketch')
where fixture_user = 'jotason'
  and seed_key = 'jotason:seed_run:dry_run:v0';

rollback;


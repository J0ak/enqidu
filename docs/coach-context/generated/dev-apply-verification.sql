-- VERIFICATION ONLY - SAFE SELECTS ONLY
-- Does not modify data.
-- Run only after applying the Coach Context schema migration in Supabase dev.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'coach_%'
order by table_name;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename;

select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename, policyname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename, indexname;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name like 'coach_%'
  and column_name in ('user_id', 'fixture_user', 'source_key', 'source_traceability', 'data_quality')
order by table_name, column_name;

select 'coach_athlete_profiles' as table_name, count(*) as rows from public.coach_athlete_profiles
union all select 'coach_athlete_training_goals' as table_name, count(*) as rows from public.coach_athlete_training_goals
union all select 'coach_athlete_constraints' as table_name, count(*) as rows from public.coach_athlete_constraints
union all select 'coach_equipment_locations' as table_name, count(*) as rows from public.coach_equipment_locations
union all select 'coach_equipment_items' as table_name, count(*) as rows from public.coach_equipment_items
union all select 'coach_context_sources' as table_name, count(*) as rows from public.coach_context_sources
union all select 'coach_context_snapshots' as table_name, count(*) as rows from public.coach_context_snapshots
union all select 'coach_session_fixtures' as table_name, count(*) as rows from public.coach_session_fixtures
union all select 'coach_session_blocks' as table_name, count(*) as rows from public.coach_session_blocks
union all select 'coach_session_exercises' as table_name, count(*) as rows from public.coach_session_exercises
union all select 'coach_seed_runs' as table_name, count(*) as rows from public.coach_seed_runs
order by table_name;

select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and tablename like 'coach_%'
  and cmd = 'SELECT'
  and coalesce(qual, '') ilike '%fixture_user%';

select table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name = 'training_sessions'
    or table_name ilike '%garmin%'
    or table_name ilike '%fit%'
  )
order by table_name;

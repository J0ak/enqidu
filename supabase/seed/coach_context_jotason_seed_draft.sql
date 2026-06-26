-- DRAFT ONLY - DO NOT APPLY AUTOMATICALLY
-- Generated/curated from docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json
-- This file is not executed automatically.
-- Review RLS, target environment and rollback before applying.

-- Purpose:
--   Provide a human-reviewable sketch for inserting the Jotason Coach Context
--   fixture after the schema migration has been reviewed and applied in a dev
--   environment.
--
-- Safety:
--   - Do not run this in production.
--   - Do not run before reviewing RLS.
--   - Do not map fixture_user = 'jotason' to a real user_id without explicit
--     approval.
--   - Do not mix these rows with Garmin/FIT training_sessions.

begin;

-- Example only. Prefer the generated draft file for a fuller SQL sketch:
-- supabase/seed/coach_context_jotason_seed.generated.sql

insert into public.coach_athlete_profiles (
  fixture_user,
  display_name,
  profile_type,
  product,
  source_key,
  source_traceability,
  data_quality
)
values (
  'jotason',
  'Jotason',
  'fixture',
  'ENQIDU',
  'jotason:athlete_profile',
  jsonb_build_object(
    'normalized_file', 'docs/coach-context/normalized/jotason/athlete-context.normalized.json',
    'fixture_user', 'jotason',
    'mode', 'draft'
  ),
  jsonb_build_object('warnings', jsonb_build_array('fixture_user_not_live_auth_user'))
)
on conflict do nothing;

insert into public.coach_seed_runs (
  seed_key,
  mode,
  fixture_user,
  status,
  input_plan,
  result_summary,
  warnings
)
values (
  'jotason:seed_run:dry_run:v0',
  'dry_run',
  'jotason',
  'draft',
  jsonb_build_object(
    'source', 'docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json'
  ),
  jsonb_build_object('writes_to_database', false),
  jsonb_build_array('draft_only_not_applied')
)
on conflict (seed_key) do nothing;

rollback;


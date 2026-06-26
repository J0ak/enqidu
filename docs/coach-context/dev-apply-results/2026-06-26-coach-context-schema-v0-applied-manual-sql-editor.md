# Coach Context Schema v0 - Applied Manually via SQL Editor

## Summary

- Date: 2026-06-26
- Supabase project: Enqidu
- Supabase project ref: `rdduqsziboqxlgeqouxq`
- Application method: manual SQL Editor execution
- Migration applied: yes
- Environment confirmed dev/current Enqidu project: yes, confirmed by user
- Seed executed: no
- Supabase writes: migration only
- Verification SQL executed: yes
- Verification SQL executed against Supabase: yes
- Garmin/FIT untouched: yes

## Result

The Coach Context schema v0 was applied manually from the Supabase SQL Editor
after Supabase Branching was unavailable for this project plan.

Remote read-only verification confirmed:

- `coach_tables_count = 11`
- `rls_enabled_count = 11`
- `trigger_count = 11`
- `policy_count = 31`
- `jotason_fixture_rows = 0`

The expected `coach_*` tables are present and empty before fixture seed:

- `coach_athlete_constraints`
- `coach_athlete_profiles`
- `coach_athlete_training_goals`
- `coach_context_snapshots`
- `coach_context_sources`
- `coach_equipment_items`
- `coach_equipment_locations`
- `coach_seed_runs`
- `coach_session_blocks`
- `coach_session_exercises`
- `coach_session_fixtures`

## Migration History Note

Because the schema was applied manually through SQL Editor, Supabase CLI
migration history may not record
`supabase/migrations/20260626123654_coach_context_schema_v0.sql` as applied.
Do not manually edit Supabase migration history tables unless a separate,
specific migration-history reconciliation is reviewed.

## Safety

- Seed executed: no
- UI touched: no
- `src/main.jsx` touched: no
- Edge Functions touched: no
- Existing non-`coach_*` tables touched: no
- Garmin/FIT import touched: no
- Garmin/FIT untouched: yes

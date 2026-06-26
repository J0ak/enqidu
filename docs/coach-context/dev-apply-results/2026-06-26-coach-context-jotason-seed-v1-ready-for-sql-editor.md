# Coach Context Jotason Fixture Seed v1 - Ready for SQL Editor

## Summary

- Date: 2026-06-26
- Supabase project: Enqidu
- Supabase project ref: `rdduqsziboqxlgeqouxq`
- Seed executed: no
- Supabase writes: none
- Verification SQL executed: no
- Verification SQL executed against Supabase: no
- Garmin/FIT untouched: yes

## Reason

The Supabase connector was available for read-only verification and confirmed
that the Coach Context schema exists with empty `coach_*` tables. The generated
fixture seed is a large SQL artifact intended to be run exactly as reviewed.
To avoid partial or manually chunked writes through the connector, this PR
leaves a single SQL Editor-ready seed file plus SELECT-only verification and
fixture-only rollback files.

## Generated Files

- Seed:
  `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.sql`
- Verify:
  `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.verify.sql`
- Rollback:
  `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.rollback.sql`

## Expected Seed Scope

- `fixture_user = 'jotason'`
- `user_id = null`
- `profile_type = 'fixture'`
- `seed_key = 'coach_context_jotason_fixture_v1'`
- Upserts only into `coach_*` tables
- Rollback deletes only fixture rows for `jotason` or the seed key

## Expected Planned Rows

- `coach_athlete_profiles`: 1
- `coach_athlete_training_goals`: 1
- `coach_athlete_constraints`: 1
- `coach_equipment_locations`: 1
- `coach_equipment_items`: 32
- `coach_context_sources`: 40
- `coach_context_snapshots`: 1
- `coach_session_fixtures`: 16
- `coach_session_blocks`: 12
- `coach_session_exercises`: 37
- `coach_seed_runs`: 1

## Next Step

Run the seed SQL in Supabase SQL Editor, then run the verify SQL. Do not run
the rollback unless the fixture seed result is wrong and the rollback has been
reviewed for the current project state.

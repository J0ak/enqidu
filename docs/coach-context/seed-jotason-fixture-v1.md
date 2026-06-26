# Jotason Fixture Seed v1

This phase prepares an idempotent fixture seed for the Coach Context `coach_*`
tables.

## Inputs

- `docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json`
- `docs/coach-context/normalized/jotason/`
- `docs/coach-context/references/jotason/`
- `docs/coach-context/fixtures/jotason/`

No external memory or invented sessions are used.

## Generated Artifacts

- `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.sql`
- `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.verify.sql`
- `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.rollback.sql`

## Rules

- Fixture rows use `fixture_user = 'jotason'`.
- Fixture rows keep `user_id = null`.
- The profile uses `profile_type = 'fixture'`.
- Stable `source_key` values drive idempotent upserts.
- The seed key is `coach_context_jotason_fixture_v1`.
- Rollback is limited to fixture rows for `jotason` and the seed key.
- No Garmin/FIT table is read or written by the seed.

## Status

Schema v0 has been applied manually through Supabase SQL Editor and verified by
read-only checks. The fixture seed is ready for SQL Editor execution, but this
PR does not execute it remotely.

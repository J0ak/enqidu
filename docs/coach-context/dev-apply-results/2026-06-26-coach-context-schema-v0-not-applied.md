# Coach Context Schema v0 - Dev Apply Result

## Summary

- Migration applied: no
- Environment: unknown / stopped
- Seed executed: no
- Supabase writes: none
- Verification SQL executed: no

## Applied migration

- Target migration: `supabase/migrations/20260626123654_coach_context_schema_v0.sql`
- Applied migration: none

## Context

- Date/time: 2026-06-26T14:13:06+02:00
- Branch: `coach-context-supabase-dev-apply-result-v0`
- Base commit: `d389ad0abf1eb022fbd4ba827942b90bcd1fd952`
- Local gate branch source: `main`

## Environment detection

- `supabase --version`: unavailable; Supabase CLI was not found in PATH.
- `supabase status`: not executed successfully because Supabase CLI was not found.
- `supabase projects list`: not executed successfully because Supabase CLI was not found.
- Supabase project detected: unknown
- Dev confirmation: not confirmed
- Production exclusion: not confirmed
- Backup/snapshot confirmation: not confirmed

## Preflight

- `npm run coach:supabase:dev-preflight`: passed
- `npm run coach:supabase:dev-verify-sql`: passed locally and regenerated
  `docs/coach-context/generated/dev-apply-verification.sql`
- `npm test`: passed, 85/85
- `npm run build`: passed
- `npm run lint`: not available in `package.json`

## Verification

- Verification SQL file: `docs/coach-context/generated/dev-apply-verification.sql`
- Verification SQL executed against Supabase: no
- coach_ tables: not verified remotely
- RLS: not verified remotely
- policies: not verified remotely
- indexes: not verified remotely
- critical columns: not verified remotely
- updated_at function/triggers: not verified remotely
- empty tables before seed: not verified remotely
- Garmin/FIT untouched: yes; no migration was applied and no Supabase write was performed

## Runtime surfaces

- UI untouched: yes
- `src/main.jsx` untouched: yes
- Edge Functions untouched: yes
- import Garmin/FIT untouched: yes

## Issues

- Supabase CLI was not available in the execution environment.
- The target Supabase project could not be identified.
- Dev/no-production confirmation could not be made.
- Because the environment was not unequivocally confirmed as dev, the migration
  was not applied.

## Decision

- Not ready for seed dry-run.
- Blocked until a human confirms a Supabase dev project and provides an
  available Supabase CLI/session outside the repository.

## Next step

Prepare the Supabase dev environment, confirm the project is not production,
confirm backup/snapshot availability, then rerun the dev apply runbook.

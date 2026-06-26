# Coach Context Schema v0 - Dev Apply Attempt

## Summary

- Migration applied: no
- Environment confirmed dev: no
- Seed executed: no
- Supabase writes: none
- Verification SQL executed: no

## Environment

- Supabase CLI available: no
- Project dev confirmed: no
- Production excluded: no
- Date/time: 2026-06-26T14:24:07+02:00
- Operator: Codex local workspace

## Migration

- Target migration: `supabase/migrations/20260626123654_coach_context_schema_v0.sql`
- Applied migration: none

## Local readiness

- `npm run coach:supabase:dev-preflight`: passed
- `npm run coach:supabase:dev-verify-sql`: passed locally
- `npm test`: passed locally
- `npm run build`: passed locally
- `npm run lint`: not available in `package.json`

## Verification

- Verification SQL file: `docs/coach-context/generated/dev-apply-verification.sql`
- Verification SQL executed against Supabase: no
- tables: not verified remotely
- RLS: not verified remotely
- policies: not verified remotely
- indexes: not verified remotely
- columns: not verified remotely
- updated_at function/triggers: not verified remotely
- empty before seed: not verified remotely
- Garmin/FIT untouched: yes

## Runtime surfaces

- UI untouched: yes
- `src/main.jsx` untouched: yes
- Edge Functions untouched: yes
- import Garmin/FIT untouched: yes

## Issues

- `supabase --version` failed because Supabase CLI is not available in PATH.
- Project dev could not be confirmed.
- Production could not be explicitly excluded from this environment.
- No Supabase command that writes remotely was executed.

## Next step

Fix CLI/dev environment outside repo, confirm project dev and backup/snapshot,
then rerun the Coach Context dev apply runbook.

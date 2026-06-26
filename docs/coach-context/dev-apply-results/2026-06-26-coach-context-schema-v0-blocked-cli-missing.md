# Coach Context Schema v0 - Dev Apply Blocked: Supabase CLI Missing

## Summary

- Migration applied: no
- Environment confirmed dev: no
- Production excluded: no
- Backup/snapshot confirmed: no
- Seed executed: no
- Supabase writes: none
- Verification SQL executed against Supabase: no
- Local verification generated: yes

## Blocker

Supabase CLI is not available in PATH.

## Safety

- No migration applied.
- No seed executed.
- No Supabase writes.
- No UI touched.
- No `src/main.jsx` touched.
- No Edge Functions touched.
- No Garmin/FIT import touched.
- Garmin/FIT untouched: yes

## Local validation

- `npm run coach:normalize`: passed
- `npm run coach:inspect`: passed
- `npm run coach:supabase:inspect`: passed
- `npm run coach:supabase:plan`: passed
- `npm run coach:supabase:seed-sql`: passed locally; seed was not executed
- `npm run coach:supabase:dev-preflight`: passed
- `npm run coach:supabase:dev-verify-sql`: passed locally
- `npm test`: passed locally
- `npm run build`: passed locally
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
- empty before seed: not verified remotely
- fixtures hidden from final users: not verified remotely
- Garmin/FIT untouched: yes

## Next step

Install or configure Supabase CLI outside the repo, authenticate outside the
repo, confirm the dev project, confirm backup/snapshot, then rerun this runbook.

# Coach Context Schema v0 - Dev Apply Retry Blocked

## Summary

- Migration applied: no
- Environment confirmed dev: no
- Production excluded: no
- Backup/snapshot confirmed: no
- Seed executed: no
- Supabase writes: none
- Verification SQL executed: no
- Verification SQL executed against Supabase: no
- Local verification generated: yes

## Blocker

Supabase CLI is not available in PATH.

## Consequence

The dev project cannot be confirmed, production cannot be excluded from this
environment, and the migration must not be applied.

## Safety

- No migration applied.
- No seed executed.
- No Supabase writes.
- No UI touched.
- No `src/main.jsx` touched.
- No Edge Functions touched.
- No import Garmin/FIT touched.
- Garmin/FIT untouched: yes
- The migration was not applied and no Supabase write was performed.

## Verification

- Verification SQL file: `docs/coach-context/generated/dev-apply-verification.sql`
- coach_ tables: not verified remotely
- RLS: not verified remotely
- policies: not verified remotely
- indexes: not verified remotely
- critical columns: not verified remotely
- updated_at function/triggers: not verified remotely
- empty before seed: not verified remotely
- Garmin/FIT untouched: yes

## Next step

Install or configure Supabase CLI outside the repo, authenticate outside the
repo, confirm the dev project, confirm backup/snapshot, then rerun the dev
apply runbook.

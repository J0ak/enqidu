# Coach Context Ops Next Steps

## Current State

- Coach Context schema v0 is applied manually in Supabase Enqidu.
- Remote read-only verification confirmed 11 `coach_*` tables, RLS, triggers,
  and policies.
- Jotason fixture seed v1 is generated and ready for SQL Editor.
- Loader v1 is prepared locally.
- UI is not wired.
- Garmin/FIT is untouched.

## Next Steps

1. Run `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.sql`
   in Supabase SQL Editor.
2. Run
   `docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.verify.sql`.
3. Record the applied seed result under
   `docs/coach-context/dev-apply-results/`.
4. Decide whether fixture reads should be exposed only through backend code.
5. Add a minimal UI status panel only after the read boundary is reviewed.

## Do Not Do Yet

- Do not run destructive reset commands.
- Do not seed real user data through the fixture seed.
- Do not merge fixture rows into Garmin/FIT views.
- Do not expose fixture rows from public frontend code without a reviewed
  backend boundary.

# Coach Context Ops Next Steps

## Current State

- Coach Context schema v0 is applied manually in Supabase Enqidu.
- Remote read-only verification confirmed 11 `coach_*` tables, RLS, triggers,
  and policies.
- Jotason fixture seed v1 was executed manually through SQL Editor and verified.
- Loader v1 is prepared locally.
- A minimal Coach surface status card is wired through the `coach-context` Edge
  Function.
- Garmin/FIT is untouched.

## Next Steps

1. Exercise the Coach surface against a logged-in session.
2. Confirm whether fixture diagnostic mode should remain available after the
   next real-user Coach Context seed.
3. Prepare user-owned Coach Context writes or a backend-only real-user seed
   flow.
4. Update conversational AI prompts to consume the compact Coach Context DTO
   only after the read boundary is reviewed.

## Do Not Do Yet

- Do not run destructive reset commands.
- Do not seed real user data through the fixture seed.
- Do not merge fixture rows into Garmin/FIT views.
- Do not expose raw fixture rows from public frontend code.

# Playwright E2E with local Supabase

The browser suite is isolated from production. It rebuilds the real migration chain, loads
`supabase/seed.sql`, signs in synthetic users through local Auth, invokes the normal local
Coach Edge Functions with JWT verification, and uses a service-role key only inside the
Node Playwright process to arrange and inspect fixtures.

## Run from a clean local stack

Docker and the Supabase CLI are required.

```bash
supabase start
supabase db reset
supabase status -o env > /tmp/supabase.env
source /tmp/supabase.env
export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
printf 'OPENAI_COACH_ENABLED=false\n' > supabase/.env.e2e
supabase functions serve --env-file supabase/.env.e2e &
npx playwright install chromium
npm run test:e2e
supabase stop --no-backup
```

`playwright@enqidu.local` / `LocalE2E-Only-57!` and all generated scenario users are
public, disposable local test identities. Never point these commands at a linked project;
`supabase db reset --linked` is intentionally not part of the workflow.

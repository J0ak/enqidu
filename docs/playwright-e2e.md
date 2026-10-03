# Playwright E2E with isolated local Supabase

The browser suite never rebuilds or mutates the production migration tree. ENQIDU's live
Supabase project has older historical migrations that are not present in this repository,
so E2E uses a deliberately isolated local Supabase project under `e2e-local/`.

Its migrations model only the current deterministic Coach contracts exercised by Playwright.
Synthetic users and scenario data are created through the local Auth/Admin and REST APIs
from the Node test process. The local service-role key is never exposed to Vite/browser code.

## Run from a clean local stack

Docker and the Supabase CLI are required.

```bash
rm -rf e2e-local/supabase/functions e2e-local/src
cp -R supabase/functions e2e-local/supabase/functions
cp -R src e2e-local/src

supabase --workdir e2e-local start
supabase --workdir e2e-local db reset
supabase --workdir e2e-local status -o env > /tmp/supabase.env
source /tmp/supabase.env

export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

printf 'OPENAI_COACH_ENABLED=false\n' > e2e-local/supabase/.env.e2e
supabase --workdir e2e-local functions serve --env-file e2e-local/supabase/.env.e2e &

npx playwright install chromium
npm run test:e2e

supabase --workdir e2e-local stop --no-backup
```

Never run these tests against a linked Supabase project and never use production
credentials or production user data. The E2E project is disposable and local-only.

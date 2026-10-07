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
node e2e-local/bootstrap-health-intelligence.mjs
node e2e-local/bootstrap-browser-read-contract.mjs
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

The Health Intelligence suite additionally bootstraps the inspected canonical Health
fixture and reuses the already-existing Health Foundation V1 SQL in the disposable
`supabase_db_enqidu-e2e` container. The bootstrap refuses remote connections, creates
no migration file, and keeps the production migration tree unchanged. It replaces
the old slim local wearable fixture only once per reset, preserving actual Health
constraints, foundation identities, ingestion RPC and owner-read policies.
Run the bootstrap again after every `supabase --workdir e2e-local db reset`.
The existing CI workflow does this immediately after resetting the disposable
database and continues serving the native source/dependency graph normally.

`e2e/health-intelligence.spec.js` exercises canonical ingestion, a personal baseline,
current zero/null observations, stale official Garmin evidence, deterministic Coach
replies, exact FIT/plan matching, confirmed feedback, proposal-only adaptations,
cross-user isolation and unchanged persisted plans/FIT. The browser runs in
America/Los_Angeles while the athlete profile remains Europe/Madrid. The local
service-role key stays in the Node setup process; Vite receives only the anon key.

## Managed environment verification (2026-10-05)

The local suite uses Supabase CLI 2.119.0 and Edge Runtime 1.77.1 with Docker's
local socket. When the managed proxy prevents native graph loading, run
`node e2e-local/prepare-functions.mjs` before `functions serve`. It bundles the unchanged repository Edge source
with the SDK version already locked by the repository, replacing only the runtime
type declaration import with an empty module. Generated bundles remain ignored.
This avoids runtime JSR/npm downloads in environments where the loader cannot trust
the session proxy CA. TLS verification remains enabled; the native remote dependency
graph still needs its ordinary post-merge deployment/smoke verification.

In this managed environment the Docker Auth health probe used the inherited proxy
for its own local URL and returned HTTP 403. Start may use the supported
`--ignore-health-check` option in that case; verify the actual local endpoint with
`curl -fsS http://127.0.0.1:54321/auth/v1/health` before testing. Real registration,
login, JWT/getUser and authenticated endpoints are exercised by Playwright.

Docker proxy defaults can also append duplicate `NO_PROXY` entries after the
functions env file, causing internal Auth/REST calls to route through the proxy.
After `functions serve` is ready, run:

```bash
node e2e-local/configure-runtime-proxy.mjs
```

The guarded script recreates only the disposable `supabase_edge_runtime_enqidu-e2e`
container through `/var/run/docker.sock`. It preserves its entire configuration,
proxy credentials, read-only mounts and the CLI's streamed main service in memory,
deduplicates environment names, adds only local internal services to `NO_PROXY`,
and keeps OpenAI disabled. The original serve supervisor exits; the recreated local
container continues serving the same bundles. Rerun both serve and this script after
preparing changed bundles. No production code, Docker daemon setting or credential
default is changed.

All 21 Playwright tests passed locally on 2026-10-05 after rebuilding the final
source bundles (47.1 seconds), including
the three new Health Intelligence/Security/Closed Loop flows. The ordinary native
dependency graph remains the CI path; it was not locally verified because of the
managed proxy's JSR certificate limitation. The official PostgreSQL 17.11.0.002
image was flattened into one local Docker layer, preserving its filesystem and
runtime configuration, after the managed daemon's `vfs` layer copies exceeded
the available disk. The daemon/storage driver was unchanged.

The Tools/Coach browser suite includes an athlete with executed training. Run
`bootstrap-browser-read-contract.mjs` after reset to reconstruct the existing
Activity-detail read columns and four empty lookup tables omitted from the slim
local baseline. Its provenance is the current `src/main.jsx` read projections and
canonical session service; it cannot accept a remote URL/container and does not
add a product migration. Local owner-read policies apply to the lookup fixtures.
No Garmin/FIT values or history are synthesized by this bootstrap.

## Transactional action acceptance

After both bootstraps above, run `node e2e-local/bootstrap-transactional-actions.mjs`.
It applies the exact single product migration `20261007045422_apply_enqidu_action_v1.sql`
to `supabase_db_enqidu-e2e` through the local Docker socket, without a remote URL
option or a second SQL implementation. Refresh served functions after source changes.

The dedicated real-PostgreSQL suite is invoked in the CI E2E job before Playwright:

```bash
supabase --workdir e2e-local status -o env > /tmp/supabase.env
chmod 600 /tmp/supabase.env
ENQIDU_TRANSACTION_LOCAL=1 ENQIDU_TRANSACTION_ENV_FILE=/tmp/supabase.env npm run test:transactional-actions
```

The environment file stays outside Git. The suite refuses non-loopback database
hosts, URL connection options and missing explicit local opt-in. Pinned `pg`
**8.16.3** is a development-only dependency for independent database connections;
it is not shipped in the browser or Edge and adds no hosted service. A fixed
trusted request clock makes remaining-week cases weekday-independent without
changing the database clock or production function. Real `pg_blocking_pids` and
`pg_locks` barriers determine interleaving, not sleeps. Full rows and `xmin` prove
zero stale writes; disposable evidence is cleaned through the existing service role.

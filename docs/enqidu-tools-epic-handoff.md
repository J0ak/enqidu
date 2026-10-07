# ENQIDU Tools / Preview / MCP V1 — engineering handoff

## Delivery and completion boundary

The reusable vertical is implemented and validated locally: App/Coach/MCP read
the same domain; previews do not write; reviewed acceptance reconstructs state
and calls existing Coach Actions; Closed Loop produces a reviewable 50 → 40 minute
adaptation; subsequent plan reads show the persisted change. MCP defaults to
read/preview and has no remote deployment.

The follow-up on the same PR adds the explicitly authorized minimal database
interface: `apply_enqidu_action_v1` compares expected mutation authority and calls
the existing writer under locks in one transaction. The previous preflight/RPC
TOCTOU window is closed and verified by the real concurrent tests described below.
The precise guarantee is atomic acceptance of the reviewed command and its
mutation authority; observational Health/feedback evidence remains a preflight
snapshot. See [Action Preview V1](enqidu-action-preview-v1.md#transactional-acceptance).

Started from fetched `origin/main` at
`88830df5a4c2523259f0726033499a1c2ab0d46e`; no open PRs were present at audit time.
Branch: `feat/enqidu-tools-preview-mcp-v1`. The Git history separates shared
Tools/Coach, MCP and local E2E/handoff. The atomic follow-up continues PR **#94**
from `0c1cfd791dd3f471af1e783e0e8d3da77c39adc5`; no new PR is opened.
The PR records the final commit SHA.

## Validation evidence

All commands used Node **22.23.3**, no paid calls and no OpenAI key requirement.

| Command | Final result |
| --- | --- |
| `npm run setup:cloud` | PASS; clean dependency install, existing local environment retained |
| `npm test` | **626/626**, 0 skipped |
| `npm run test:coach-evals` | **25/25** |
| `npm run test:tools` | **95/95** |
| `npm run test:mcp` | **32/32** |
| `npm run build` | PASS |
| `npm run test:e2e` | **29/29**, 0 skipped, actual local Supabase/Auth/RLS |
| `npm run test:transactional-actions` | **28/28**, 0 skipped; actual PostgreSQL locks/connections |
| `git diff --check` | PASS |
| Browser verification | Review/apply, stale card cannot retry, old/new transport compatibility; no unexpected browser errors |

The build reports the existing single-bundle size warning (503.90 kB minified,
155.11 kB gzip); it does not fail. No tests were removed or skipped to make the
epic pass. Old source-location assertions were updated to follow the extracted
shared implementation while preserving their ownership/timezone/action guards.

The E2E suite includes 21 Coach UI tests, four Tools integration tests, three
Health intelligence tests and the existing language-lab test. The Tools/Closed
Loop test creates actual Auth athletes, sets Europe/Madrid, ingests canonical
Health with baseline history, persists plan and FIT execution linkage, confirms
RPE, obtains assessment/proposal, previews without mutation, accepts through the
existing RPC, compares exact persisted plan, checks FIT/execution/feedback
unchanged, rereads through Tools and Coach, and verifies real SDK MCP parity.

The action matrix covers the five underlying actions; Closed Loop reuses the
duration action and adds evidence/target revalidation. Tests cover malformed and
unknown requests, foreign identities, missing/ambiguous/completed/skipped/cancelled
targets, calendar/duration/environment bounds, availability, zero preview writes,
stale state and expiry, deterministic repeatability, safe output limits and failed
readback after acknowledged commits. `test:transactional-actions` adds independent
PostgreSQL connections, real held/waiting locks and full-row plus `xmin` comparisons
for zero-write stale rejection. These tests exercise the actual wrapper and existing
writers, not a mock of transactional acceptance.

| Forced concurrent race | Verified result |
| --- | --- |
| A: duration vs cancellation | `preview_stale`; cancelled state and blocks untouched |
| B: two duration applies | First commit wins; second is stale, no silent overwrite |
| C: environment vs cancellation | Stale; no resurrection or block replacement |
| D: move vs newly occupied target | Stale; source and competing target preserved |
| E: move vs changed source date | Stale; no mutation on a substituted source |
| F: remaining week vs availability | Stale; zero partial moves |
| G: remaining week vs changed member | Stale; unchanged batch members remain untouched |
| H: block edit/replacement/insertion | Stale despite unchanged parent revision |

Additional real races cover profile timezone, active constraints, location,
inventory/catalog and an earlier Closed Loop target. A concurrent execution/Health
update can commit independently while the exact accepted duration is preserved.
Tests also prove locks remain held after the nested writer until outer commit,
outer rollback reverts parent and child writes, duplicate acceptance is stale,
non-READ-COMMITTED snapshots cannot bypass comparison, client-role execution is
denied, and 19 hostile DTO variants plus foreign ownership produce zero writes.
The test domain clock is a fixed Monday so the full remaining-week batch runs on
every CI weekday. The database, migration, transactions and locks are real and
unchanged; no database clock replacement or test-only RPC parameter is used.

## Where to review

| Concern | Implementation / documentation |
| --- | --- |
| All 21 tools and schemas | `src/enqiduTools/registry.js`; `npm run tools:manifest` |
| Authenticated context, capabilities, results, telemetry | `src/enqiduTools/runtime.js`, `http.js`, `errors.js` |
| Nine reads and existing canonical algorithms | `src/enqiduTools/readTools.js`, `readSchemas.js` |
| Six previews and six applies | `src/enqiduTools/actions.js`, `actionPreview.js` |
| Atomic compare and existing writer dispatch | `supabase/migrations/20261007045422_apply_enqidu_action_v1.sql` |
| Real concurrency and SQL privilege acceptance | `tests/transactional-actions/` |
| Closed Loop bridge | `resolveClosedLoopAction`, `bindEnqiduActionEvidence` |
| App/Coach review and acceptance | `CoachActionPreview.jsx`, `actionPreviewView.js`, `enqiduToolsService.js`, `coachAdapter.js` |
| MCP and default write gate | `src/mcp/server.js`, `localAuth.js`, `scripts/mcp-local.mjs` |
| Contracts, auth, security, limits | [Tools V1](enqidu-tools-v1.md) |
| Fingerprint, exact preview, stale/race boundary | [Action Preview V1](enqidu-action-preview-v1.md) |
| MCP mapping, SDK, authentication and remote deployment boundary | [MCP V1](enqidu-mcp-v1.md) |
| Local test setup | [Playwright E2E](playwright-e2e.md) |

The six action suffixes are `move_session`, `adapt_duration`, `adapt_environment`,
`cancel_session`, `adapt_remaining_week`, `closed_loop_proposal`, each with
`preview_` and `apply_`. Reads are `get_athlete_context`, `get_today_plan`,
`get_week_plan`, `get_recent_training`, `get_training_session`, `get_health_status`,
`get_readiness`, `get_closed_loop_assessment`, `get_adaptation_proposal`.

## Safety and operational boundaries

- Identity comes only from authenticated `getUser`; profile timezone controls the
  calendar. Tests cover midnight, UTC boundaries, DST 23/25 hours and a Los Angeles
  browser/MCP consumer. The real athlete's configured Europe/Madrid is honored;
  this task did not read or modify production profile data.
- All tools are deterministic and LLM-free. Fixed registry, fixed table/RPC names,
  schema validation, owner-scoped reads, bounded canonical projections and existing
  narrow writers prevent generic query/mutation capabilities.
- The fingerprint is standard SHA-256 for coherence, not authorization or a signed
  receipt. `expires_at` is unsigned bounded freshness metadata; it is not proof
  of prior preview issuance or human review. Auth + explicit action + server
  validation remains authority.
- MCP has 15 default tools; guessed apply calls are also blocked by
  `ENQIDU_MCP_WRITES_ENABLED=false`. Local stdio has no service-role credential
  option and accepts only loopback Supabase. Remote OAuth/discovery/hosting is
  deliberately absent, not simulated.
- No raw Garmin/provider payloads or FIT history are exposed through tools.
  Previews never mutate. Applying does not rewrite executed training or FIT.
- No paid LLM calls, upgrades, new billable infrastructure, production changes,
  production environment variables, Edge deployments or MCP deployments occurred.
- **One authorized product migration; zero production schema/RLS/grant changes.**
  It adds the service-only wrapper and leaves existing writers and tables intact.
  The isolated
  E2E bootstrap reconstructs existing Activity-detail read columns and four empty
  lookup tables omitted from the slim local baseline, with owner-read fixture
  policies. It is restricted to the local Docker socket and the named disposable
  `supabase_db_enqidu-e2e` container, never a remote URL. It does not create product
  schema features or fabricate health/execution evidence.
- No durable tool audit history, signed preview store, idempotency ledger or
  remote OAuth infrastructure was added. Telemetry is safe metadata on existing
  logs/stderr; no health values, arguments, JWTs or SQL errors are logged.

## Subsequent rollout

No rollout has been performed. After merge, a separately authorized rollout must
follow this order; do not release the frontend first:

1. Apply only `20261007045422_apply_enqidu_action_v1.sql` through the normal reviewed
   migration pipeline. Verify function signature, `SECURITY INVOKER`, fixed search
   path, revoked public/client execution, service-role execution and the required
   existing table privileges. Existing function signatures remain compatible.
2. Deploy **`enqidu-tools`** and **`coach-plan-action`** with this exact shared
   module revision. These are the acceptance boundaries: both must use the new
   wrapper before announcing atomic writes. Verify authenticated preview, explicit
   apply and stale rejection against disposable non-production data first.
3. Deploy **`coach-reply`** from the same revision, then the matching **frontend**.
   Existing reads remain compatible. Check proposal → review → apply → persisted
   readback and a stale card that cannot be retried.
4. Keep `ENQIDU_MCP_WRITES_ENABLED=false`, local-only MCP and OpenAI calls disabled.
   No step here authorizes production deployment or remote MCP.

New frontend + unavailable old Tools backend produces a safe unavailable message
and no legacy writer fallback. New Edge + missing wrapper also fails closed. Old
clients making receiptless existing-plan edits to new Edge receive
`explicit_confirmation_required`; reload the App to use review/apply. Explicit
legacy save/unavailability keep their existing one-step contracts. Old preview
fingerprints may become stale across deployment and must be regenerated. A brief
read-only/reload interval is acceptable; silently restoring immediate mutation is
not compatibility.

### Rollback

Rollback the frontend independently while retaining the guarded Edge functions.
For an acceptance incident, an authorized operator can revoke `service_role`
execution of the new wrapper to fail closed while reads/previews remain available;
drain in-flight transactions before further changes. Do not roll Edge back to a
version that dispatches the five writers without expected-state validation. The
additive wrapper may remain installed harmlessly while disabled; dropping it is
optional only after all callers are retired. No data reversal, FIT rewrite or
schema rollback is needed. Restore execution only after the corrected version is
validated. These are future operating instructions, not actions run by this task.

### Remaining debt

Conservative table locks serialize short planning writes across users; finer
concurrency needs a uniform protocol for legacy/direct writers. Advisory evidence
is not a transaction-wide snapshot. Legacy recommendation save has no reviewed
expected-state receipt. Timeout/lost-response retries have no persisted idempotency
ledger; reread and re-preview. Tool telemetry is not durable audit history. Remote
MCP still needs real authorization/discovery, consent and an approved hosting
decision; local Bearer tokens are not an OAuth substitute.

Recommended next epic: **authenticated remote MCP read/preview with audited
operational rollout**. Keep remote writes off; design durable idempotency and audit
only when required by an explicitly approved write product. No new paid service is
implicitly authorized.

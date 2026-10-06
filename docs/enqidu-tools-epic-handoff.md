# ENQIDU Tools / Preview / MCP V1 — engineering handoff

## Delivery and completion boundary

The reusable vertical is implemented and validated locally: App/Coach/MCP read
the same domain; previews do not write; reviewed acceptance reconstructs state
and calls existing Coach Actions; Closed Loop produces a reviewable 50 → 40 minute
adaptation; subsequent plan reads show the persisted change. MCP defaults to
read/preview and has no remote deployment.

**One requested guarantee remains technically blocked:** strict atomic
preview-state comparison and write cannot be implemented through the unchanged
existing RPC interfaces. See the exact race and required interface change in
[Action Preview V1](enqidu-action-preview-v1.md#explicit-database-transaction-limitation).
The task must not be represented as 100% complete against that strict guarantee
or ready for production write rollout. No migration was created to bypass the
user's boundary. Everything else in this handoff is implemented and tested.

Started from fetched `origin/main` at
`88830df5a4c2523259f0726033499a1c2ab0d46e`; no open PRs were present at audit time.
Branch: `feat/enqidu-tools-preview-mcp-v1`. The Git history separates shared
Tools/Coach, MCP and local E2E/handoff. The PR records the final commit SHA.

## Validation evidence

All commands used Node **22.23.3**, no paid calls and no OpenAI key requirement.

| Command | Final result |
| --- | --- |
| `npm run setup:cloud` | PASS; clean dependency install, existing local environment retained |
| `npm test` | **616/616**, 0 skipped |
| `npm run test:coach-evals` | **25/25** |
| `npm run test:tools` | **85/85** |
| `npm run test:mcp` | **32/32** |
| `npm run build` | PASS |
| `npm run test:e2e` | **27/27**, 0 skipped, actual local Supabase/Auth/RLS |
| `git diff --check` | PASS |
| Browser verification | Page, navigation, Coach composer, no error overlay/console errors; screenshot inspected |

The build reports the existing single-bundle size warning (503.84 kB minified,
155.10 kB gzip); it does not fail. No tests were removed or skipped to make the
epic pass. Old source-location assertions were updated to follow the extracted
shared implementation while preserving their ownership/timezone/action guards.

The E2E suite includes 20 Coach UI tests, three Tools integration tests, three
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
readback after acknowledged commits. Existing week RPC atomicity is tested locally.
These tests do not claim the missing atomic compare-and-write guarantee.

## Where to review

| Concern | Implementation / documentation |
| --- | --- |
| All 21 tools and schemas | `src/enqiduTools/registry.js`; `npm run tools:manifest` |
| Authenticated context, capabilities, results, telemetry | `src/enqiduTools/runtime.js`, `http.js`, `errors.js` |
| Nine reads and existing canonical algorithms | `src/enqiduTools/readTools.js`, `readSchemas.js` |
| Six previews and six applies | `src/enqiduTools/actions.js`, `actionPreview.js` |
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
- **No product migration or production schema/RLS/grant change.** The isolated
  E2E bootstrap reconstructs existing Activity-detail read columns and four empty
  lookup tables omitted from the slim local baseline, with owner-read fixture
  policies. It is restricted to the local Docker socket and the named disposable
  `supabase_db_enqidu-e2e` container, never a remote URL. It does not create product
  schema features or fabricate health/execution evidence.
- No durable tool audit history, signed preview store, idempotency ledger or
  remote OAuth infrastructure was added. Telemetry is safe metadata on existing
  logs/stderr; no health values, arguments, JWTs or SQL errors are logged.

## Subsequent rollout

No rollout has been performed. The changed deployable Edge units are:

1. **`enqidu-tools`** — new authenticated tool boundary.
2. **`coach-plan-action`** — compatibility endpoint using shared preparation/writers
   and requiring confirmation/receipt for existing-plan changes.
3. **`coach-reply`** — shared read-tool routing and Closed Loop review card.

Their imported shared modules must ship together with the matching App UI. Old
clients attempting immediate plan mutation will receive a confirmation-required
error; coordinate frontend/backend versions.

Before production writes: approve and implement expected-state comparison inside
the existing action transaction, including ownership, cancelled/completed status,
blocks, availability, source identity and relevant proposal evidence; add real
concurrent race tests. Keep MCP writes disabled. Revalidate locally/CI, review
the diff, then separately authorize any deployment. Remote ChatGPT MCP additionally
requires the appropriate existing ENQIDU authentication/OAuth discovery and hosting
decision; do not expose a pasted local bearer token as a remote auth substitute.

Recommended next epic: **transactional acceptance and authenticated remote MCP
rollout**. Resolve atomic consistency first; add durable idempotency/audit only if
the approved product interface needs it, then implement proper remote auth without
duplicating domain logic or enabling paid infrastructure implicitly.

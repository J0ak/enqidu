# ENQIDU Tools V1

ENQIDU Tools is the authenticated domain boundary shared by the App, deterministic
Coach, future agents and the local MCP adapter. It runs without an LLM or API key.
It adds no tables, migrations, grants, RLS policies, paid service or production deployment.

```text
App / Coach / MCP
      ↓
closed registry → authenticated runtime → canonical read domain
                                    ↘ shared action preparation → preview
                                                              ↓ explicit acceptance
                                                    reload + compare fingerprint
                                                              ↓
                                                    existing Coach Action RPC
```

## Implementation and discovery

`src/enqiduTools/registry.js` owns 21 executable contracts, globally versioned
`enqidu_tools_v1`; each tool is version `1.0.0`. `listEnqiduTools()` returns only
safe metadata: ID, description, read/preview/write access, JSON input/output schemas,
authentication, side effects, fixed domain-handler identifier and traceability.
`npm run tools:manifest` prints this manifest. There is no dynamic JavaScript,
SQL, table, RPC, owner or arbitrary mutation capability.

`src/coachTools/catalog.js` remains the compatibility vocabulary for existing
deterministic language intents, including explicit save and unavailability. Its
model/MCP descriptor exports project the new registry and default to read/preview.
Legacy intent names cannot be invoked through the new runtime. Existing save and
availability operations also use the extracted shared action implementation.

## Registry

| Tool | Arguments | Canonical data / effect |
| --- | --- | --- |
| `get_athlete_context` | `{}` | Profile, goals, active constraints, locations and scoped equipment |
| `get_today_plan` | `{}` | Profile-calendar date, persisted sessions, blocks, status and availability |
| `get_week_plan` | `{}` | Monday–Sunday dates, sessions, blocks, availability, existing progress calculation |
| `get_recent_training` | Optional `date`, `limit` 1–20 | Executed canonical identities and allowlisted metrics |
| `get_training_session` | `session_id` | Owned execution, bounded blocks and permitted metrics |
| `get_health_status` | Optional historical `date` | Existing `health_recovery_v1`; no provider payload |
| `get_readiness` | Optional historical `date` | Existing `readiness_v1`; no alternative algorithm |
| `get_closed_loop_assessment` | Optional `session_id`, `date` | Existing `closed_loop_assessment_v1` assessments |
| `get_adaptation_proposal` | Optional `session_id`, `date` | Existing `adaptation_proposal_v1` with canonical identities |
| `preview_move_session` / `apply_move_session` | `source_date`, `target_date` | Existing move action to a later available date |
| `preview_adapt_duration` / `apply_adapt_duration` | `source_date`, `duration_minutes` 10–180 | Existing proportional block-duration action |
| `preview_adapt_environment` / `apply_adapt_environment` | `source_date`, `environment` | Existing canonical recommendation and environment action |
| `preview_cancel_session` / `apply_cancel_session` | `source_date` | Existing cancellation preserving plan history |
| `preview_adapt_remaining_week` / `apply_adapt_remaining_week` | `{}` | Existing deterministic remaining-week reschedule |
| `preview_closed_loop_proposal` / `apply_closed_loop_proposal` | `session_id`, optional `date` | Deterministic proposal bridge to existing duration action |

Every apply additionally requires `fingerprint`, `expires_at` and
`confirmation: true`. Session IDs are UUIDs. Calendar dates are real ISO dates;
additional properties, coercion, invalid enums and invalid bounds are rejected.
The environment enum is `home`, `pool`, `trail`, `outdoor`,
`functional_training_center`; existing prescription-scope restrictions still apply.

## Authentication, identity and calendar

`createEnqiduToolRuntime({db, adminDb?, source, now?, capabilities?, observe?})`
accepts trusted server dependencies, never caller-controlled clients. The constructor
validates the bearer identity with `db.auth.getUser()` and reads `profiles.timezone`
using that ID. Missing/invalid profile timezones fail closed. It constructs:

```js
{
  authenticated_user_id, profile_timezone, request_calendar_date,
  request_id, source, capabilities, generated_at
}
```

No tool argument can set these values. Date-relative requests always use the
profile timezone, including Europe/Madrid midnight and 23/25-hour DST days.
Historical dates select evidence; they do not override the authenticated request
calendar. A browser/MCP client in America/Los_Angeles cannot change the date.
Reused runtimes refresh identity/calendar; apply reauthenticates again and builds
fresh canonical reads. User-owned parent queries are explicitly scoped and child
queries use only IDs from those owned parents, with RLS retained as defense in depth.

`supabase/functions/enqidu-tools` accepts only authenticated POST
`{tool, arguments}`. An isolated server admin client is constructed only for apply
and is passed solely to the fixed existing-RPC dispatcher. It is never returned,
sent to the browser or required for read/preview. Unknown body fields and
oversized bodies are rejected. Responses use `Cache-Control: no-store`.

## Result contract

```js
{
  tool, tool_version: "1.0.0", ok, data,
  warnings: [], evidence: [],
  traceability: {request_id, source, registry_version, domain_handler},
  generated_at, calendar_date, timezone,
  // failure only:
  error: {code, safe_message}
}
```

Both inputs and serialized outputs are checked against the registry schemas.
The result limit is 128 KiB; arguments are limited to 8 KiB, HTTP bodies to 16 KiB.
Queries/arrays have domain-specific limits. Read overflow fails closed instead
of silently dropping evidence. Errors expose fixed safe messages/codes, never SQL,
JWTs, keys, stack traces or raw Garmin/FIT payloads. Acknowledged writes retain a
bounded successful receipt if readback/serialization fails; warnings instruct
the UI to reload instead of reporting a false failure.

## Preview, apply and Closed Loop

See [Action Preview V1](enqidu-action-preview-v1.md) for the full contract and action
matrix. The shared preparation calls the existing date, scaling, reschedule and
recommendation helpers. It performs reads only. Apply reconstructs the preview
from current state and compares a standard SHA-256 consistency digest before
calling the same pre-existing narrow Coach Action RPCs. Private preparations are
branded and frozen; clients cannot submit block replacements or an RPC descriptor.

The bridge recomputes the existing Closed Loop assessment and proposal. For an
actionable `reduce` or health-driven `recovery_bias` with one future target, policy
`enqidu.closed-loop-action.v1.0.0` reduces the lower planned duration bound by 20%,
rounds down to five minutes and keeps a ten-minute minimum. Example: 50 → 40 min.
The preview includes the original evidence/proposal in its private digest state.
`keep`, `no_change`, unsupported adaptations, ambiguous targets and discomfort-based
recovery proposals return `proposal_not_actionable` instead of inventing changes.
There is no automatic acceptance or clinical inference.

**Rollout blocker:** existing RPCs do not accept expected revisions. The preflight
reload/compare and mutation are separate transactions. The RPC mutations are atomic,
but strict compare-and-write is not guaranteed. In particular, a concurrent
cancellation after validation can be overwritten by duration/environment RPCs.
No migration was made to fix this. Production write rollout and MCP write enablement
must wait for an explicitly approved transactional contract. The fingerprint and
unsigned expiry are coherence metadata, not authorization, a signed receipt, or
proof that a person reviewed a previously issued preview.

## Coach and App

`coach-reply` invokes the same read runtime and uses `coachAdapter.js` only to adapt
canonical fields to the existing presentation. Health/readiness, plan, week and
Closed Loop calculations are shared. Older period/trend summaries retain their
existing fixed canonical RPC outside this V1 tool list.

Existing deterministic commands now request previews. A memory-only proposal card
offers **REVISAR CAMBIO**; the next view names the session/date and compares before
and after, including blocks. Only **APLICAR** sends acceptance. Conversational
acceptance is supported only after review. A stale result disables apply and
requires a new proposal. No-op previews have no apply button. Closed Loop answers
offer a review card; successful apply confirms the persisted result and refreshes
the plan. Save recommendation and availability remain explicit existing operations.

## Performance, observability and tests

`executeMany` accepts at most nine reads and shares a request-scoped canonical cache.
Health/readiness reuse evidence; Closed Loop reuses health dates. No request cache
is carried into apply. There is no N+1 block loading for plan lists.

The optional observer receives only request ID, tool ID/version, timestamp,
status, duration and safe error code. Edge uses existing console logging; local
MCP uses stderr. No new event persistence or paid observability infrastructure is
created. This is not a durable audit ledger or idempotency store.

Run on Node 22:

```sh
npm run setup:cloud
npm test
npm run test:coach-evals
npm run test:tools
npm run test:mcp
npm run build
npm run test:e2e
```

E2E needs the repository's isolated Supabase local stack and existing canonical
Health bootstrap, with `OPENAI_COACH_ENABLED=false`. It creates actual Auth users,
canonical Health and baseline history, a plan, FIT-linked execution and confirmed
feedback, then tests preview/no-write, explicit apply, unchanged history, Coach
response and SDK MCP parity. Contract tests add hostile args, A/B isolation,
bounded/safe output, stale state, clock boundaries and failed readback behavior.

MCP's local-only transport, annotations, feature gate and remote authentication
boundary are specified in [MCP V1](enqidu-mcp-v1.md). No remote MCP/OAuth deployment
is included. No OpenAI calls are needed to run domain, contract or E2E tests.

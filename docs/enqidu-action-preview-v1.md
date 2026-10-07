# ENQIDU Action Preview V1

`src/enqiduTools/actions.js` is the single preparation and execution layer for existing Coach Actions. App, Coach, the ENQIDU Tools endpoint and MCP previews use the same code. One incremental migration adds a service-only transactional wrapper around the unchanged planning writers. It creates no table and changes no RLS policy or client grant.

## Reuse and ownership

Preparation reuses `resolveNextWeekdayDate`, `scalePlannedBlockDurations`, `planRemainingWeekReschedule`, `buildTrainingRecommendation` and `toPlannedRecommendationPayload`. Environment adaptation uses the existing canonical Coach context, active constraints and `loadHealthIntelligence`/`readiness_v1`. It does not call an LLM or implement another readiness algorithm.

The execution context derives `userId` from verified authentication and the calendar from the profile timezone. The browser/MCP cannot submit an owner, RPC name, table name, block payload or arbitrary changes. Queries use fixed columns, owner predicates, date bounds and collection limits. Planned blocks are fetched only after identifying owned parent sessions.

`prepareEnqiduAction` only reads. It returns an internal, deeply frozen, process-branded prepared object containing the canonical state, projected changes and a narrow command. `executePreparedEnqiduAction` accepts only an object created by this module for the same authenticated owner. Cloned/client-created prepared objects are rejected. This is an internal misuse guard; authentication and server validation remain the authorization boundary.

| Domain action | Existing transactional writer |
| --- | --- |
| `move_session` | `move_coach_planned_session` |
| `adapt_duration` | `adapt_coach_planned_session_duration` |
| `adapt_environment` | `adapt_coach_planned_session_environment` |
| `cancel_session` | `cancel_coach_planned_session` |
| `adapt_remaining_week` | `adapt_coach_remaining_week` |
| Closed Loop proposal | Resolves to bounded `adapt_duration`, then the existing duration writer |

Explicit recommendation save and unavailability remain supported through the same shared preparation/execution module and their existing writers. The compatibility `coach-plan-action` endpoint now requires confirmation and the preview receipt for all five existing-plan mutations; it is not a preview bypass.

## Public contract

```json
{
  "schema_version": "enqidu_action_preview_v1",
  "action": "adapt_duration",
  "target": { "session_ids": ["owned-session-id"], "dates": ["2026-10-06"] },
  "before": ["typed session snapshot"],
  "after": ["typed session snapshot"],
  "consequences": ["block_structure_preserved", "executed_training_unchanged"],
  "warnings": [],
  "reasons": ["explicit_adapt_duration"],
  "affected_entities": [{ "type": "planned_session", "id": "owned-session-id", "date": "2026-10-06" }],
  "fingerprint": "sha256:<64 hexadecimal characters>",
  "expires_at": "2026-10-05T12:05:00.000Z",
  "calendar_date": "2026-10-05",
  "timezone": "Europe/Madrid",
  "requires_confirmation": true
}
```

The example uses placeholders for the session arrays; the registry contains the executable JSON schema. Each snapshot shows session identity, date, title, status, type, environment, exact duration range, intensity, objective, completion evidence and blocks. Blocks include title/order/duration, type, objective, rounds, notes, and bounded exact JSON text for existing planned exercises and constraints. These are canonical plan prescription fields, not provider/FIT payloads and not accepted mutation arguments. Environment replacement shows fields reset by the existing writer, including discarded prescription details. New block IDs are `null` because the database allocates them on apply.

Remaining-week and duration requests that change nothing return `requires_confirmation: false`; App shows no Apply button. Their execution path, if explicitly called, is a no-op and never invokes a writer.

The envelope includes traceability and safe errors. No private prepared state, mutation descriptor, SQL error, stack trace or credential is returned.

## Consistency and expiry

The fingerprint is standard SHA-256 over canonical sorted domain data: owner, profile calendar, narrow arguments, relevant plans, revisions, blocks, availability, recommendation inputs and proposed changes. Environment preparation includes goals, equipment, location scope, constraints, canonical health/readiness and relevant training context. Closed Loop binds the recomputed proposal and assessment into this same fingerprint and exposes its actual reasons.

Generation timestamps, request IDs and preview expiry do not change the fingerprint. The HRV readings-count query cutoff (`hrv.field_sources.readings_count.as_of`) is also ephemeral; the count, linked summary, evidence dates, actual observation instants and other `as_of` fields remain significant. Unchanged canonical health therefore remains reviewable across requests, while a changed count invalidates the preview.

Preview lifetime is five minutes. Apply reauthenticates, reloads the canonical state, repeats domain validation and rebuilds the digest. A mismatch, expired receipt, calendar rollover or invalidated target returns `preview_stale` before invoking a writer. Apply also requires `confirmation: true`. The client supplies only the original narrow arguments plus `fingerprint`, `expires_at` and confirmation. Server-recomputed changes are the only writer inputs.

The digest is a consistency check, **not an authorization token or proof that a UI was viewed**. Expiry is a client-returned, bounded freshness hint, not signed or persisted issuance. A client can request another preview (or alter an untrusted expiry within the accepted window); it cannot change ownership or bypass current server validation. No signing scheme or token store is invented.

## Transactional acceptance

`apply_enqidu_action_v1(p_user_id uuid, p_action text, p_expected jsonb, p_command jsonb)` is the only apply dispatcher for the five existing-plan actions. Closed Loop resolves to the same duration action. `p_user_id` is supplied by the authenticated Edge boundary, never a tool argument. The function is `SECURITY INVOKER`, has a fixed search path, revokes execution from `PUBLIC`, `anon` and `authenticated`, and grants execution only to `service_role`.

The command and expected-state DTOs are internal, closed and versioned. They are not public mutation JSON. The wrapper accepts fixed actions only, rejects unknown keys and invalid types, and never executes a client-selected RPC or SQL. PostgreSQL compares canonical facts; it does not run the JavaScript fingerprint or duplicate recommendation/scaling algorithms.

```js
// Server-only; never accepted from browser/MCP tool arguments.
expected = {
  version: 1,
  calendar: { date, timezone },
  scope: { selection: "action" /* or "closed_loop_target" */,
    from_date, to_date, block_session_ids },
  plans: [/* fixed canonical parent projection, including updated_at */],
  blocks: [/* fixed complete child projection, including IDs/order/prescription */],
  availability: [/* user_id, calendar_date, availability_status, source */],
  prescription: null /* environment only: {constraints, locations, equipment, catalog} */,
};
```

Commands are closed per action: move `{sourceDate,targetDate}`; duration
`{sourceDate,sessionId,duration,blocks:[{id,duration_seconds}]}`; environment
`{sourceDate,sessionId,session:{title,session_type,environment,intensity,objective,
duration_minutes,blocks:[{title,duration_minutes}]}}`; cancel `{sourceDate,sessionId}`;
week `{from,to,moves:[{planned_session_id,source_date,target_date}]}`. Scope is at
most 366 days (remaining-week at most seven), 100 plans and 1,200 expected blocks;
writer-specific block/move bounds remain in force. A move beyond that span is
rejected during preparation, before an applicable preview is offered.

The transaction acquires the existing `user|date` and `user|availability|date` advisory namespaces in chronological order. It then locks the relevant authority tables and rows, rereads the current facts, compares them to the expected facts and calls the existing writer. All locks remain held through the single commit. A mismatch returns `{ok:false,error:"preview_stale"}` before any writer call. The HTTP boundary reports a safe conflict, not SQL or a generic 500.

The expected contract covers the owned source identity, dates, source/status/completion link, parent revision and prescription, exact child identities/order/durations/prescription, availability membership and target occupancy. Remaining-week covers the whole bounded plan set and availability, so no member can change while a batch partially proceeds. Environment adaptation additionally guards mutable prescription authority. Profile timezone and Closed Loop candidate selection are also checked; the executable SQL and preparation projection are the authoritative field lists.

The request calendar and receipt expiry are validated at authenticated server admission. The admitted command contains absolute dates; SQL compares the persisted profile timezone and scoped facts, not a second wall-clock date. Time cannot be locked through commit. A request admitted before midnight keeps its confirmed absolute dates if it waits across midnight; a new request after rollover must re-preview. This is an explicit request-snapshot boundary, without a database clock override or a test-only RPC parameter.

Table locks are a deliberate conservative V1 choice. Existing legacy writers and direct service-role DML do not all cooperate with advisory locks; row locks alone cannot protect missing-row predicates and independently mutable child membership. `SHARE ROW EXCLUSIVE` prevents these inserts, updates and deletes during comparison and write. This can serialize short planning transactions across athletes. It does not lock Health, FIT or training history. Refining concurrency requires a reviewed shared locking protocol across *all* writers, not merely removing these locks.

Advisory locks precede table locks to match existing writers. Arbitrary administrative transactions taking locks in another order can still deadlock; PostgreSQL aborts a participant atomically. This is a safe failure, not a guarantee of unlimited concurrency or automatic retry. There is no fallback to an unguarded writer when the wrapper is missing, denied or fails.

### Retry and commit acknowledgement

A successful non-no-op apply changes the compared plan state/revision. A second acceptance from the same preview therefore becomes stale, including concurrent double taps. There is no idempotency ledger: after a timeout or a lost commit response, the client must reread the plan and obtain a new preview rather than automatically replay a mutation. It cannot infer failure from a missing response. If the writer acknowledged success but a later readback/report fails, the runtime returns its bounded successful receipt with a warning. Durable request replay would require a separately designed persisted idempotency contract.

### Existing save and unavailability

Recommendation save is outside the six preview/apply Tools. Its existing date lock and check prevent a second active plan among cooperating date writers; it does not provide an expected-state acceptance guarantee over all recommendation inputs. Do not describe legacy save as transactionally accepting a reviewed preview. Any future `preview_save`/`apply_save` must join this contract, including availability and prescription authority. Unavailability is an explicit idempotent upsert protected by its own unique date key and advisory namespace; it intentionally preserves plans and has no preview-state predicate. The new wrapper takes that namespace when availability conditions an existing-plan action.

## Closed Loop and user acceptance

The canonical assessment creates `adaptation_proposal_v1`. The bridge selects an owned actionable future session and resolves an allowed duration reduction through a versioned deterministic policy. It never accepts an LLM-created target or block payload. The full assessment/proposal evidence is rebound during apply preflight, so evidence changed before that read invalidates the reviewed proposal.

The transaction distinguishes **mutation authority** (confirmed target/action/exact payload, candidate plans, target state, blocks, availability and profile calendar) from **advisory evidence** (execution metrics, feedback, Health, readiness and the derived explanation). Advisory evidence is the snapshot that justified the reviewed proposal, not a requirement that measurements remain unchanged until commit. After successful preflight, an observational update cannot change the immutable command passed to PostgreSQL. The wrapper never recalculates a proposal using newer observations. A changed target plan or selection predicate is stale; a later Health observation alone may coexist with the same exact accepted change. This is strict atomic acceptance of mutation authority, not an atomic snapshot of every observational source or a promise of the latest clinical advice.

App presents the proposal, then a review with before/after and reasons, then an explicit Apply action. Successful application is reported from the existing writer and followed by a canonical plan readback. A readback/reporting failure after an acknowledged write must remain an acknowledged success with a warning, avoiding a misleading retry. No automatic adaptation occurs.

## Validation

`tests/enqidu-action-core.test.mjs` exercises five action families: deterministic previews with zero writes; exact execution through the existing writer dispatch; stale receipts after block changes; owner isolation and payload injection; nonexistent, completed, skipped, cancelled and ambiguous targets; real invalid dates, past dates, invalid durations/environments; unavailable dates; exact block replacement previews; unchanged no-op results; safe RPC errors; and single-call week dispatch. It also tests expiry, recommendation input/revision changes, real HRV loader cutoff repeatability and count changes, and bound Closed Loop reasons.

Existing Coach action/evaluation tests follow the extracted shared code and retain auth, timezone, no-LLM and fixed-writer guards. Tools/MCP tests cover runtime confirmation, transport parity and feature gating. Local integration/E2E verifies actual existing RPC transactions and retained execution/FIT data.

`npm run test:transactional-actions` uses actual independent PostgreSQL connections. Writer A mutates while retaining its transaction locks; acceptance B attempts the wrapper; the monitor verifies `pg_blocking_pids` and a waiting `pg_locks` entry before releasing A. Assertions compare complete persisted rows and `xmin` to prove stale B wrote nothing. The suite covers cancellation, competing duration applies, environment cancellation, occupied move targets, moved sources, week availability/set changes and independent block changes. Happy-path acceptance and privilege/hostile DTO checks run against the same database.

The single product migration is applied only to disposable Supabase local/CI for these tests. No incremental paid service, LLM call or production deployment is required.

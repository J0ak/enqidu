# ENQIDU Action Preview V1

`src/enqiduTools/actions.js` is the single preparation and execution layer for existing Coach Actions. App, Coach, the ENQIDU Tools endpoint and MCP previews use the same code. No new planning writer, table, migration, RLS policy or grant is introduced.

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

## Explicit database transaction limitation

The existing RPCs do **not** accept an expected fingerprint, session revision or full expected state. PostgREST reloads and the subsequent existing-writer RPC are separate transactions. A concurrent write can occur after the last comparison but before the writer acquires its database locks. The existing RPCs atomically validate their own narrow invariants and commit their mutation (the week writer validates every move before any write), but this is **not an atomic compare-and-write of the entire preview**.

For example, two duration requests against identical block IDs can pass their separate comparisons; a later writer can overwrite the earlier duration. The duration/environment RPCs also do not reject a cancellation that happens after the preflight read. The move RPC does not accept an expected source-session ID, and the week RPC does not recheck availability. Preflight rejects these states when already visible, but cannot close the intervening database race.

Strict transaction-wide stale-preview protection is blocked by the existing database interface. Closing it requires an explicitly reviewed database-interface change (a revision/expected-state check under the existing transaction locks) or an approved transaction-capable adapter that holds locks across read, comparison and the same existing writer. No migration, production schema change, alternate writer, compensating history rewrite or unsafe claim of compare-and-write protection is included. This limitation must be resolved before claiming strict concurrent preview/apply guarantees or enabling remote mutations.

## Closed Loop and user acceptance

The canonical assessment creates `adaptation_proposal_v1`. The bridge selects an owned actionable future session and resolves an allowed duration reduction through a versioned deterministic policy. It never accepts an LLM-created target or block payload. The full assessment/proposal evidence is rebound on apply, so changed feedback, health, linkage or target state invalidates the reviewed proposal.

App presents the proposal, then a review with before/after and reasons, then an explicit Apply action. Successful application is reported from the existing writer and followed by a canonical plan readback. A readback/reporting failure after an acknowledged write must remain an acknowledged success with a warning, avoiding a misleading retry. No automatic adaptation occurs.

## Validation

`tests/enqidu-action-core.test.mjs` exercises five action families: deterministic previews with zero writes; exact execution through the existing writer dispatch; stale receipts after block changes; owner isolation and payload injection; nonexistent, completed, skipped, cancelled and ambiguous targets; real invalid dates, past dates, invalid durations/environments; unavailable dates; exact block replacement previews; unchanged no-op results; safe RPC errors; and single-call week dispatch. It also tests expiry, recommendation input/revision changes, real HRV loader cutoff repeatability and count changes, and bound Closed Loop reasons.

Existing Coach action/evaluation tests follow the extracted shared code and retain auth, timezone, no-LLM and fixed-writer guards. Tools/MCP tests cover runtime confirmation, transport parity and feature gating. Local integration/E2E verifies actual existing RPC transactions and retained execution/FIT data. Unit mocks deliberately do not claim to prove the missing database compare-and-write guarantee.

No incremental paid service, LLM call, production deployment or migration is needed to run these checks.

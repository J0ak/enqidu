# Owned Garmin sync — implementation and rollout

See [verified runtime/scheduler audit](fitness-ai-runtime-audit.md). This change prepares the safe application seam; **the external integration and scheduler remain blocked**, not production-active.

## One pipeline, two authenticated entry paths

Manual POST `{}` → `getUser()` → owner consent/binding → fixed server transport → existing `FitnessAiGarminSource` → existing `GarminAdapter` / `ingestGarminDaily` → consent guard → **existing** `ingest_garmin_health_record` → `wearable_*` → existing Readiness / Morning Coach. The guard neither normalizes nor persists metrics itself. No new Health pipeline, LLM call, apply action or MCP write capability.

Scheduler POST `{}` → dedicated secret → fixed DB claim of eligible owners → fresh per-owner `runMorningForOwner` → same pipeline. There is no fabricated user JWT. The privileged domain is scoped with an internal DB-claimed owner; existing canonical readers and context RPCs enforce that supplied scope. HTTP never accepts `user_id`, `garmin_user_id`, token, URL, provider, timezone, date, RPC, table or arbitrary query parameters. Header auth modes are mutually exclusive. The scheduler response contains only aggregate counts and allowlisted operational errors, no owner IDs, brief or biometrics.

`sourceForUser(userId): Promise<GarminSourceBinding>` returns a server-only capability with fixed `provider=garmin`, `provider_mode=aggregator`, `ingestion_channel=fitness_ai_connector`, owner, consent version, connection status/timestamps, verified revision and `source`. No secret or external account reference is returned through the status tool. A future transport receives a trusted binding and must retrieve its credential privately by owner/revision, never request input. The present adapter is `FitnessAiServerTransportUnavailable`.

## Consent and connection are distinct

`user_wearable_connections` is reused. No existing row is presumed consented or verified. New fields default to `consent_status=not_configured`, `binding_verified_at=null`; historically user-editable external references remain untrusted. Direct user mutation of connection rows is removed, including unsafe TRUNCATE grants; owner reads remain available. Only a narrow authenticated `set_garmin_sync_consent(action, version)` RPC changes consent, with owner from `auth.uid()`. It fixes provider and never accepts identity or connection configuration.

| User operation | Consent | Binding / data |
| --- | --- | --- |
| Initial / legacy row | `not_configured` | No eligible sync, regardless of old `connected` value. |
| Authorize | `active`, exact `garmin_daily_v1` required | Does not invent a verified connection. Current runtime remains unavailable. |
| Disable | `pending_consent` | Stops manual and scheduled ingestion; retains server connection for later explicit re-enable. |
| Revoke | `revoked` | Marks connection revoked, clears verification/external reference, invalidates revision. Stored Health remains. |
| Reconnect | `pending_consent` | Resets connection to pending; requires fresh verified provider binding AND explicit enable. Does not open an invented OAuth flow. |
| Connection failure / auth expiry | Consent unchanged; connection can be `error` | Fail closed; no implicit consent or erasure. A future official transport must classify auth failures and update server-owned lifecycle safely. |
| Status read failure | Report `error` | Never report unknown consent as active. |

The Health view includes explicit purpose/scope text and an unchecked checkbox, authorize/disable/revoke/reconnect controls, honest unavailable copy, and a disabled manual sync control while runtime is unavailable. The RPC audit is authoritative, not the checkbox alone. API consumers must present the same consent version/scope before calling enable. This user-owned consent RPC is not added to MCP's tool registry.

The only new table, `garmin_sync_consent_events`, is an append-only, RLS-protected audit of timestamp, action, consent version/status and binding revision. User may read only own events; neither user nor service can rewrite event history. A private trigger records server binding lifecycle changes. No arbitrary JSON, credential, raw error or biometric field is added.

## Revocation and races

Each fetch re-resolves current consent and binding revision. More importantly, `ingest_owned_garmin_health_record` locks the connection row, validates active/versioned consent, verified connection, revocation timestamp and exact binding revision, then delegates to the existing Foundation RPC in **the same transaction**. Consent changes lock that same row. A record already committed before revocation remains; a record attempting after committed revocation cannot persist. Disable→enable and reconnect invalidate previously fetched capabilities too.

Disconnect at Fitness AI/Garmin cannot be observed by inventing webhooks or using the user's ChatGPT session. Once an authorized future transport exists, an upstream disconnect/auth-expiry response must invalidate the server binding; until then runtime is globally unavailable. Revocation here stops ENQIDU ingestion and does not claim to revoke remote provider credentials. Remote account deletion is a separate provider/user operation.

## Bounded execution and failure behavior

- DB `claim_garmin_sync_batch()` has no arguments, is service-role-only, uses the partial due-time index and `FOR UPDATE SKIP LOCKED`, maximum five rows. A claim advances next due time one day, preventing overlapping/replayed schedulers from draining the same owners repeatedly.
- One owner's failure is caught independently. No global cached domain or source. Profile timezone is read per owner; missing/invalid zone fails closed. Today plus yesterday only in production.
- Per-owner orchestration deadline 20 s; overall batch 100 s. Deadline guards stop initiating later source/writer calls. An already-dispatched database transaction may finish atomically; its consent lock still applies. A future HTTP transport must also honor cancellation/network deadlines to release underlying sockets.
- Existing source bounds remain four pages/day, 100 records/page, at most three transient attempts with bounded backoff. No catch-up/backfill loop.
- Scheduler crashes/failed/deferred claims retry next due day; no guarantee of delivery or immediate retry. Once-daily capacity is five eligible owners. Future activation must verify CPU/latency/quotas using the real upstream shape.

| Condition | Safe result |
| --- | --- |
| Runtime unavailable | `connector_runtime_unavailable` (503) |
| Consent absent/disabled or revoked | `consent_missing` / `consent_revoked` (403) |
| Unverified/failed binding | `binding_unverified` / `binding_read_unavailable` / `connection_unavailable` |
| Revocation or connection change after fetch | `sync_authorization_changed` |
| Source auth expired/denied | `source_auth_failed`, no retry |
| Rate limit | `source_rate_limited`, bounded retry |
| Transient failure | `transient_unavailable`, bounded retry |
| Partial Garmin | Existing `source_partial`, family coverage/no-data retained |
| Old revision / wrong requested date | Existing `ignored_stale` / `source_date_rejected` |
| Malformed response | Existing `invalid_source_record` |
| Deadline | `sync_deadline_exceeded` |
| Morning read fails after persistence | `morning_read_unavailable`; committed ingestion report preserved |

No stacks, SQL messages, source secrets, raw responses or biometrics in application telemetry. `get_health_ingestion_status` retains its ledger-derived timestamps/families and adds `sync_enabled`, `consent_status`, `connection_status`, `runtime_available=false`, `scheduler_status=blocked_runtime`. `sync_enabled` means the user consented, **not** that an operational source exists. `last_success_at` remains a successful observation watermark, not a claimed full-batch completion. `attempt_history_available=false` remains honest.

## Migration, verification and rollout order

Migration: `20261013104703_garmin_sync_ownership_consent.sql`, created with the Supabase CLI. It is additive except narrowing connection privileges. It creates no cron, secret or provider binding and does not modify historical Health/FIT/training data. It must precede the new app/function deployment. Only the migration owner manages audit history; account deletion cascades remain unchanged.

1. Review PR and migration against inspected production contract. Run consent/RLS/RPC tests, scheduler/manual tests, Coach evals, full suite, build and isolated E2E.
2. Apply migration using the normal reviewed release process, then run `supabase/verification/garmin_sync_ownership.sql` and Supabase advisors. Do not grant frontend connection writes to solve deployment ordering problems.
3. Deploy app/read tools and guarded Edge function. Keep runtime and scheduler false. Existing Health remains readable.
4. Obtain a documented, explicitly authorized **multiuser** transport with verified **€0 incremental** terms. Personal Developer Option does not meet this gate. Review the official client/callback/token/refresh/revocation contract and provision a private credential store (none is invented in this migration).
5. Implement only that transport adapter; verify upstream account ownership server-side before setting `binding_verified_at`. Never copy historic user-edited external references into verified bindings. Obtain explicit versioned consent independently.
6. Validate one manual sync, repeated/stale/partial responses and all revocation cases; verify actual free quotas and latency/CPU. Existing deterministic Morning brief is generated, never applied.
7. Prefer Supabase Cron after installing available pg_cron/pg_net, store a dedicated random scheduler secret in Vault + Edge secrets, and schedule fixed POST `{}`. Confirm function-level handler auth/gateway config, secret rotation, ≤5-owner daily capacity and bounded cron history retention. A code-reviewed change must enable runtime/scheduler and update status capability reporting together.
8. Verify aggregate cron response and authenticated owner ledger; no real health data in CI artifacts/logs.

No production migration/deployment/cron activation occurs merely by delivering this PR. Scheduler activation is specifically blocked by verified upstream terms. No authorization question can turn the incompatible personal paid option into a free multiuser integration.

Rollback: disable/unschedule cron first if ever activated, revoke scheduler secret, revert function/app, retain the consent/audit schema and narrowed grants. Do not restore the former direct connection-write/TRUNCATE permissions or erase persisted Health. Keeping the default-unverified columns is safe for older readers.

## Verification evidence for this PR

- Node 22.23.3: **26 Coach contract evals**, **654 full-suite tests**, all passed. The Deno runtime regression also passed in the focused suite. Production Vite build passed (existing >500 kB bundle warning remains).
- Supabase Edge Runtime v1.77.4 exposes `window` without a DOM. The server guard now accepts that Deno runtime while rejecting browsers; a regression verifies consent resolution and guarded persistence. An actual Edge Runtime container with an explicit mock database returned `403 consent_missing` and `503 connector_runtime_unavailable` as expected.
- Actual migration plus canonical Foundation writer tested both in PGlite and an empty disposable **PostgreSQL 17** container. `scripts/verify-garmin-sync-postgres.mjs` proves an ungranted lock on the waiting writer, committed revoke rejection, preserved Health, reconnect requiring renewed verification, and concurrent `SKIP LOCKED` claims. Post-migration RLS/grant assertions all true.
- Chromium component check with an **explicit mock client**: checkbox/version, enable/disable/revoke/reconnect, unavailable manual sync and account-change reset; zero page errors. This is not a production-auth or Fitness AI end-to-end claim.
- Full local Supabase startup was blocked by this executor's 32 GB filesystem and VFS image-layer expansion (`failed to register layer: no space left on device`), including a reduced service attempt. The attempt was stopped. A small PostgreSQL 17 container provided the real SQL concurrency checks without altering the managed daemon or bypassing network policy.
- Full authenticated browser/API E2E and transactional race tests are committed into the existing CI workflow, using its isolated Supabase bootstrap. CI result is reported on the PR; no local E2E pass is invented.
- `git diff --check` passed. No production DDL, function deployment, provider binding, consent grant, secret or schedule was applied.

To reproduce the standalone PostgreSQL check, create an **empty disposable** local PostgreSQL 17 database, set `ENQIDU_TRANSACTION_LOCAL=1` and `ENQIDU_TRANSACTION_DATABASE_URL` to its loopback URL (explicit port, database `postgres`), then run `node scripts/verify-garmin-sync-postgres.mjs`. It refuses remote hosts, URL options and nonempty public/auth schemas. It intentionally leaves only synthetic fixtures in that disposable database; discard the container afterwards.

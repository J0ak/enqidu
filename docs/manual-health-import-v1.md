# Manual Health Import / Assisted Capture V1 — Epic #98

## Scope and architecture

One explicit user capture → closed `enqidu.manual-health.v1` adapter → existing
`enqidu.wearable.v1` DTO → service-only `apply_manual_health_import` comparison
boundary → existing `ingest_garmin_health_record` transaction → wearable tables
→ existing Health Evidence / Readiness / Daily Coach read models.

This is a manual, scalar-summary workflow, never a transport. There is no image
interpretation, model call, arbitrary RPC/table input or frontend biometric write.
No second Health pipeline or new biometric table. Planning preview/apply is not
reused: its authority and locks concern plans, not canonical Health revisions.

The HTTP endpoint is `manual-health-import`; its only actions are
`preview_manual_health_import` and `apply_manual_health_import`. The app exposes
paste → review → explicit checkbox → confirm. Editing resets the preview.
Success reloads the Health view and canonical evidence/readiness for the selected
observation date. Opening Coach mounts its existing loader and reads fresh Health.

## Input contract

```json
{
  "version": "enqidu.manual-health.v1",
  "observation_date": "2026-10-14",
  "captured_at": "2026-10-14T08:00:00+02:00",
  "family": "sleep",
  "source_evidence": { "kind": "garmin_connect_visible_summary" },
  "measurements": {
    "total_duration_seconds": { "value": 28800, "unit": "s" },
    "sleep_score": { "value": 80, "unit": "score" }
  }
}
```

A payload represents one full summary for one family/date. Supported families:
`daily_health`, `sleep`, `hrv`, `stress`, `body_battery`, `heart_rate`, `spo2`,
`respiration`. Numeric field allowlists, bounds and unit conversion come directly
from `GARMIN_MEASUREMENT_FIELDS` / the existing adapter. V1 deliberately excludes
samples, stages, body composition and arbitrary vendor insights. It does not
infer curves, timestamps, missing values or measurements from images.

`source_evidence.kind` is the closed enum `garmin_connect_visible_summary` or
`garmin_user_export`. The exact submitted measurements, source kind, observation
and capture dates remain in Foundation evidence. This is user-verified evidence,
not independently authenticated provider data. Free-text raw observations,
source URLs/assets, notes and identifiers are not accepted, preventing a secret
or arbitrary object from becoming an evidence payload. Unknown fields at every
level are rejected, never silently ignored; responses show field paths, not
rejected values. SQL, RPC, table, identity, timezone, provenance, credentials,
tokens, cookies and headers cannot be input fields.

Payload limit: 16 KiB, depth ≤5, ≤512 visited values. HTTP streaming reads are
bounded to 20 KiB including the signed preview token (token ≤4 KiB). No coercion:
zero remains zero; omitted or explicit null metrics remain null. Foundation's
existing positive-heart-rate constraint remains intact. The athlete profile
provides timezone (Europe/Madrid when that is their configured zone); no device
or client override. Invalid/missing profile timezone fails closed. ISO capture
time requires an explicit offset; future captures/dates fail validation.

## Preview, confirmation, corrections

Preview authenticates with `auth.getUser()`, reads that user's profile and
canonical revision, normalizes all input and returns metrics/provenance. It
creates no row, raw evidence, audit event or state. Its HMAC token expires after
15 minutes and binds user, exact input hash, timezone and expected Foundation
revision. It is signed with a domain-separated backend key derived from the
existing service-role secret; no new secret/service or browser key exposure.

Apply authenticates again, reloads the profile, revalidates the complete payload,
requires literal `confirmation: true`, and verifies the signed preview. The
service-only SQL boundary checks role internally, locks the profile and the
existing per-athlete Garmin advisory lock, compares expected revision and calls
the original writer in the same transaction. Changed profile or concurrent
revision returns a conflict before writing. The RPC is SECURITY INVOKER with
empty search_path; PUBLIC/anon/authenticated have no EXECUTE. No new SECURITY
DEFINER, broad grants or RLS bypass is introduced.

Exact retries return unchanged. Newer captured_at replaces the complete family
summary; omitted values do not inherit previous observations. Older captures
are archived by Foundation as evidence but return ignored_stale without
reverting canonical measurements. Different values at the same capture instant
are rejected. A stale preview must be reviewed again. All families use existing
Foundation user/provider/date keys, not a parallel channel key.

A manual summary cannot replace canonical evidence from another transport,
canonical samples/stages, or legacy daily/sleep/HRV projections from another
channel. Existing sleep stages also block summary-only replacement. Legacy
ambiguities fail through the existing Foundation writer. Legitimate legacy
assisted summaries may be adopted by the existing archival mechanism; this PR
contains no backfill and rewrites no historical production data.

## Production audit (read-only, 2026-10-14)

Repository baseline: `origin/main` = `452ce99a8b022215ba74d699332724fc259ad1a8`.
Production project: Enqidu (`rdduqsziboqxlgeqouxq`). Function
`provider-health-assisted-import` is **ACTIVE v7**, verify_jwt=true,
ID `00a9fb71-2248-44b8-8402-49cac3f48fd8`, deployed bundle SHA-256
`41abd116e2c9806ab6340539962fc8e981e6b1100f80b3c293dcdef8d5063ad8`.
It is absent from the baseline repository. This is explicit production/Git drift.

Read-only inspection used get_edge_function and PostgreSQL catalog SELECTs;
no invocation, production migration, deployment, deletion or data change.
The live Foundation writer body MD5 is `d858767581fcb581acbfe6152e997c52`,
identical to the repository migration's function body. It is SECURITY INVOKER,
search_path='', UTC/ISO date settings, EXECUTE only postgres/service_role.
Profile `id` is uuid and `timezone` text; service_role has SELECT/UPDATE needed
for row locking. Existing checks already accept assisted_capture provenance.

Legacy authenticates using an anon-key client carrying the caller JWT and
`getUser()`. The UID comes from verified auth, not input. It writes separately:

| Table | Legacy operations | Live authenticated grants / RLS |
| --- | --- | --- |
| wearable_provider_raw_payloads | insert/upsert, later status update | SELECT/INSERT/UPDATE/DELETE; owner SELECT, assisted-channel owner DML; Foundation trigger protects canonical evidence |
| wearable_health_imports | select by source_reference/type, insert/update, link readiness | SELECT only; dormant assisted owner DML policies |
| readiness_snapshots | select latest by user/provider/date/channel, insert/update merged metrics | SELECT/INSERT/UPDATE/DELETE plus TRUNCATE/REFERENCES/TRIGGER; ALL owner policy |
| wearable_health_observations | delete prior observations, insert metric list | SELECT only; dormant assisted owner DML policies |
| wearable_sleep_sessions | upsert user/provider/channel/date | SELECT only; dormant assisted owner DML policies |
| wearable_hrv_nightly_summaries | upsert inside sleep branch | SELECT only; dormant assisted owner DML policies |

All six have RLS enabled. The four read-only wearable tables have no authenticated
DML privileges despite their old policies. Thus the deployed function can write
a raw row then fail on its next write: active deployment does not imply a working
contract. This was inferred from code/grants; no production write was attempted.
`anon` has no DML on these wearable tables, but legacy readiness retains
TRUNCATE/REFERENCES/TRIGGER grants. These unusual legacy grants are documented,
not expanded or silently remediated by this focused PR.

Legacy provenance is correctly specific: provider=garmin,
provider_mode=assisted_capture, ingestion_channel=chatgpt_assisted_capture,
api_product=ui_evidence, parser_version=assisted_capture_v1. Preserve the first
three semantics in the new workflow; use the canonical Foundation health
product/schema and versioned manual adapter evidence. Never label this as
aggregator/fitness_ai_connector or official_api/garmin_health_api.

Other legacy liabilities: open normalized/raw/assets/notes input; numeric
coercion; date regex with UTC-today fallback; no profile timezone; direct
Readiness merging; no preview/confirmation; nontransactional writes; mutable
raw upsert; optional source_reference dedupe; no stale correction protection;
observation delete/reinsert and some unchecked write errors. HRV persistence is
nested under sleep, so standalone HRV can miss its summary. Do not reuse this
orchestration or its permissive DTO. Reuse provenance, existing canonical
storage, adapter and Foundation archival/idempotency only.

## Substitution and migration

`20261014184601_manual_health_import_v1.sql`:

1. Replaces the canonical writer body with exactly one semantic change: allow
   the assisted_capture/chatgpt_assisted_capture pair. A regression test compares
   the old/new bodies. No projection algorithm change.
2. Adds the narrow transactional manual wrapper and service-only EXECUTE.
3. Drops 15 assisted DML policies on the four already read-only wearable
   tables and the raw table, closing the legacy orphan-raw write path on rollout.
   Owner SELECT, RLS and table grants remain. Service-role raw writes, Readiness
   and FIT are untouched.

The legacy Edge Function is neither deployed, modified nor deleted in this PR.
No compatibility adapter calls it. The new endpoint is a replacement, not a
compatibility expansion of its open input. After separately approved rollout:
apply migration, deploy new endpoint/UI, verify with controlled user action,
observe actual callers, then retire the legacy endpoint in a separate authorized
operation. Audit any orphan raw evidence before cleanup; do not delete/backfill
it automatically. Do not restore broad client DML as a rollback strategy.

## Cost and invariants

Incremental cost of this work: **0.00 EUR**. No paid API, OpenAI call, Fitness AI
Developer Option, subscription, new Supabase branch/project or billable
infrastructure. Tests use disposable local resources and synthetic users.
The feature uses existing Supabase runtime only upon explicit user requests;
future traffic still depends on existing quotas (no paid capacity authorized).
Fitness AI server transport stays UNAVAILABLE, scheduler DISABLED,
garmin-daily-sync nonoperational, MCP writes DISABLED. No Remote MCP.

Residual risks: user transcription is untrusted/user-verified rather than a
provider attestation; summaries intentionally cannot replace series or another
transport; existing Readiness privileges and endpoint drift persist
until separately retired; deployment smoke testing is deferred because this PR
must not deploy production. Tokens do not prove a human saw the screen; they
bind an authenticated explicit apply to the reviewed payload, and are never
exposed as model-callable write tools.

## Files changed

- `docs/manual-health-import-v1.md`
- `e2e-local/bootstrap-transactional-actions.mjs`
- `e2e-local/supabase/config.toml`
- `e2e/manual-health-import.spec.js`
- `src/components/ManualHealthImport.jsx`
- `src/health/garminSource.d.ts`
- `src/health/garminSource.js`
- `src/health/healthEvidence.js`
- `src/health/manualHealthImport.js`
- `src/health/manualHealthPresentation.js`
- `src/main.jsx`
- `src/styles.css`
- `supabase/config.toml`
- `supabase/functions/_shared/manualHealthImportHandler.js`
- `supabase/functions/manual-health-import/index.ts`
- `supabase/migrations/20261014184601_manual_health_import_v1.sql`
- `supabase/verification/manual_health_import_v1.sql`
- `tests/coach-context-supabase-schema.test.mjs`
- `tests/fixtures/health-foundation-live-schema.sql`
- `tests/manual-health-import.test.mjs`
- `tests/transactional-actions/manual-health.test.mjs`

## Validation results

Completed locally before the workspace pause, with Node 22:

| Check | Result |
| --- | --- |
| `npm test` | 682 passed, 0 failed, 0 skipped |
| `npm run test:coach-evals` | 27 passed |
| Focused manual import tests | 12 passed (included in full suite) |
| Transactional PostgreSQL suite | 33 passed, 0 skipped; independent connections and lock barriers |
| Full Chromium E2E suite | 33 passed against local Auth, PostgREST, Edge Functions and PostgreSQL |
| `npm run build` | Passed, 1,669 modules |
| `git diff --check` | Passed |
| Local catalog verification | Closed search paths; invoker functions; service-role-only execute; owner SELECT/RLS retained |
| Browser bundle secret check | No service-role key reference or preview signing implementation |

The build retains the existing >500 kB chunk warning (536.07 kB JavaScript,
164.85 kB gzip). Local Edge tests use the repository's bundled runtime preparation;
the native deployed import graph and production smoke test remain untested because
production deployment is explicitly out of scope. No production writes were used
for validation.

The local Docker storage driver required flattening the official Supabase
PostgreSQL image while preserving its filesystem and runtime configuration;
this used only the existing local workspace. No paid service, plan or additional
billable infrastructure was provisioned. Temporary test logs did not survive the
workspace pause; the results above were observed before the pause.

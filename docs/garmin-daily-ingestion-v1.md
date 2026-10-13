# Garmin daily ingestion V1

> Updated 2026-10-13: see [runtime/terms evidence](fitness-ai-runtime-audit.md) and [owned sync implementation](garmin-owned-sync.md). Paid personal developer access now exists; no verified free multiuser runtime is available. The new consent migration and concrete disabled binding supersede the prior `sourceForUser=null` state.

## Architecture and audited base

Based on origin/main ffde3e2b8eb275139fa6b99d62d1f2107379a238 (after #94).
No second Health pipeline and no new migration. The audited source, GarminAdapter,
loadHealthIntelligence, Health Evidence, Readiness and Closed Loop remain canonical.
The existing migration and inspected schema fixture are exercised locally.
No production query or deployment is required by this change.

```
server-owned authenticated Fitness AI transport
 → FitnessAiGarminSource (GarminSource contract)
 → ingestGarminDaily (server-only _shared)
 → GarminAdapter.normalize → validateCanonicalHealthRecord
 → fixed ingest_garmin_health_record(user UUID, canonical JSON)
 → wearable_* → loadHealthIntelligence → Readiness → Morning Coach
 → optional existing preview → explicit confirmation → existing plan action
```

`supabase/functions/_shared/garminDailyIngestion.js` lives next to the existing
persistence helper so privileged orchestration is outside the frontend import graph.
No table/RPC name or identity is accepted by the public request. Internal capabilities
receive trusted dependencies; they are not authorization endpoints.

## Transport blocker / default state

There is **no documented production server-callable Fitness AI transport** in the
repo or the available project configuration. A ChatGPT connector is not an ENQIDU
runtime credential. No URL, token, SDK, OAuth exchange or historical entitlement is
invented. `FitnessAiGarminSource` continues to accept `transport.getHealthSummary`.
Tests inject the existing sanitized live-shaped fixture, not a real remote call.

`garmin-daily-sync` is authenticated and **disabled** (`sourceForUser: null`). It
returns 503 `connector_runtime_unavailable` after auth and request validation,
without constructing the service client. No scheduler is enabled. A future adapter
must resolve the authenticated athlete's consented connection server-side, enforce
ownership, implement finite network deadlines, and classify transient errors using
`status` or `code`. It must not accept transport credentials or URLs from requests.

## Window, scope and provenance

Default: today plus yesterday. Configuration is server-only, integer 1–7 days.
Calendar identity comes exclusively from the persisted profile timezone (currently
Europe/Madrid). Days are calendar shifts, not elapsed 24-hour windows. Calls are
single-day because live series may omit a calendar date. Provider offsets describe
instants, never override the requested athlete date. No broad backfill.

Families: daily_health, sleep, hrv, stress, body_battery, spo2, heart_rate,
respiration. Missing records produce `no_data`, never zero. Real zero is retained
where valid under GarminAdapter's existing metric validation (zero heart rate is
invalid). FIT/activity samples are rejected by the daily service.

Every record must have exactly `provider=garmin`, `provider_mode=aggregator`,
`ingestion_channel=fitness_ai_connector`. This service rejects even internally
consistent official_api/garmin_health_api records. The underlying Foundation remains
ready for a separate future official source. Token-shaped fields are sanitized by
the existing source and rejected at the daily persistence boundary if still present.
No service key appears in frontend code or reports.

## Atomicity, retries and reconciliation

Policy B: independently atomic RPC per valid record/family. Validation or persistence
failure does not prevent other valid records from being saved. Source-page failure
has no valid page to normalize: mark that day's coverage failed and continue other
days. Already saved records remain valid. A failing conversion of the source envelope
is a page failure; the report never claims those missing families were successful.

At most four pages/day, 100 records/page, repeated cursor rejection. The RPC remains
the sole writer and owns natural-key identity and revision reconciliation:

- Same DTO twice: unchanged, no duplicate.
- Newer retrieved_at / same facts: unchanged; reconciliation watermark advances.
- Newer corrected facts: updated on the same logical import.
- Older source revision: ignored_stale, no overwrite.
- Omitted families: not ingested and not deleted. Within an included family, the
  existing RPC treats the canonical record as a complete family snapshot; this
  service does not reinterpret omission inside a snapshot as a patch.

Maximum three attempts (server configuration 1–3), backoff 100/200 ms. Retry only
HTTP 408/429/500/502/503/504, ETIMEDOUT/ECONNRESET/EAI_AGAIN and PostgreSQL
serialization/deadlock/resource-startup codes. No retries for auth, schema,
validation, unknown failures or provenance. An uncertain RPC response is safe to
replay through the same idempotent key. Recovered retries remain visible through retry_count and transient_retry warnings. No queues or external persistence.

## Output and operations

`garmin_daily_ingestion_v1`: date range, timezone, fixed provenance, records_seen,
inserted/updated/unchanged/ignored_stale/failed, retry_count, bounded per-day family_results,
latest_available_date, warnings and request_id. `failed` counts failed records plus
failed source operations; family `failed` counts record failures. A source operation
failure marks all affected family coverage failed without multiplying that counter.
Thus partial persistence and incomplete page coverage remain visible separately.
No raw payload, token, user UUID, SQL message or stack escapes.

Telemetry is only request ID, start/end, date range, counts, safe error codes and
duration. No health values or request authorization. Telemetry failure cannot change
an ingestion result. The endpoint returns this report only; the read tool supplies
the separately authenticated brief.

`get_health_ingestion_status` derives the last seven calendar days from imports:
last_success_at (successful retrieved watermark, **not a last batch success time**),
latest_calendar_date_seen, latest_available_date, today's families_present/missing.
No failed attempts are persisted: last_error_code is null when unknown, or a safe
status-read error. `attempt_history_available=false` makes this limitation explicit.
The sync report has current attempt failure details. No new status table.

## Scheduling investigation (2026-10-12)

| Option | Verified evidence | Decision |
| --- | --- | --- |
| Existing native mechanism | No cron entries in vercel.json; no schedule in .github/workflows/ci.yml; no committed connector runtime | No existing job to reuse |
| Vercel Cron | [Current pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing): included all plans; Hobby once daily with up to 59 min precision; Functions quotas apply | Actual project plan/quota not verified; repo is Vite, no callable connector. Disabled |
| Supabase Cron | [Cron docs](https://supabase.com/docs/guides/cron) describe pg_cron and HTTP/SQL jobs; [pricing](https://supabase.com/pricing) has Free quotas | Extension availability in this project, remaining quotas and secure connector execution not verified. Disabled |
| GitHub Actions | Repo verified PUBLIC; [billing docs](https://docs.github.com/en/billing/concepts/product-billing/github-actions) include standard public runners free | Technically an option after transport/identity resolution; no scheduled workflow or secret introduced |

A scheduler cannot solve the missing transport. Neither a paid upgrade nor a new
cloud branch is justified. Domain invocation is `runAutonomousMorning`; scheduling
is a separate rollout decision. Any future UTC cron must compute the profile date
at execution and account for Europe/Madrid DST; it must not pass a UTC calendar day.

## Security and rollout

1. Review code, new deterministic policy and local test evidence; merge separately.
2. Confirm existing production Foundation RPC contract with the rollout operator.
   No migration is included or expected.
3. Release read-only Morning Coach/tools/UX through the normal reviewed deployment.
4. Resolve and audit a production transport and per-athlete ownership/consent binding.
5. Validate one authenticated manual server operation and its safe report; verify
   repeat/correction behavior and unchanged plan/FIT history.
6. Only then verify actual free-plan quotas and approve a scheduler separately.

Codex does not deploy any of these steps. No production secrets, migrations,
Edge deploy, manual Vercel deploy or scheduled job. Incremental services cost for
this delivered disabled implementation: **€0.00**. Running future jobs is not claimed
free without checking account quotas and the connector's actual terms.

Rollback: revert the application/function changes, leave scheduler disabled, and
keep canonical Health rows. No destructive data rollback, FIT rewrite, new table
or grant is involved. Existing preview fingerprints/revalidation protect concurrent
plan changes; no Morning operation calls apply.

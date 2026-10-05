# Health Intelligence V1

`health_recovery_v1` is the read-only Health Evidence contract of ENQIDU Core. It is shared by Coach Context, Closed Loop and future Tools/MCP consumers. Pure projection belongs in `src/health/healthEvidence.js`; authenticated loading belongs in `loadHealthIntelligence.js`. The JavaScript entrypoint `src/health/index.js` and companion declarations expose these contracts without UI dependencies. No transport, model, schema change or production activation is added.

## Observed evidence contract

```ts
{
  schema_version: "health_recovery_v1",
  calendar_date: "2026-10-05", // requested athlete day
  timezone: "Europe/Madrid", // explicit athlete profile zone
  temporal_scope: "calendar_day",
  status: "available" | "partial" | "unavailable",
  freshness: "current" | "recent" | "stale" | "unavailable",
  generated_at: string | null,
  evidence_dates: string[], provenance: HealthProvenance[],
  evidence_quality: "complete" | "partial" | "unavailable",
  missing: string[], issues: string[],
  sleep?, hrv?, body_battery?, stress?, heart_rate?, spo2?, respiration?,
  readiness? // derived ENQIDU contract, not provider evidence
}
```

All families carry their own `calendar_date`, `observed_date`, `freshness`, safe `provenance`, `source` and `field_sources`. `observed_date` is a compatibility name for the family calendar date; it does not invent an observation timestamp. `field_sources` identifies the precise table, record/key, date and provenance behind each exposed metric. This matters when Body Battery current comes from a sample while charge/drain comes from a daily summary. Only an actual sample supplies `current_observed_at` and `temporal_scope="instant"`; daily summaries have day scope.

| Family | Exposed canonical values |
| --- | --- |
| Sleep | `duration_seconds`, `sleep_score`, `deep_seconds`, `light_seconds`, `rem_seconds`, `awake_seconds`, `sleep_start_utc`, `sleep_end_utc` |
| HRV | `last_night_avg_ms`, `last_night_5min_high_ms`, optional `readings_count` |
| Body Battery | `current`, `charged`, `drained`, optional `current_observed_at` |
| Stress | `average`, `max`, `qualifier` |
| Heart rate | `resting`, `min`, `max` |
| SpO2 | `average`, `min` |
| Respiration | `average`, `min` |

Absent/null/invalid fields are omitted, never filled with zero. Valid zeros are retained. Physiologically invalid heart-rate zero and negative sentinel values are rejected, following the existing Foundation validation bounds. There is no canonical `body_battery_morning` column, so V1 does not expose or infer morning Body Battery. HRV is not inferred from heart-rate samples. `readings_count` counts valid persisted samples linked by the selected summary ID, with owner and as-of limits. This derived count has `readings_count_method="canonical_linked_valid_samples"` and a field source pointing to `wearable_hrv_nightly_samples`, the linked summary ID and as-of instant. Zero means no persisted valid linked samples even if the summary contains an average; it is not a provider-reported device counter or expected cadence. A failed count is omitted, not reported as zero.

## Canonical sources and selection

Daily, sleep and HRV use `wearable_health_daily`, `wearable_sleep_sessions` and `wearable_hrv_nightly_summaries`. Sleep can legitimately carry canonical HRV, resting HR, SpO2 and respiration even when the daily row contains only steps. Sleep-scope fallback is marked with `scope="sleep"` where appropriate.

Foundation stores independent stress, Body Battery, heart-rate, respiration and SpO2 summaries in `wearable_health_imports.normalized_payload`, as documented in [the Foundation contract](garmin-health-contract.md). The loader selects only JSON subfields `schema_version`, `data_type`, `calendar_date`, `metrics`, and `provenance`, plus safe relational identity columns. It never fetches the full envelope, `evidence`, `source_dto`, raw provider payload or credentials. The projection then allowlists only canonical measurement fields, checks the Foundation version and agreement with relational date/provenance, and drops every unknown property. A future official source uses the same persisted model.

Selection is deterministic: take the newest snapshot within each source stream, then the newest available family date. On the same date an explicit Foundation family summary takes precedence over the daily aggregate; nightly HRV summary takes precedence over sleep HRV; daily summary takes precedence over sleep-scope fallback. A latest empty/null correction never revives an older value in that stream. Independent streams remain separately eligible. Conflicting same-date peers in a stream are excluded and reported as `ambiguous_<family>` rather than arbitrarily selecting one source. A latest valid Body Battery point can supply current without deriving an unqualified average or daily extrema from sparse samples.

The remaining stress, respiration, SpO2 and heart-rate sample tables are not turned into daily averages from an incomplete series. Their canonical summary envelopes are used instead. FIT/activity samples and raw payload tables are unchanged.

## Freshness and athlete time

| Age by canonical calendar date | Freshness |
| --- | --- |
| Same athlete day | `current` |
| One or two calendar days earlier | `recent` |
| Three or more calendar days earlier | `stale` |
| Missing, invalid or future date | `unavailable` |

Top-level freshness describes the newest exposed family; it does not override family freshness. Readiness only uses factors whose own date is the requested athlete date and whose own freshness is current. Recent/stale values can be shown as dated history, never described as today's observation.

Calendar helpers reuse `src/time/userCalendar.js`. The profile timezone is explicit and mandatory; browser, Work/process timezone and UTC do not decide the athlete day. UTC sample bounds are computed for that IANA calendar day, including Madrid's 23-hour spring and 25-hour autumn DST days. When `generatedAt` is supplied, later samples and future reference days are excluded even in pure domain calls. A historical request re-evaluates its dated snapshot; it does not claim that historical evidence is current today. Without an as-of instant, the pure contract evaluates the supplied day only; production Coach always supplies its server instant.

## Quality, security and operational limits

`available/complete` means all seven families have current evidence and no read/selection issues; `partial` means at least one family is missing, older, or affected by a read issue; `unavailable` means no observed family. Completeness is family coverage, not a promise that every optional biometric exists or a clinical quality measure. Persisted confidence is retained in safe provenance. Readiness excludes explicitly estimated, calculated, OCR-unverified and unknown observations; absent legacy confidence is not upgraded to reported confidence.

The loader requires a nonempty authenticated `userId` before querying, includes owner and date limits on every read, and verifies returned ownership defensively. It uses the caller's authenticated/RLS client. The pure projector rejects owned rows unless the matching user is supplied; projected fixtures without owner columns are allowed. Service-role credentials, provider raw, arbitrary model mutation, broad grants and frontend write access are not added.

Each source's preceding 28-day history is paginated in 200-row pages, at most five pages per group. Exceeding the cap fails that group closed. If a group has no recent observations, a bounded latest-date group is returned for honest stale display. Individual family failures do not erase successful families; only safe `read_unavailable_*` issue codes are exposed. Provider/database error messages are not returned. Multiple Closed Loop dates reuse this loader with bounded assessment/date caches; a single batched multi-date loader remains a performance improvement for a later epic.

Results are calculated and returned only. No migration, table, column, RLS/grant change, RPC, write, Edge Function deployment or paid resource is created. No diagnosis, medical contraindication, causal inference, plan adaptation or Health Foundation/FIT rewrite is performed.

Tests: `tests/health-intelligence-v1.test.mjs` and `tests/health-intelligence-security.test.mjs`. See [Readiness V1](readiness-v1.md) and [Closed Loop V1](closed-loop-v1.md).

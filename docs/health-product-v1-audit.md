# Health Product V1 — objective-data audit

Date: 2026-10-05  
Scope: browser Health UI over the canonical `wearable_*` model. This audit does **not** change FIT/activity ingestion, readiness logic, RLS, or database schema.

## Product rule

The Health surface must distinguish three layers:

1. **Observed provider data** — Garmin health values persisted in ENQIDU.
2. **Canonical ENQIDU representation** — normalized fields/timestamps/units in `wearable_*`.
3. **Derived ENQIDU interpretation** — readiness/coaching conclusions, which must be explicit, versioned and evidence-backed.

V1 of this change only renders layers 1–2. It does not invent or infer recovery/readiness.

## Current persistence → query → display matrix

| Family | Canonical persistence | Queried by app | Displayed now | Notes |
| --- | --- | --- | --- | --- |
| Daily health | `wearable_health_daily` | Yes, latest authenticated-athlete row | Yes | Body Battery, resting/min/max HR, stress avg, SpO2 avg, respiration avg, steps can surface from observed data. |
| Sleep | `wearable_sleep_sessions` | Yes, latest row | Yes | Score/duration/stages only when present. No fabricated stage pattern. |
| HRV nightly | `wearable_hrv_nightly_summaries` | Yes, up to 28 rows | Yes | Raw nightly average + observed trend. No synthetic baseline/status threshold. |
| Body Battery samples | `wearable_body_battery_samples` | Yes, up to 96 rows | Yes | Observed series only; no generated fallback curve. |
| Stress samples | `wearable_stress_samples` | Yes, up to 96 rows | Yes | Latest/min/max/count are shown from observed persisted samples; no interpretation threshold is applied. |
| Respiration samples | `wearable_respiration_samples` | Yes, up to 96 rows | Yes | Latest/min/max/count are shown from observed persisted samples. |
| SpO2 samples | `wearable_spo2_samples` | Yes, up to 96 rows | Yes | Latest/min/max/count are shown from observed persisted samples. |
| Heart-rate samples | `wearable_heart_rate_samples` | Not currently queried by Health page | Daily summary only | Fine-grained Health HR series is not yet a Health-page feature. Activity HR remains sourced through FIT/session data. |
| Body composition | `wearable_body_composition_measurements` | Not currently queried by Health page | No | Canonical foundation supports it, but the provisional Fitness AI bridge intentionally does not claim unsupported body-composition input. |
| Vendor insights | `wearable_vendor_insights` | Not currently queried by Health page | No | Keep separate from raw observed metrics unless an observed Garmin/Fitness AI capability is proven. |

## Changes in this block

- Scope the latest daily-health query explicitly to the authenticated athlete.
- Query provenance needed to label the source honestly (`provider`, `provider_mode`, `ingestion_channel`).
- Remove the old synthetic Health readiness score and training recommendation from the Health page.
- Remove fabricated fallback Body Battery curves, HRV trends and sleep-stage visuals.
- Stop using arbitrary visual scores for resting heart rate and HRV status.
- Render health progress bars only when the underlying metric has a meaningful bounded scale.
- Clear stale in-memory daily health if the current athlete has no row.
- Preserve actual Garmin/Fitness AI provenance labeling without calling the aggregator path the official Garmin API.

## Not in this block

- No database migration.
- No change to Fitness AI runtime transport/auth.
- No change to FIT activity ingestion or activity detail.
- No readiness algorithm.
- No Coach behavior changes.
- No production write path.
- No paid API or resource.

## Next Health Product increment

Stress, respiration and SpO2 sample summaries are now covered by the next Health Product increment. The following safe step is to decide whether fine-grained heart-rate health samples or additional canonical daily fields deserve first-class UI, while keeping activity heart rate sourced from FIT/session data. Derived readiness should only be introduced later behind an explicit evidence contract and versioned algorithm.

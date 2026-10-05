# Health Intelligence V1

## Contract

`health_recovery_v1` is the channel-independent, read-only evidence contract consumed by Coach and future ENQIDU Tools. `src/health/healthEvidence.js` projects only persisted canonical fields from daily health, sleep and nightly HRV records. Missing values are omitted; zero remains an observed value. Raw provider payloads are never projected.

Every result records the athlete calendar date, profile timezone, evidence dates, quality, missing domains and provenance. Fitness AI evidence is identified as `garmin / aggregator / fitness_ai_connector`; future official evidence remains separately identified as `garmin / official_api / garmin_health_api`.

## Freshness

Freshness compares ISO calendar dates, already resolved in the profile timezone: same day is `current`, one or two days old is `recent`, older is `stale`, and invalid/future/missing dates are `unavailable`. Stale observations may be displayed as history but are not current readiness input. Calendar resolution belongs at the authenticated server boundary; browser timezone is not authoritative.

## Security and limits

The shared loader always applies `user_id` and a maximum calendar date to each RLS-protected query. It uses the caller's JWT Supabase client, not a browser service-role key. This release does not diagnose illness or injury, infer missing Garmin measurements, persist derived readiness, or change ingestion/FIT records.


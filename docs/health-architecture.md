# Health architecture

Health Foundation is ENQIDU's single biometric persistence boundary. Garmin health
is separate from FIT activity and executed training evidence.

- `GarminSource`: vendor-independent canonical source contract.
- `FitnessAiGarminSource`: provisional aggregator bridge; authenticated transport
  injected at the server boundary. Provenance remains garmin / aggregator /
  fitness_ai_connector.
- `GarminAdapter` / `normalizeGarminHealthRecord`: sole normalization/validation.
- `_shared/garminDailyIngestion`: bounded calendar batch, isolated atomic records,
  safe reporting/retry. The fixed service-role-only RPC is the sole writer.
- Existing `ingest_garmin_health_record`: natural-key reconciliation and wearable_*
  projections, existing RLS and no client mutation grants.
- `loadHealthIntelligence` → Health Evidence → existing Readiness: owner-scoped
  canonical reads, no transport envelopes or fabrication.
- Existing Closed Loop compares explicit planned/executed links; it never rewrites
  activities. Morning Coach consumes that evidence and persisted plans.
- Existing tool previews/actions remain the sole explicit plan-change flow.

No new schema, paid API, queue, cloud branch or deployment is introduced.
See [daily ingestion](garmin-daily-ingestion-v1.md),
[Morning Coach](morning-coach-v1.md), [Health Intelligence](health-intelligence-v1.md),
[Foundation audit](health-foundation-audit.md) and [Tools](enqidu-tools-v1.md).

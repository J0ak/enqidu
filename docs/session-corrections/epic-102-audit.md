# #102 — audit before implementation

Base fetched on 2026-10-18: `4774349d2529943ec5b3c2afe0c5b1cd353a59bb`, identical to the requested base. Production project: Enqidu (`rdduqsziboqxlgeqouxq`). All production inspection was SELECT only.

See the [final contract](epic-102-contract.md), [validation](epic-102-validation.md),
and [reproducible SELECT queries](epic-102-audit.sql). Counts and golden sessions
were checked again after implementation, with the same results. The final migration
tightens authenticated exercise UPDATE/DELETE privileges; the baseline below records
the audited pre-existing permissions.

## Existing writers and decision

| Path | Authority / atomicity | Decision |
| --- | --- | --- |
| `session-correction-preview/apply`, `_shared/sessionCorrection.ts` | JWT user, authenticated table CRUD; separate enrichment upsert, deletes and inserts; no expected-state check | Retire writes with an authenticated deprecated response. Keep historical documentation/data. No UI caller was found. Two historical events affect one session, 2026-07-01. |
| `capture_training_semantics_v1` | SECURITY INVOKER, authenticated; atomically inserts an idempotent source for an explicit FIT session; #100 arrival trigger may reconcile it | Not a granular correction. Retire new authenticated capture calls; route visible capture to the new Tools editor. |
| `persist_conversation_enrichment`, `chatgpt_pilot_apply_capture` | Already revoked from authenticated/service_role by #100; latter is legacy SECURITY DEFINER | Leave revoked. |
| `reconcile_training_day_v1` / rollback | Service-only INVOKER transaction, shared athlete advisory lock, provenance ledger; trigger uses existing narrowly scoped definer | Reuse its lock ordering, not its matching or materialization. Corrections have explicit IDs and must not trigger reconciliation. |
| `apply_enqidu_action_v1` (#94) | Service-only INVOKER, expected-state comparison under locks | Reuse the Tools auth, preview/confirmation/readback pattern; a separate narrow semantic RPC is required because its closed command union only covers planning. |
| `persistQuickTrainingEdit` / missing-fields editor | Authenticated multi-DML into experimental universal tables; SELECT confirms `performed_sets`, `performed_metrics`, `item_exercises`, `block_items` do not exist in production | Remove the dead UI writer and helpers; canonical detail editor is the sole correction entry point. Preserve read display. |
| FIT ingestion / `insertSessionExercises` in main | Existing authenticated ingestion writes | Preserve transport/physiology; not a correction entry point. |
| `temporalReconciliationService` | Existing direct block temporal updates | Outside semantic patch; preserve. |

Current RLS is enabled on all seven inspected tables. Authenticated has owner-scoped CRUD on exercises, blocks, metrics, links and enrichments; sources/sessions have INSERT/UPDATE/SELECT. No new client grants are needed. Service role currently lacks source INSERT, enrichment SELECT/INSERT and semantic exercise UPDATE: only the exact privileges needed by the new INVOKER transaction will be added. Existing broad TRUNCATE/REFERENCES/TRIGGER grants are pre-existing, not introduced here.

## Production evidence

722 exercises; 74 names exactly `Unknown`; 341 nonempty reps arrays (this initial count does not prove numeric compatibility); 334 non-null loads; **0 exercise UUIDs**. Sources: 60 manual_entry, 108 garmin_fit, 10 jotason_json. 49 sessions have FIT plus another source. SQL `exercise_catalog` has **0 rows**; frontend catalog uses slugs, SQL FK uses UUIDs. Safe canonical UUIDs therefore require explicit catalog seeds, without historical backfill. Existing `resolveExerciseAlias` has a substring fallback; correction identity must use an exact-only resolver.

Golden SELECT results:

| Date | Session | Blocks / exercises / links |
| --- | --- | --- |
| 21/07 | Armadura técnica – Core, glúteo y hombro | 5 / 21 / 2 |
| 07/10 | Aconcagua — HYROX | 6 / 14 / 2 |
| 14/10 | reconciled Aconcagua (persisted title HIIT) | 6 / 14 / 2 |
| 15/10 | Fuerza | 0 / 4 / 1 |
| 15/10 | Pilates | 0 / 1 / 1 |

#101 can consume explicit reps/load from canonical exercises already. Omitted/planned rows require exclusion from executed observations; numeric zero and kg_each must retain existing arithmetic. No alternative volume algorithm is needed.

## Minimal architecture

Closed semantic operations, explicit canonical session ID, bounded read/preview/apply Tools. One service-only INVOKER apply with locks and expected revision; no replacement of existing blocks or sessions. Append one manual supporting source and one before/after enrichment per accepted command. Retry identity is the preview fingerprint; immutable history makes retry distinguishable from stale state. FIT primary and all physiology remain untouched. No new tables, paid dependencies, model calls or production migration execution.

Refined numeric audit: **242** arrays contain only explicit nonnegative integers; 341 merely had a nonempty array. **42** sessions have specifically FIT + manual_entry (49 includes other supporting types). Golden week 12–18/10: 32 exercises, 18 Unknown, **0** compatible numeric reps arrays. No production mutations were used to obtain these results.

Production security advisors, read-only baseline: existing `training_reconciliation_events` RLS-with-no-policy informational finding (service-only ledger); existing `set_garmin_sync_consent` authenticated SECURITY DEFINER warning; existing leaked-password-protection warning. No production configuration was changed. Remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy ; https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable ; https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

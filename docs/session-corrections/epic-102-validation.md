# #102 validation — 2026-10-19

Base: `4774349d2529943ec5b3c2afe0c5b1cd353a59bb` (real fetched origin/main;
unchanged on the final fetch). Branch: `codex/102-canonical-training-semantics`.
Node 22, disposable local Supabase/PostgreSQL 17 and Chromium. OpenAI disabled.

| Exact command | Result |
| --- | --- |
| `npm test` | 826 passed, 0 failed/skipped |
| `npm run test:coach-evals` | 28 passed |
| `npm run test:transactional-actions` | 37 passed, including 4 semantic concurrency/rollback tests with real PostgreSQL connections |
| `node scripts/test-reconciliation-postgres.mjs` | 43 passed in an isolated real PostgreSQL database |
| `node scripts/test-semantics-postgres.mjs` | 7 passed in an isolated real PostgreSQL database |
| `node --test tests/semantic-tools-runtime.test.mjs tests/semantic-corrections.test.mjs` | 35 passed; final read-contract metadata included |
| `npm run test:e2e -- --workers=1` | Full suite: 43 passed |
| `npm run build` | Passed; existing Vite >500 kB chunk advisory |
| `supabase --workdir e2e-local db lint --local --level warning` | No findings in new semantic functions; existing findings listed below |
| `git diff --check` | Passed |

Local PostgreSQL commands require `ENQIDU_TRANSACTION_LOCAL=1` and the loopback
database credentials from `supabase --workdir e2e-local status -o env`. The isolated
database runners reject non-loopback URLs and unexpected database names. The CI
workflow installs the semantic migration after the existing #94/#100 bootstraps and
runs both PostgreSQL runners before the full E2E suite. No production apply was used.

## Acceptance evidence

- **A:** existing FIT activity, initially Unknown. Coach adds explicit RDL,
  `[8,8,8]`, 45 kg after reviewed confirmation. Same session ID and activity count;
  original FIT source, raw payload, session duration/physiology, laps, samples and
  metrics compare unchanged. Existing #101 volume calculation returns **1080**.
- **B:** `[10,10,10]` → `[10,10,9]` preserves identity, 40 kg and other exercises.
- **C:** omission keeps the exercise row and audit history; Progress and Weekly
  exclude it from performed observations.
- **D:** Fuerza + Pilates on one date require explicit selection. Cancellation
  leaves canonical state unchanged. No title/modality heuristic selects a writer target.
- **E:** Auth A/B isolation through RPC/Tools and browser logout/login; authenticated
  users cannot execute the writer, call retired capture or update/delete exercises.
- **F:** intervening update rejects a stale preview, including a real blocked-row
  race; browser shows review-again and disables stale confirmation.
- **G:** concurrent identical apply yields one durable event plus a replayed receipt.
  Competing previews serialize; one succeeds and one becomes stale. Injecting failure
  at the last enrichment insert rolls back exercises, blocks, sources and links.
- Tampered owner/channel/operations/revision are rejected. Readback failure retains
  a successful apply receipt. MCP semantic writes fail even with its old write gate
  enabled; read/preview works without a service credential.
- Coach and detail editor run at **390 px**, without overflow. The actual
  `coach-reply` Edge route is deterministic with `llm_used=false`, `usage=null`.
  Reload retains corrections and the per-user Coach receipt. Canonical renamed
  exercises win over old block prescription names in activity detail.

The original #94–#101 test suites remain included. Reconciliation fixtures remain
green. Production SELECT audit independently confirmed 21/07 **5/21/2**, 07/10
**6/14/2**, 14/10 **6/14/2**, and separate Fuerza/Pilates on 15/10. See the
[production audit](epic-102-audit.md) and its [read-only queries](epic-102-audit.sql).

## Historical identity continuity

The review-blocker follow-up reran every required command above. The 18 dedicated
`tests/progress-catalog-continuity.test.mjs` cases verify exact catalog ID/code/name/
alias resolution, historical NULL IDs, Unknown,
ambiguous aliases, no fuzzy matching, preserved comparison dimensions, catalog
pagination/failure bounds, tenant scope, and shared 4/12/52-week comparisons.

The additional real PostgreSQL/Edge E2E confirms a correction on the existing
session persists the RDL catalog UUID, then compares `[10,10,10]` at 45 kg against
historical `Peso muerto rumano`, NULL ID, `[8,8,8]` at 45 kg. Progress reports
**8 → 10 reps at 45 kg**; Weekly records and highlights agree. The historical row
and all read snapshots remain unchanged, and tenant B receives no observations.
No backfill, migration, additional grant, or production write is required for this
follow-up. The catalog SELECT grant already belongs to the original #102 migration.

Unresolved or ambiguous labels retain their normalized reported-name identity;
Unknown remains unidentified. Catalog deactivation does not erase historical
identity. More than 2,000 catalog rows or a failed read produces an explicit error
instead of silently using a partial alias index.

## Existing advisory findings and remaining limits

Local lint retains existing warnings in `get_ai_coach_context` (unused parameters),
`ingest_garmin_health_record` (initializer casts), `reconcile_training_day_v1`
(initializer cast/unused variables), and `training_reconciliation.instant`
(volatility declaration). Production security advisor baseline is in the audit.
No semantic function introduces a new lint warning or SECURITY DEFINER function.

Language coverage is deliberately bounded; unsupported text uses clarification or
the editor. Oversized sessions fail closed. Unknown identification is explicit;
there is no historical backfill. Rollout requires the migration and application/
Edge release together; neither has been applied to production by this PR.

Incremental cost **€0.00**. No new product dependencies, paid models, subscriptions
or infrastructure. No merge or deployment was performed.

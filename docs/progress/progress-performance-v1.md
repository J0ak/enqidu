# #101 — Progress & Performance V1

Base: origin/main `0e5a634e606033466ae6a53a933439abed7accdc`.
Production audit: 2026-10-17, project `rdduqsziboqxlgeqouxq`, SELECT only.

## Data quality audit

| Canonical evidence | Observed coverage | V1 decision |
| --- | --- | --- |
| session_exercises | 716 records; 430 distinct lower/trim names | Conservative name grouping, no ontology/translation |
| exercise_id | 0/716 | Fall back to trivially normalized reported_name |
| load_value | 328/716 | Missing remains null; real zero retained |
| load_unit | 311/716 | Units remain separate, no conversions |
| reps_per_set | 457 SQL non-null (includes JSON null) | Only nonempty arrays of nonnegative integer numbers |
| numeric arrays | 242/716 | Observed reps; never text/object interpretation |
| volume candidates | 88/716 with numeric arrays + load + supported mass unit | Known partial volume, never inferred sets/rounds |
| sets_completed / rounds_completed | 515 / 158 | Context only, no multiplication of incomplete reps arrays |
| sessions | 113 incl. 1 archived; 112 completed/recorded | Count canonical session IDs once; exclude archived |
| duration / distance / elevation | 107 / 95 / 2 non-null records | Explicit known coverage; no physiological invention |
| relational modalities | 8 hybrid, 1 swimming, 104 null | Existing canonical modality wins, then fixed observed FIT sport/sub_sport fields |
| FIT modalities | 47 strength, 10 Pilates, 3 running, 7 cycling, 2 swimming, 9 hiking, 6 hiit, 18 numeric sport codes, 11 absent | Do not infer trail from hiking, hybrid from HIIT, or decode unknown numeric codes |
| planning | 57 persisted plans, 29 links, 6 modified (1 linked), 1 skipped | Only owned persisted canonical links establish execution |

The coverage audit spans the canonical tables (including the archived record); product reads exclude archived records. Numeric array/volume counts are candidates, not a claim that every exercise has complete session volume. Object reps include `per_side`, `reps_per_round`, distance arrays/ranges; V1 intentionally does not expand these.

### Production golden evidence (read-only)

| Date | Activity | Blocks | Exercises | Sources |
| --- | --- | ---: | ---: | ---: |
| 2026-07-21 | Armadura técnica – Core, glúteo y hombro | 5 | 21 | 2 |
| 2026-10-07 | Aconcagua — HYROX | 6 | 14 | 2 |
| 2026-10-14 | HIIT / reconciled Aconcagua | 6 | 14 | 2 |
| 2026-10-15 | Fuerza | 0 | 4 | 1 |
| 2026-10-15 | Pilates | 0 | 1 | 1 |

The 14/10 plan is modified and unlinked. The 15/10 strength plan is confirmed and linked. No production records were written or reinterpreted.

## Architecture and contract

Existing contracts audited: `fetchActivityPeriod` (paged Activity browser projection, includes unnecessary payload), `get_recent_training` (bounded 20-session summary), `get_training_session` (one-session detail), `get_week_plan` (one week), Closed Loop (rich assessments + Health, not suitable for aggregating years). None supplies complete exercise progress efficiently.

New **read-only tool** `get_progress_performance_v1` in the existing authenticated `enqidu-tools` backend. No new RPC, endpoint, schema, table, index, permission, cache or infrastructure. Uses the same auth/profile-timezone constructor and closed schemas. Arguments: period `4|12|all`, modality, exercise_page, skills_only. No user ID, date, table name, SQL or write argument accepted. MCP writes remain disabled.

`src/progress/loadProgress.js` selects only needed columns, keyset-pages by primary key (250 rows), scopes parent reads by authenticated user and children by owned parent IDs. Period reads include the preceding comparison period and fixed consistency window. Cross-day linked executions are read by persisted ID. All history is explicit via `all`; no 100-session functional limit. Resource guard: 50,000 rows per paged read fails explicitly rather than returning truncated metrics; existing runtime output guard is 128 KiB.

`src/progress/domain.js` is deterministic/pure. Full contributors are retained internally in the domain output (`session_ids`, exercise/session IDs, plan links). Transport contains 12 exercise variants per page and the latest 12 evidence records per metric/group; metrics still use the full selected evidence. `evidence_scope` declares sampling. Exercise pages are aggregated server-side; raw provider payloads never reach the browser. Skill pagination filters before paging.

Existing `(user_id,local_date)`, `(user_id,planned_date)`, `(session_id,block_id,exercise_order)` and primary key indexes support real queries. No speculative index added.

Home has a compact “PROGRESO · Ver evolución” entry to the same view. No duplicate calculation or extra Home request.

## Metric rules

- 4/12 weeks: complete Monday–Sunday periods ending before the current profile-calendar week. Previous period is equal length. `all` includes today and has no comparison trend. Fixed consistency chart includes current partial week, labelled explicitly.
- Session/minute trend: exact increase/equality/decrease, only if oldest recorded history reaches the prior window. Missing duration on either side disables minute trend. This is recorded-history coverage, not proof of wearable completeness.
- Exercise identity: structured ID when present, otherwise trim/case/spacing/accent normalization. Execution type, side, tempo and exact load unit remain separate. No DB bench/Press banca fusion.
- Volume = load × sum of explicit numeric reps array, for kg, lb, kg_each, kg_total, kg total, kg_external_discs separately. `kg_each` remains per implement; never doubled. No sets/rounds expansion. Totals and best-session volume are labelled **known**, potentially partial, not complete-volume PRs.
- Observed records: greater load or greater reps at the same load, compared with previous strictly earlier dates of the same identity/variant/unit. First observation is a baseline, not a PR. All records are **within the selected period**, not lifetime records. No estimated 1RM.
- Exercise trend: highest reps at the period's best observed load, at least two distinct sessions in each half of the complete selected period. Explicit bodyweight permits same-variant reps comparison; missing load does not imply bodyweight. No defensible comparison => insufficient_data.
- Skills: explicit bounded name classification (HSPU/pike, muscle-up, high pull, pistol, strict pull-up/dominadas estrictas); no user-specific data. Variants remain separate. Notes are context only.
- Cardio: canonical modality or observed FIT metadata only. Trail/running remain separate. Paired positive distance/time supplies aggregate observed pace. Distance/duration/elevation are known sums with coverage; no trail terrain adjustment or VO2max.
- Planning excludes cancelled/rescheduled/recommended/rest entries. Owned canonical links win even across dates. Explicit skipped is omitted; unlinked past/completed-status-only plans remain unknown. “Modified” means **persisted modified plan with canonical execution link**, not a new technical execution assessment. Plan section ignores modality filter (clearly labelled), because execution modality cannot identify a plan. No new date matching. Unknown without any canonical completion evidence => adherence absent.

## Screen and scope

Mobile-first dark cards, six destinations: Resumen, Fuerza, Skills, Resistencia, Consistencia, Plan vs ejecución. Summary shows sessions, known minutes, planned count, linked adherence, modality bars and comparable trends. Exercise cards show observed load, reps, exposure count, recent sequence, record improvements and expandable evidence/notes. Resistance keeps each sport separate. Consistency shows twelve weekly bars, duration, modalities and partial-week label. Loading, available, partial, insufficient_data, empty, error and signed-out states are explicit. All primary navigation remains accessible at 390 px.

Not implemented because evidence is insufficient: exercise ontology, object/text reps expansion, complete-volume claims for partial logs, load conversions, inferred trail classification, lifetime PR certification from partial periods, physiological estimates, automatic coaching recommendations.

No new dependencies or paid services. Incremental cost: **0,00 €**. Production unchanged; no merge/deploy. `vercel.json` disables automatic Git deployments only for this PR branch.

## Residual limits

- A read consists of multiple queries, not an immutable database snapshot. A concurrent edit can require refresh; no persistent cache is introduced.
- Very large histories are explicit `all` reads; server resource guard/output guard can reject them rather than fabricate partial totals. A future SQL aggregate contract may be appropriate beyond V1 scale.
- Canonical fields remain sparse; many variants correctly show insufficient_data. Changing a name/tempo/side intentionally separates observations.
- Plans report persisted modification, not a detailed reassessment of every block; existing Closed Loop remains authoritative for detailed planned-vs-executed analysis.
- Future release requires deploying the updated existing Edge Function together with the UI; this PR does neither.

## Validation and delivery

Validated locally with Node 22, the actual production-shaped schema/migrations in disposable PostgreSQL 17, and Chromium. The production project was used only for SELECT audits.

- `npm test`: 752 passing tests (13 Progress domain/loader regressions).
- `npm run test:coach-evals`: 27 passing evaluations.
- `npm run test:transactional-actions`: 33 passing tests in real local PostgreSQL.
- `node scripts/test-reconciliation-postgres.mjs`: 43 passing tests in real local PostgreSQL, including golden structures, tenant checks and separate same-day strength/Pilates.
- `npx playwright test --workers=2`: 37 passing E2E tests, covering Home, Coach, Health, Activities, canonical history and Progress.
- Final focused Progress E2E: 2 passing tests after mobile/accessibility refinements and observed-record deduplication.
- `npm run build`: passes; Vite reports a >500 kB bundle warning.
- `git diff --check`: clean.

All six UI states and section switches were exercised at 390 × 844 with no document overflow. A real JWT test verifies A/B isolation, Home navigation and unchanged canonical snapshots. Exercise card pagination uses all contributors for metrics. Repeated blocks at the same day's best mark do not multiply observed records.

Mobile captures (synthetic local evidence):

- [Authenticated app and navigation](screenshots/authenticated-390.png)
- [Summary](screenshots/summary-390.png)
- [Strength](screenshots/strength-390.png)

### Changed files

- `src/progress/{domain.js,loadProgress.js,schema.js,Progress.jsx,Progress.css}`: deterministic metrics, bounded read composition, contract and view.
- `src/enqiduTools/{readTools.js,readSchemas.js,registry.js}`: existing authenticated read boundary integration.
- `src/main.jsx`, `src/styles.css`, `src/components/HomeToday.jsx`: navigation, mobile layout and Home entry.
- `tests/progress-performance.test.mjs`: numeric/missing/zero, records, safe identity, skills, cardio, periods, consistency, canonical links, golden references, tenant scope and >100 pagination.
- `tests/{coach-tools-contract,enqidu-mcp,enqidu-tools-reads,enqidu-tools-runtime}.test.mjs`, `tests/support/enqiduToolsDb.mjs`: closed-registry expectations, read-only MCP parity and fixture schema.
- `e2e/progress.spec.js`, `e2e/progress-harness.jsx`: authenticated and visual regression coverage.
- `scripts/sql/audit_progress_performance_v1.sql`: reproducible read-only audit.
- `docs/progress/`: quality report, rules, limitations and screenshots.
- `vercel.json`: disable automatic Git deployments for this branch only.

No production migration, new RPC, paid dependency, scheduler, Garmin transport, FIT parser change, reconciliation change or production write. The existing GitHub CI uses standard hosted runners in this public repository; no additional paid CI infrastructure is introduced.

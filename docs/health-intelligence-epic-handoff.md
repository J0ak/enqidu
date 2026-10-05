# Health Intelligence + Closed Loop V1: integration handoff

## Source and scope

This epic starts from fetched `origin/main` at
`2b419e6423934fab4f07483bbc0f19f464544435`. The existing draft PR #92 is reused,
including its initial domain scaffold, rather than opening a duplicate epic.
The baseline full suite passed 421 tests before the completion work.

The audit uses the repository's inspected canonical schema, existing migrations,
Health Foundation/source contracts, training model, Coach context/actions and
confirmed session correction contracts. It does not assert a new production
schema inspection or a production deployment.

## Shared domain

```text
Garmin transport (provisional Fitness AI / future official API)
  -> existing Health Foundation -> canonical wearable persistence
  -> Health Evidence V1 -> personal Readiness V1
  -> authenticated Coach Context -> deterministic Coach

existing plan + exact linked execution + confirmed feedback + dated health
  -> Closed Loop Assessment V1 -> Adaptation Proposal V1 (read-only)

explicit user command -> existing server-validated Coach Actions -> persisted plan
```

The app and future ENQIDU Tools/MCP can reuse the pure domain functions and
authenticated loaders. They must not calculate a second readiness score or
accept an LLM's proposal as write authorization. This epic does not implement a
new MCP server or mutation endpoint.

The contracts and limitations are documented in
[Health Evidence](health-intelligence-v1.md), [Readiness](readiness-v1.md) and
[Closed Loop](closed-loop-v1.md). Observed provider indices and ENQIDU-derived
scores remain explicitly distinct; neither is a medical diagnosis.

## Persistence and security

Results are calculated on read. Version, evidence references/dates, personal
baseline inputs, missing evidence and reasons travel with the result so a caller
can reconstruct it using the same canonical snapshot, clock and algorithm.
No derived score or proposal is inserted into an existing table opportunistically.
Historical immutable derived snapshots would need a separately reviewed storage
contract; they are not part of this epic.

The security review checks authenticated ownership and exact execution links,
safe field-level provenance, secret/raw-payload canaries, and denied direct
authenticated writes. Final review also verifies pagination below PostgREST's
row cap, unknown completion on contradictory confirmed feedback, and temporal
eligibility shared by the pure core and database adapter. No model-generated
mutation path is added.

NO MIGRATIONS CREATED. No production schema, table, column, RLS, grant or SQL RPC
is changed. Local tests may bootstrap an isolated database from existing schema
fixtures and existing migrations; that is not a production migration.
No production deployment, Edge Function deployment, merge, paid model request,
upgrade or billable resource is authorized or performed by this task.

## Post-merge operations (not executed here)

Edge Functions affected: `coach-context`, `coach-reply`, `coach-plan-action`.
After reviewed merge and CI, deploy `coach-context`, then `coach-reply`, then
`coach-plan-action` from the same commit. The shared modules must be included by
the normal Supabase function bundler. There is no database deployment step.
Keep `OPENAI_COACH_ENABLED` disabled for the deterministic rollout.

Smoke tests should use an authenticated athlete with a valid profile timezone:

- Read context and verify `health_recovery`, top-level `readiness` and Closed
  Loop results expose only safe canonical evidence, or explicit unavailable data.
- Ask sleep, HRV, Body Battery, recovery and health-data questions; verify
  `response_mode=deterministic`, `llm_used=false`, `usage=null`.
- Verify a persisted session remains authoritative when readiness is low or
  unavailable; compare its persisted rows before and after read calls.
- Read an exactly linked execution and verify duration/matching evidence and a
  non-applied proposal. Confirm an unlinked past plan remains unknown.
- Verify another authenticated user cannot read the first athlete's evidence.
- Verify Madrid midnight and DST semantics with a browser in another timezone.

The provisional Fitness AI transport is still an external hookup documented in
[the source contract](fitness-ai-garmin-source-v1.md). This epic does not invent
an API, credential or live ingestion capability.

## Final local verification (2026-10-05)

| Check | Result |
| --- | --- |
| `npm test` | 486/486 passed; no skipped tests. |
| `npm run test:coach-evals` | 25/25 passed. |
| `npm run build` | Passed; Vite production bundle built. |
| `npm run test:e2e -- --workers=1` | 21/21 passed against disposable Supabase LOCAL, including three new vertical/security flows. |
| Independent final Closed Loop/Coach review | 32/32 focused tests passed; no material blocker left. |
| `git diff --check` | Passed. |
| Migration and dependency files | No changes from fetched `origin/main`. |

The E2E rebuild used the final unchanged Edge source bundled with the repository's
locked SDK, because this managed runtime could not trust the proxy certificate for
its native JSR dependency graph. TLS was not disabled. The actual local database,
canonical ingestion RPC, Auth/JWT, RLS and Edge handlers were exercised. Native
dependency bundling remains the ordinary CI/post-merge smoke path; no hosted CI
result or production smoke result is claimed here. Environment-specific recovery
steps and limits are in [the Playwright guide](playwright-e2e.md).

The new tests cover current/partial/absent/stale evidence, null and valid zero,
personal baselines and insufficient evidence, Madrid midnight/DST, Fitness AI and
future official provenance, deterministic Coach, persisted-plan authority,
execution identity/conflicts/volume/feedback/FIT, unapplied proposals, and
cross-user denial. The E2E snapshots confirm that read calls preserve all persisted
plan and original FIT rows. OpenAI is disabled throughout local verification.

## Recommended next epic

Expose the completed read contracts through authenticated ENQIDU Tools, then
build explicit proposal preview/acceptance against the existing Coach Action
boundary. Before adding persistent assessment history, review snapshot identity,
algorithm version retention, corrections, audit access and ownership; evaluate
any required migration in that separate scope.

## Operational limits

Coach context/reply/actions require a valid persisted profile timezone and return
`profile_timezone_required` when it is absent or invalid. The real athlete's
`Europe/Madrid` timezone is authoritative. Complete legacy profiles through the
existing profile workflow; no browser or UTC fallback decides the health day.

Readiness weights, relative-baseline slopes and the recommendation threshold are
versioned engineering policies, not clinically validated cutoffs. Missing or
uncertain evidence lowers coverage or prevents a score. The proposal is an
auditable suggestion; even a high-confidence confirmed feedback fact cannot
authorize a plan change.

Read-only recomputation reflects the current canonical revisions. Exact historic
replay requires retaining the returned evidence snapshot; an algorithm version
alone cannot recover values subsequently corrected in canonical persistence.
Assessments explicitly expose missing structure, unavailable optional hierarchy
and bounded coverage rather than claiming a complete audit of every session.

No part of the implemented read-only vertical requires a migration. Future
immutable assessment/readiness history needs a separately reviewed persistence
decision. Optional training structure that is absent from an installation is
reported as missing evidence rather than provisioned by this task.

# Conversational Coach V2 — validation

Base: `49c719c4fe5c0585ad431997a811b592b9dd344b`, verified against fetched
`origin/main` before creating `feat/105-conversational-coach-v2`.

## Automated checks

| Command | Result |
|---|---|
| `npm test` | 1,051 passed; 0 failed / skipped |
| `npm run test:mcp` | 45 passed |
| `npm run test:mcp:remote` | 12 passed |
| `npm run test:mcp:oauth` | 8 passed |
| `npm run test:semantic-read` | 5 passed |
| `npm run test:tools` | 100 passed |
| `npm run test:coach-evals` | 165 passed |
| `npm run test:transactional-actions` | 37 passed |
| `node scripts/test-reconciliation-postgres.mjs` | 43 passed |
| `node scripts/test-semantics-postgres.mjs` | 9 passed |
| `npm run test:e2e -- --workers=1` | 48 passed; 0 failed / skipped |
| `npm run build` | Passed; existing bundle-size warning remains |
| `git diff --check` | Passed |

Coach evals include the existing 30 contract evals, 121 new language cases and
14 dataset/calendar checks. The separate 26 V2 tests cover contracts, bounds,
planner stages, zero/missing/variants, exact resolution, ambiguity, references,
read-only behavior, correction routing, Health, telemetry and App/MCP/domain
numeric parity. They are also included in `npm test`.

The real HTTP/browser tests use disposable authenticated users in local
Supabase, actual catalog identities, RLS, canonical training tables and unchanged
#94–#104 local bootstrap contracts. OpenAI is explicitly disabled in the local
Edge runtime. No acceptance test needs a model or paid API.

## Product evidence

- [Four-turn golden JSON](evidence/golden-v2.json): Dominada alta → since July →
  HSPU → missing data, with a new runtime on each turn and explicit reference
  transfer. Dates and values are synthetic fixtures.
- HTTP golden checks status 200, deterministic/false/null, profile request date,
  Europe/Madrid and `profile_timezone`, even with a Los Angeles client timezone
  and a forged request user ID. It compares Coach metrics with the existing
  authenticated semantic-read tool and verifies no canonical rows changed.
- Session golden preserves separate Fuerza and Pilates activities, then resolves
  the exact Fuerza selection through detail V2. Canonical modality, blocks,
  repetitions and load are displayed; missing HSPU reps stay missing.
- Browser golden reloads between turns, checks persisted account-scoped focus,
  no browser exceptions, and no horizontal overflow at 390 × 844.
- [Coach at 390 px](evidence/coach-v2-390.png) and
  [session detail at 390 px](evidence/session-v2-390.png) were visually inspected.
  Existing vertical scrolling and navigation remain; there is no layout redesign.
- Unknown, `algo RDL` and ambiguous `pike` require clarification. A single search
  candidate is never promoted into a resolved identity. Correction text still
  reaches session selection / preview / explicit confirmation.
- Existing E2E coverage exercises Home/Progress, saved-plan precedence,
  transactional actions, Daily Coach, Health, #102/#103 correction/materialization,
  account isolation and OAuth consent.

## Calendar-sensitive regression fixtures

Running near Madrid midnight before the October DST transition exposed two
pre-existing fixture assumptions. The Coach E2E helper now shifts calendar days
instead of adding 24 elapsed hours; otherwise tomorrow could remain the same
Madrid date. The Garmin E2E fixture timestamps its synthetic current battery
sample at the retrieval instant; its original 00:30 sample could otherwise be
in the future and correctly excluded from readiness. Both corrections affect
only test fixtures, preserve their assertions, and leave Health/transport/action
production code unchanged. The new HTTP helper also uses native Fetch's numeric
`status` property. All three initially failing tests passed after these fixes.

## Execution and scope

Node 22, local Chromium and local PostgreSQL/Supabase. The environment's injected
proxy makes the disposable Auth container's wget health probe report unhealthy;
the actual Auth HTTP endpoint and authenticated tests work. Local Edge uses the
repository's existing proxy setup with local-service bypass and OpenAI disabled.
No production writes, migration, backfill, deployment or merge was performed.

Queries have at most four planned reads; independent reads use `executeMany`.
Typical exercise queries use two dependent calls, overview one, comparison two
in one batch, ambiguity one and unknown zero. Explicit ranges omit the legacy
52-week record scan. This is verified structurally; no production latency claim
or paid benchmark is made.

Residual limits: deterministic grammar/catalog coverage, same-browser continuity,
exact displayed session-title selection, bounded periods/rows and scoped best
observations rather than lifetime records. Incremental cost: **€0.00**.

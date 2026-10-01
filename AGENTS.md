# AGENTS.md — ENQIDU engineering guardrails

This file defines the default operating rules for coding agents working in this repository.
Keep it short, enforceable, and aligned with the real production contracts.

## Mission

ENQIDU is a coach-first multimodal training product. Prefer small, verifiable product increments over broad refactors.

The production source of truth is:
1. real database/schema and authenticated runtime behavior,
2. canonical ENQIDU context contracts,
3. repository code and tests,
4. fixtures/examples.

Never make production code depend on a field that exists only in a synthetic test fixture.

## Product invariants

- A persisted plan is authoritative over an automatically calculated recommendation.
- A calculated recommendation is not a saved plan unless the user explicitly accepts/persists it.
- Saving a recommendation must be an explicit user action. The server must recalculate/validate the recommendation and re-check that no plan already exists before writing.
- Do not grant general INSERT/UPDATE/DELETE on planning tables to the frontend merely to support Coach actions; use a narrow audited server-side action boundary.
- A past planned session without explicit completion evidence must not be called missed, skipped or failed; report it as unlinked/unknown instead.
- Missing health/recovery data must never be invented.
- Missing Garmin/FIT data must never be inferred as if observed.
- Training locations are not physical restrictions.
- Respect location prescription scope; `coach_led_only` environments must not receive autonomous prescriptions.
- Never mix equipment from different locations when the training environment is unresolved.
- User-visible copy should use friendly labels, not internal codes or IDs.
- Coach cards are supplemental to the textual answer and must not contradict it.

## Coach deterministic phase

The current Phase 1 Coach is deterministic by default.

For today's training / plan intent:
- no LLM call,
- `response_mode="deterministic"`,
- `llm_used=false`,
- `usage=null`,
- existing planned training wins,
- otherwise a deterministic recommendation may be calculated.

OpenAI remains optional behind `OPENAI_COACH_ENABLED=true` for other future flows. Do not enable or expand LLM usage unless the task explicitly requires a product decision to do so.

Relevant files:
- `src/coachContext/coachCards.js`
- `src/coachContext/coachDeterministicReply.js`
- `src/coachContext/trainingRecommendation.js`
- `src/coachContext/coachPlanAction.js`
- `supabase/functions/coach-reply/index.ts`
- `supabase/functions/coach-plan-action/index.ts`

## Architecture

Prefer domain logic outside `src/main.jsx`.

Keep separate when practical:
- context/data loading,
- normalization,
- product/domain rules,
- deterministic explanation,
- presentation/cards,
- persistence.

Do not perform a general rewrite while implementing a focused feature.

## Supabase and security

Before any Supabase schema/auth/RLS/function change, inspect the current production contract and current Supabase documentation.

Default rules:
- preserve JWT-authenticated user identity,
- preserve RLS,
- never expose `service_role` or secret keys to frontend code,
- never grant user-owned data to `anon`,
- never use `SECURITY DEFINER` merely to solve a permission problem,
- ownership policies must constrain rows to the authenticated user,
- schema changes require a migration and post-change verification,
- read-only feature work should not create permissions/schema changes without demonstrated need.

If production data shape matters, inspect it before coding. Do not guess from fixtures.

## Garmin / FIT

Garmin/FIT ingestion and historical training data are high-value data pipelines.

Unless the task explicitly targets them:
- do not modify Garmin/FIT parsing,
- do not rewrite imported activities,
- do not modify historical training sessions,
- do not change deduplication behavior.

## Workflow

Default implementation flow:
1. start from current `main`,
2. create a focused branch,
3. implement the smallest coherent change,
4. add or update regression tests,
5. run Coach evals when Coach behavior changes,
6. run the full test suite,
7. run the production build,
8. review the complete diff,
9. open a PR,
10. do not merge your own PR unless the task explicitly authorizes it.

Prefer squash merge for focused feature/fix PRs.

## Validation commands

Required before declaring a code task complete:

```bash
npm run test:coach-evals
npm test
npm run build
git diff --check
```

If a command is irrelevant to the task, state why rather than silently skipping it.

## Coach eval policy

`tests/coach-contract-evals.test.mjs` contains high-level product invariants.

When a production QA bug is discovered:
1. reproduce it,
2. fix it,
3. add a regression test,
4. add or strengthen a contract eval if the bug represents a reusable product invariant.

Do not weaken an eval just to make a change pass. If an invariant is intentionally changing, call it out as a product decision.

## Review checklist

Before finalizing:
- Does the code use fields that exist in the real canonical context?
- Does a plan still beat a recommendation?
- Can missing data be mistaken for observed data?
- Are locations being confused with constraints?
- Is equipment scoped to the selected environment?
- Is any user-visible internal code leaking?
- Could this path call an LLM unexpectedly?
- Are RLS/JWT boundaries preserved?
- Are Garmin/FIT or historical records changed unintentionally?
- Is the diff smaller than a general refactor?

## Delivery summary

A completed task should report:
- behavior changed,
- files changed,
- tests/evals run,
- build result,
- migrations/security changes, if any,
- remaining risks or data-dependent cases,
- PR/commit reference.

Only escalate to the product owner when a real product/behavior decision is required. Technical implementation choices should normally be resolved autonomously.

# Coach Actions V1 — Save recommendation to plan

## Goal

Allow an athlete to explicitly accept today's deterministic Coach recommendation and persist it as a planned training session.

The first action is a card button:

- `Guardar en plan`

Conversational shortcuts such as `apúntamelo` are intentionally deferred until the same write boundary is proven in production.

## Product rules

- A recommendation remains ephemeral until the athlete explicitly accepts it.
- An existing plan for the day always wins.
- The browser never sends an arbitrary planned-session payload.
- The browser sends only:
  - action name,
  - date,
  - requested environment/location.
- The write Edge Function re-authenticates the user, reloads canonical ENQIDU context, reloads active constraints, re-checks existing plans and recalculates the recommendation.
- If a plan appeared between recommendation and acceptance, the action returns `plan_already_exists` and writes nothing.
- No LLM is called.
- Garmin/FIT and completed training are untouched.

## Security boundary

Frontend planning tables remain read-only for `authenticated`.

`coach-plan-action` uses two separate Supabase clients:

1. user client with the incoming JWT for identity and RLS-protected reads;
2. server-only service-role client for one narrow RPC call.

The service-role key is never exposed in `src/`.

The SQL writer:

`public.save_coach_recommendation_plan(uuid, date, jsonb)`

is:

- `SECURITY INVOKER`;
- executable only by `service_role`;
- revoked from `PUBLIC`, `anon` and `authenticated`;
- serialized with a transaction-level advisory lock per user + date;
- fixed to `status='planned'` and `source='enkidu_coach'`;
- responsible for inserting session and blocks in one database transaction.

This avoids granting generic INSERT/UPDATE/DELETE permissions to the browser.

## Canonical mapping

The recommendation engine may use a semantic type that is broader than the persisted plan schema.

Example:

- Coach recommendation: `aerobic`
- persisted canonical plan type:
  - `trail` when the environment is trail;
  - otherwise `running`.

Existing canonical types such as `strength`, `swim`, `recovery` and `mobility` remain unchanged.

## UX after save

During the action:

- card actions are temporarily disabled;
- composer notice shows that the plan is being saved.

On success:

- card subtitle changes to `Guardada en tu plan`;
- badge changes to `Plan`;
- save action disappears.

If a plan already exists:

- no duplicate is created;
- the recommendation card stops offering save;
- the user sees an explicit notice.

## Response contract

Successful action:

- `ok=true`
- `saved=true`
- `response_mode="deterministic_action"`
- `llm_used=false`
- `usage=null`

## Validation

Required checks:

- Coach contract evals;
- full test suite;
- production build;
- migration grant verification;
- no service-role secret reference in frontend source;
- Supabase Security Advisor after migration;
- production E2E: recommendation -> save -> plan exists -> duplicate save prevented.

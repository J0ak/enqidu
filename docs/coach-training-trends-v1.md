# Coach training trends V1

## Goal

Answer read-only questions such as:

- `¿Estoy mejorando?`
- `Compárame esta semana con la anterior`
- `¿Cómo va mi carga?`
- `¿Qué tendencia llevo?`

without an LLM and without creating a synthetic fitness score.

## Comparison contract

V1 compares like with like. For a completed period, it compares the full period with the immediately preceding period of the same inclusive duration.

If the current period is still in progress, it compares only the elapsed portion with the same elapsed portion of the previous period. Example: on Tuesday, a Monday–Sunday current week is compared as Monday–Tuesday vs Monday–Tuesday of the previous week, never against seven completed days.

Inputs already available from `get_ai_training_period_summary`:

- sessions count;
- active days;
- total recorded training duration;
- activity type counts.

The date-range rule lives in `src/coachContext/trainingTrend.js`. The Edge Function loads the comparable current slice when the period is still in progress and the corresponding slice from the previous period.

## What ENQIDU may say

ENQIDU may report factual changes in:

- number of sessions;
- active days;
- total recorded duration;
- modalities present in the current vs previous period.

## What ENQIDU must not say

V1 must not conclude that athletic performance, fitness or health has improved merely because training volume increased.

The deterministic answer therefore states that the comparison describes recorded load/volume and is insufficient on its own to prove performance improvement.

No readiness, HRV, sleep, pace, power, strength or other performance metric is invented.

## Persistence and LLM

This feature:

- is read-only;
- adds no schema;
- adds no permissions;
- does not modify Garmin/FIT;
- does not persist analysis;
- returns deterministically before the optional OpenAI path;
- keeps `response_mode="deterministic"`, `llm_used=false` and `usage=null`.


## In-progress period semantics

The user's local request date is the comparison cutoff. Future days inside the current canonical week/month are excluded from trend comparison.

The response and card explicitly identify an in-progress comparison as the "same elapsed portion" so a partial week is not presented as if it were a completed week.

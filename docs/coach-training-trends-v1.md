# Coach training trends V1

## Goal

Answer read-only questions such as:

- `¿Estoy mejorando?`
- `Compárame esta semana con la anterior`
- `¿Cómo va mi carga?`
- `¿Qué tendencia llevo?`

without an LLM and without creating a synthetic fitness score.

## Comparison contract

V1 compares the current canonical training period with the immediately preceding period of the same inclusive duration.

Inputs already available from `get_ai_training_period_summary`:

- sessions count;
- active days;
- total recorded training duration;
- activity type counts.

The Edge Function only loads the previous period. Domain comparison lives in `src/coachContext/trainingTrend.js`.

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

# Coach weekly plan progress V1

## Goal

Provide a deterministic, read-only weekly planning view for questions such as:

- `¿Qué tengo esta semana?`
- `¿Qué me queda por entrenar esta semana?`
- `¿Cómo voy respecto al plan?`
- `¿Qué sesiones tengo planificadas esta semana?`

## Evidence model

The feature combines:

- the canonical `current_week` executed-training summary;
- RLS-protected `planned_training_sessions` for the current requested period;
- the optional `weekly_plans.weekly_focus` row.

A planned session is considered completed only when ENQIDU has explicit evidence:

- `linked_completed_session_id` exists; or
- the plan row has an explicit completed/executed status.

A past planned session without completion evidence is reported as **"sin ejecución enlazada"**. It is never called missed, skipped or failed, because absence of a link is not proof that the athlete did not train.

Cancelled sessions are excluded from active plan counts.

## Persistence

V1 is read-only:

- no plan rows are created or updated;
- no completed sessions are linked automatically;
- no recommendation is persisted;
- no Garmin/FIT data is modified.

## LLM

Weekly-plan queries are deterministic and return before the optional OpenAI path:

- `response_mode="deterministic"`;
- `llm_used=false`;
- `usage=null`.

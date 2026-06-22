# PlannedWeek Contract

Contrato para que ChatGPT genere sesiones o semanas planificadas y las grabe mediante RPCs seguras:

```sql
select public.chatgpt_pilot_preview_planned_session($json$...$json$::jsonb);
select public.chatgpt_pilot_apply_planned_session($json$...$json$::jsonb);
select public.chatgpt_pilot_preview_week_plan($json$...$json$::jsonb);
select public.chatgpt_pilot_apply_week_plan($json$...$json$::jsonb);
```

La app solo consume estas sesiones en modo read-only. Una planificada no es una ejecutada y no debe contener Garmin/FIT, frecuencia cardiaca, Training Effect, laps, bloques realizados ni ejercicios realizados.

## Modelo

```text
PlannedWeek
  week_start: YYYY-MM-DD
  source?: "chatgpt_pilot"
  sessions: PlannedSession[]

PlannedSession
  planned_date: YYYY-MM-DD
  planned_time?: HH:MM
  title: string
  session_type: PlannedSessionType
  status?: PlannedStatus
  location_type?: string
  planned_intensity?: string
  planned_duration_min?: integer
  planned_duration_max?: integer
  objective?: string
  coach_notes?: string
  constraints?: string[]
  readiness_snapshot?: object
  blocks?: PlannedBlock[]

PlannedBlock
  block_order?: integer
  title: string
  block_type?: string
  objective?: string
  planned_duration_seconds?: integer
  planned_rounds?: integer
  planned_exercises?: PlannedExercise[]
  constraints?: string[]
  notes?: string

PlannedExercise
  name: string
  target_sets?: integer
  target_reps?: string
  load?: string
  duration_seconds?: integer
  equipment?: string[]
  notes?: string
```

## Obligatorios

- `week_start`
- `sessions`
- `sessions[].planned_date`
- `sessions[].title`
- `sessions[].session_type`
- `sessions[].blocks[].title` cuando hay bloques

## Opcionales

- `planned_time`
- `status`
- `location_type`
- `planned_intensity`
- `planned_duration_min`
- `planned_duration_max`
- `objective`
- `coach_notes`
- `constraints`
- `readiness_snapshot`
- `blocks`

## Enums

`session_type` soportados:

```text
hybrid
strength
functional
yoga
mobility
recovery
running
trail
swim
rest
```

`status` soportados:

```text
planned
confirmed
adaptable
probable
recommended
modified
skipped
rescheduled
```

Si `status` falta, la RPC usa `planned`.

## Reglas

- No incluir `user_id`; la RPC usa `chatgpt_pilot_config.pilot_user_id`.
- No incluir `linked_completed_session_id` en V1.
- No crear comparaciÃ³n plan/real.
- No crear matching automÃ¡tico.
- No incluir payloads crudos, SQL, claves, tokens ni secretos.
- `planned_duration_min` no puede ser mayor que `planned_duration_max`.
- `constraints`, `blocks` y `planned_exercises` deben ser arrays cuando aparezcan.
- La clave lÃ³gica anti-duplicados es `user_id + planned_date + planned_time + title`.
- Si ya existe una sesiÃ³n con esa clave, `apply` actualiza la sesiÃ³n y reemplaza sus bloques planificados.

## ChatGPT Pilot Write Flow

Usa las RPCs de sesión cuando el payload sea grande o cuando ChatGPT quiera grabar una semana paso a paso:

```sql
select public.chatgpt_pilot_preview_planned_session($json$
{
  "planned_date": "2026-06-24",
  "planned_time": "07:00",
  "title": "Híbrido fuera de casa",
  "session_type": "hybrid",
  "status": "planned",
  "planned_intensity": "RPE 7-8",
  "planned_duration_min": 45,
  "planned_duration_max": 60,
  "objective": "Sesión híbrida controlada.",
  "blocks": [
    {
      "block_order": 1,
      "title": "Movilidad + activación",
      "block_type": "warmup",
      "planned_duration_seconds": 600,
      "planned_exercises": []
    }
  ]
}
$json$::jsonb);
```

Si el preview devuelve `ok=true` y `valid=true`, aplica exactamente el mismo JSON validado:

```sql
select public.chatgpt_pilot_apply_planned_session($json$
{
  "...": "mismo JSON validado"
}
$json$::jsonb);
```

Usa las RPCs de semana cuando el payload sea pequeño y cómodo de enviar de una vez:

```sql
select public.chatgpt_pilot_preview_week_plan($json$
{
  "week_start": "2026-06-22",
  "source": "chatgpt_pilot",
  "sessions": []
}
$json$::jsonb);
```

Si el preview semanal devuelve `ok=true`, `chatgpt_pilot_apply_week_plan` itera `sessions[]` y aplica cada sesión mediante la misma lógica de `chatgpt_pilot_apply_planned_session`.

### Cuándo Usar Cada RPC

- `preview_planned_session`: validar una sola planned, revisar duplicados y contar bloques sin escribir.
- `apply_planned_session`: grabar una sola planned robustamente desde ChatGPT.
- `preview_week_plan`: validar una semana completa sin escribir.
- `apply_week_plan`: grabar una semana completa reutilizando el flujo de sesión.

### Idempotencia

La clave lógica es:

```text
pilot_user_id + planned_date + planned_time + title
```

Si la sesión ya existe, la RPC actualiza sus campos planificados y reemplaza sus `planned_session_blocks`. No toca `training_sessions`, `session_blocks`, `session_exercises`, `session_samples`, `session_laps` ni `session_metrics`.
## Ejemplo

```json
{
  "week_start": "2026-06-22",
  "source": "chatgpt_pilot",
  "sessions": [
    {
      "planned_date": "2026-06-24",
      "planned_time": "07:00",
      "title": "HÃ­brido fuera de casa",
      "session_type": "hybrid",
      "status": "planned",
      "location_type": "outside_home",
      "planned_intensity": "RPE 7-8",
      "planned_duration_min": 45,
      "planned_duration_max": 60,
      "objective": "SesiÃ³n hÃ­brida controlada sin castigar la zona lumbar.",
      "coach_notes": "Evitar peso muerto pesado, mÃ¡ximos y saltos excesivos.",
      "constraints": [
        "evitar peso muerto pesado",
        "evitar mÃ¡ximos",
        "controlar saltos",
        "mantener lumbar neutro"
      ],
      "blocks": [
        {
          "block_order": 1,
          "title": "Movilidad + activaciÃ³n",
          "block_type": "warmup",
          "objective": "Preparar cadera, core y hombros.",
          "planned_duration_seconds": 600,
          "planned_rounds": null,
          "planned_exercises": [],
          "constraints": [],
          "notes": null
        },
        {
          "block_order": 2,
          "title": "Empuje / tracciÃ³n",
          "block_type": "strength_skill",
          "objective": "Trabajo tÃ©cnico sin mÃ¡xima carga.",
          "planned_duration_seconds": 900,
          "planned_rounds": null,
          "planned_exercises": [],
          "constraints": [
            "RPE mÃ¡ximo 7"
          ],
          "notes": null
        }
      ]
    }
  ]
}
```

## Referencia Pydantic

```python
from datetime import date
from pydantic import BaseModel


class PlannedExercise(BaseModel):
    name: str
    target_sets: int | None = None
    target_reps: str | None = None
    load: str | None = None
    duration_seconds: int | None = None
    equipment: list[str] = []
    notes: str | None = None


class PlannedBlock(BaseModel):
    block_order: int | None = None
    title: str
    block_type: str | None = None
    objective: str | None = None
    planned_duration_seconds: int | None = None
    planned_rounds: int | None = None
    planned_exercises: list[PlannedExercise] = []
    constraints: list[str] = []
    notes: str | None = None


class PlannedSession(BaseModel):
    planned_date: date
    planned_time: str | None = None
    title: str
    session_type: str
    status: str = "planned"
    location_type: str | None = None
    planned_intensity: str | None = None
    planned_duration_min: int | None = None
    planned_duration_max: int | None = None
    objective: str | None = None
    coach_notes: str | None = None
    constraints: list[str] = []
    readiness_snapshot: dict | None = None
    blocks: list[PlannedBlock] = []


class PlannedWeek(BaseModel):
    week_start: date
    source: str = "chatgpt_pilot"
    sessions: list[PlannedSession]
```

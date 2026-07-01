# 2026-07-01 Conversational Correction

Session ID:

```text
5ce7302b-fdce-478d-aaee-72f36023416e
```

Purpose:

- Replace the previous coach/manual enrichment structure.
- Keep the existing session.
- Preserve Garmin/FIT and objective activity data.
- Represent the corrected session as 6 coach blocks.

Expected after: 6 coach blocks.
Integrated block exercises: 3.

## Payload

```json
{
  "session_id": "5ce7302b-fdce-478d-aaee-72f36023416e",
  "local_date": "2026-07-01",
  "correction_type": "replace_coach_blocks",
  "source": "chatgpt_voice_correction",
  "reason": "Usuario corrigio orden y agrupacion real de bloques tras el primer enriquecimiento.",
  "preserve_garmin_fit": true,
  "corrected_structure": {
    "title": "Funcional tecnico controlado",
    "session_type": "functional",
    "rpe_estimated": "4-6",
    "blocks": [
      {
        "order": 1,
        "type": "mobility",
        "name": "Activacion inicial",
        "summary": "Movilidad de hombros, cadera, laterales y core suave.",
        "exercises": [
          {"order": 1, "name": "Movilidad de hombros"},
          {"order": 2, "name": "Rotaciones de cadera"},
          {"order": 3, "name": "Movilidad lateral"},
          {"order": 4, "name": "Dead bug / bicho muerto"}
        ]
      },
      {
        "order": 2,
        "type": "mobility",
        "name": "Rotaciones sobre pared / caballero",
        "summary": "Rodilla a pared, rotaciones controladas, alcance largo y rotacion bilateral.",
        "exercises": [
          {"order": 1, "name": "Rodilla a pared en caballero"},
          {"order": 2, "name": "Rotaciones controladas sobre pared / caballero"},
          {"order": 3, "name": "Alcance largo de brazo"},
          {"order": 4, "name": "Rotacion bilateral controlada"}
        ]
      },
      {
        "order": 3,
        "type": "strength",
        "name": "Kettlebell 12 kg",
        "summary": "Trabajo tecnico de control con kettlebell de 12 kg.",
        "exercises": [
          {"order": 1, "name": "Trabajo tecnico con kettlebell", "load_value": 12, "load_unit": "kg"},
          {"order": 2, "name": "Posicion tipo sentadilla/control"},
          {"order": 3, "name": "Posicion V / squat normal"},
          {"order": 4, "name": "Isometrico de control"}
        ]
      },
      {
        "order": 4,
        "type": "mixed",
        "name": "Bloque integrado: polea, wall ball y carry",
        "summary": "Bloque entero de tres ejercicios: polea, wall ball con rotaciones y carry/granjero asimetrico.",
        "exercises": [
          {"order": 1, "name": "Remo en polea estirando el brazo", "equipment": ["polea"]},
          {"order": 2, "name": "Wall ball con rotaciones", "load_value": 5, "load_unit": "kg"},
          {"order": 3, "name": "Carry/granjero con posicion de press/front rack y brazo estirado", "load_value": 16, "load_unit": "kg"}
        ]
      },
      {
        "order": 5,
        "type": "cardio",
        "name": "Remo / paladas controladas",
        "summary": "10 paladas lentas y 10 rapidas, repetido 5 veces.",
        "rounds_completed": 5,
        "exercises": [
          {"order": 1, "name": "Paladas lentas", "sets_completed": 5, "reps_per_set": [10]},
          {"order": 2, "name": "Paladas rapidas", "sets_completed": 5, "reps_per_set": [10]}
        ]
      },
      {
        "order": 6,
        "type": "cooldown",
        "name": "Vuelta a la calma",
        "summary": "Vuelta a la calma final no detallada.",
        "exercises": [
          {"order": 1, "name": "Vuelta a la calma"}
        ]
      }
    ],
    "metrics": [
      {
        "metric_code": "rpe_estimated",
        "metric_name": "RPE estimado",
        "value_text": "4-6",
        "unit": "RPE",
        "metric_scope": "session",
        "confidence": "estimated"
      },
      {
        "metric_code": "lumbar_risk_note",
        "metric_name": "Nota lumbar",
        "value_text": "Vigilar 24 h. Puntos ambar: wall ball con rotaciones, carry asimetrico KB 16 kg y paladas rapidas.",
        "metric_scope": "session",
        "confidence": "manual"
      }
    ]
  }
}
```

## Expected Preview

```json
{
  "ok": true,
  "action": "replace_coach_blocks",
  "dry_run": true,
  "session_id": "5ce7302b-fdce-478d-aaee-72f36023416e",
  "preserves": {
    "garmin_fit": true,
    "activity_metrics": true
  },
  "before": {
    "coach_blocks": 7,
    "coach_exercises": 16
  },
  "after": {
    "coach_blocks": 6,
    "coach_exercises": 18
  },
  "warnings": []
}
```

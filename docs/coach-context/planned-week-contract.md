# Planned Week Contract

`planned` representa intencion, no ejecucion.

## Conceptos

- `PlannedWeek`
- `PlannedSession`
- `PlannedBlock`
- `PlannedExercise`
- `location_type`
- `target_rpe`
- `constraints`
- `source`
- `idempotency_key`
- preview/apply RPC
- planned/executed separation
- planned_completed relationship

## Reglas

- `planned` no escribe en `training_sessions` ejecutadas.
- `planned` no inventa Garmin.
- `planned` no crea frecuencia cardiaca, Training Effect, calorias ni laps.
- `planned_completed` solo aparece cuando existe una executed real vinculada.
- La relacion planned/executed debe conservar ambas capas.

## PlannedWeek

Contenedor de una semana de intencion. Puede venir de coach AI, usuario o piloto
ChatGPT, pero debe poder aplicarse de forma idempotente.

## PlannedSession

Unidad de intencion diaria o intra-dia. Debe declarar ubicacion, objetivo,
restricciones, duracion prevista y RPE objetivo.

## PlannedBlock

Bloque previsto de trabajo, calentamiento, fuerza, tecnica, conditioning,
movilidad o recuperacion.

## PlannedExercise

Ejercicio previsto solo cuando la ubicacion y el inventario de esa ubicacion
permiten definirlo sin inventar recursos.


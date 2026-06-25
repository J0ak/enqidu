# Model Boundaries

## ENQIDU generic model

El modelo generico ENQIDU no depende de:

- Jotason
- Garmin como unico proveedor
- un tipo de deporte concreto
- un inventario concreto
- un calendario concreto

## Entidades genericas futuras

- `athlete_profile`
- `training_goals`
- `athlete_constraints`
- `equipment_inventory`
- `equipment_location`
- `weekly_availability`
- `planned_session`
- `executed_session`
- `coach_log`
- `coach_recommendation`
- `activity_view_model`

## Regla

Jotason data can instantiate the model, but must not define the model.

Los datos del piloto solo pueden vivir en carpetas `references/jotason` o
`fixtures/jotason`.


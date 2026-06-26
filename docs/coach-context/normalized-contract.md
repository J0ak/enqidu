# Normalized Coach Context Contract v0

Este contrato define el formato ENQIDU normalizado que se genera desde los JSON
raw del piloto Jotason.

Raw JSON = fuente original, evidencia y trazabilidad.

Normalized JSON = formato ENQIDU generico reutilizable.

Supabase = futura persistencia viva/editable, no parte de este PR.

## Reglas comunes

Todo JSON normalizado debe incluir:

```json
{
  "schema_version": "enqidu_*_v0",
  "product": "ENQIDU",
  "fixture_user": "jotason",
  "source_traceability": {},
  "data_quality": {}
}
```

`fixture_user = "jotason"` identifica el dataset piloto. No convierte a
Jotason en modelo de producto ni en runtime.

## NormalizedAthleteContext

Contexto agregado del usuario fixture:

- `schema_version`
- `product`
- `fixture_user`
- `athleteFixture`
- `availability`
- `references`
- `counts`
- `source_traceability`
- `data_quality`

## NormalizedEquipmentInventory

Inventario generico por ubicacion:

- `location`
- `equipment`
- `constraints`
- `source_traceability`
- `data_quality`

Regla critica: `constraints.cardioAtHome` conserva `cardio_at_home = false`.

## NormalizedTrainingReference

Referencia historica de entrenamiento:

- `planName`
- `lastUpdate`
- `priorities`
- `weeklyStructure`
- `rules`
- `source_traceability`
- `data_quality`

No representa disponibilidad actual universal.

## NormalizedSessionFixture

Sesion normalizada tolerante:

- `session.date`
- `session.title`
- `session.sport`
- `session.session_type`
- `session.schema_type`
- `session.summary`
- `session.blocks`
- `session.blocks_count`
- `source_traceability`
- `data_quality`

Si faltan campos, se registran en `data_quality.missing_fields` en lugar de
inventarse.

## NormalizedCoachContextFixture

Agregado completo:

- `references`
- `session_fixtures`
- `source_traceability`
- `data_quality`

Sirve para tests, inspeccion y futuras etapas de adapters. No alimenta runtime
productivo por si solo.

## NormalizedDataQuality

Estructura comun:

- `missing_fields`: campos esperados pero ausentes.
- `warnings`: advertencias de normalizacion o alcance.

## SourceTraceability

Estructura comun:

- `file`
- `source_path`
- `fixture_user`
- `category`
- `role`
- `generated_from`
- `source_files`

La trazabilidad apunta siempre a `docs/coach-context/`.


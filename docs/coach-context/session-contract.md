# Session Contract

Contrato conceptual generico de sesion para ENQIDU. No es implementacion runtime.

## Areas del contrato

- `planned_session`
- `executed_session`
- `planned_completed_view`
- `garmin_fit_summary`
- `coach_conversation_enrichment`
- `session_blocks`
- `session_exercises`
- `session_metrics`
- `data_quality`
- `source_traceability`

## Planned session

Intencion antes de ejecutar:

- objetivo
- ubicacion
- restricciones
- duracion prevista
- RPE objetivo
- bloques previstos
- ejercicios previstos cuando la ubicacion y el inventario lo permitan

## Executed session

Realidad ejecutada:

- metricas fisiologicas
- tiempo real
- laps
- zonas
- datos Garmin/FIT
- ejercicios realizados si vienen del coach log

## Planned completed view

Vista reconciliada planned-first:

- intencion y titulo desde planned
- metricas desde executed real
- referencia secundaria Garmin/FIT

## Referencia Jotason v8

El contrato Jotason v8 sirve de referencia por estos conceptos:

- metadata
- summary
- zones
- laps
- intervals
- time_series
- `structure.blocks`
- `activity_specific`
- reconciliation
- derived_metrics
- coach_layer
- data_quality

## Advertencia

`JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json` is a historical reference contract.
It must inform ENQIDU's generic contract but must not be copied as a
user-specific runtime model.


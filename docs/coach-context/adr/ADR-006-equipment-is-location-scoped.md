# ADR-006: Equipment Is Location Scoped

## Estado

Aceptada.

## Contexto

El piloto tiene inventario home, pero ENQIDU debe soportar sesiones en casa,
gimnasio, box, estudio, exterior y ubicaciones desconocidas.

## Decision

El inventario siempre esta ligado a ubicacion. No usar material home para
sesiones fuera de casa.

## Consecuencias

- `location_type` condiciona ejercicios previstos.
- Fuera de casa se debe priorizar intencion, foco, restricciones, duracion y RPE.
- El coach realizado puede listar ejercicios reales aunque no estuvieran previstos.


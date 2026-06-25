# ADR-005: Planned, Executed and Coach Layer Separation

## Estado

Aceptada.

## Contexto

ENQIDU combina planned sessions, Garmin/FIT ejecutadas y enriquecimiento desde
conversacion coach.

## Decision

`planned`, executed Garmin/FIT y Coach realizado son capas separadas.

## Consecuencias

- Planned manda en intencion.
- Garmin/FIT manda en metricas fisiologicas.
- Coach realizado manda en detalle narrado/registrado.
- La reconciliacion no debe borrar ni mezclar fuentes.


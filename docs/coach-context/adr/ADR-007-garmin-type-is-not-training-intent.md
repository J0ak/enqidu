# ADR-007: Garmin Type Is Not Training Intent

## Estado

Aceptada.

## Contexto

Garmin/FIT puede etiquetar una actividad con un tipo que no coincide exactamente
con la intencion planificada.

## Decision

Garmin type no define la intencion. `planned.title` manda en intencion. Garmin
title/type queda como referencia secundaria.

## Consecuencias

- No se exige igualdad estricta entre tipo planned y tipo Garmin.
- Planned completed usa metricas Garmin/FIT pero conserva titulo planned.
- La UI futura debe poder mostrar `Garmin: executed.title` como referencia.


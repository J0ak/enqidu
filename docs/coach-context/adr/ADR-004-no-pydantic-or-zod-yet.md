# ADR-004: No Pydantic or Zod Yet

## Estado

Aceptada.

## Contexto

El contrato generico aun esta en fase de documentacion. No hay adaptadores JS ni
backend Python nuevo.

## Decision

No anadir Pydantic ni Zod ahora.

## Motivo

Pydantic solo tiene sentido en un backend Python futuro. Zod solo cuando haya
adaptadores JS reales.

## Consecuencias

- No se anaden dependencias.
- La validacion formal queda en roadmap.


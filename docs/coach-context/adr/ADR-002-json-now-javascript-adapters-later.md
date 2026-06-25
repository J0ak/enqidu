# ADR-002: JSON Now, JavaScript Adapters Later

## Estado

Aceptada.

## Contexto

Existen JSON historicos con alto valor como contratos, fixtures y referencias.

## Decision

Primero se preservan JSON existentes y se documentan. Despues se crearan
adaptadores JavaScript.

## Consecuencias

- Este PR no crea adaptadores.
- El manifiesto documenta fuentes esperadas y estado.
- Los normalizadores futuros deberan producir modelos genericos ENQIDU.


# ADR-008: Materialized Normalized Fixtures

## Estado

Aceptada.

## Contexto

Los JSON raw del piloto Jotason son evidencia historica y deben conservarse sin
reescritura. A la vez, ENQIDU necesita un formato generico para tests,
normalizacion y futuras integraciones.

## Decision

Conservar raw JSON y materializar JSON normalizados ENQIDU.

## Motivo

Esto separa trazabilidad de modelo generico reutilizable:

- raw JSON = fuente original
- normalized JSON = contrato ENQIDU derivado
- adapters JavaScript = generacion reproducible

## Consecuencias

- Jotason sigue siendo fixture/piloto.
- ENQIDU sigue siendo producto generico.
- Supabase vendra despues como persistencia viva/editable.
- Los normalized fixtures pueden regenerarse con `npm run coach:normalize`.


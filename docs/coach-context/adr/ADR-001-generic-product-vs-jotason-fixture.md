# ADR-001: Generic Product vs Jotason Fixture

## Estado

Aceptada.

## Contexto

ENQIDU debe evolucionar como aplicacion generica de entrenamiento y coach. Los
datos Jotason existen porque son el piloto real y el dataset mas rico.

## Decision

ENQIDU es generico. Jotason es fixture/piloto.

## Consecuencias

- Nada especifico de Jotason se hardcodea en runtime.
- Jotason puede validar el modelo, pero no definirlo.
- Los datos Jotason solo viven en `references/jotason` o `fixtures/jotason`.


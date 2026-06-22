# ENQIDU Coach Context

Este directorio separa el modelo generico de ENQIDU de los datos del piloto
JOTASON.

El objetivo es versionar el conocimiento que necesita el coach AI sin tocar el
runtime de la aplicacion. Los contratos de `schema/` deben servir para cualquier
usuario. Los datos concretos de Joaquin/JOTASON viven solo en
`examples/jotason/`.

## Mapa

```text
Generic schemas
-> user-specific profile instances
-> Supabase user data
-> coach AI planning
-> planned/executed sessions
```

## Estructura

```text
docs/coach-context/
  schema/      Contratos genericos ENQIDU, sin datos de usuario hardcodeados.
  rules/       Reglas de decision y renderizado para el coach.
  examples/    Instancias de ejemplo por usuario o piloto.
```

## Capas

1. **ENQIDU generic model**: JSON Schemas y reglas que describen perfiles,
   objetivos, restricciones, inventario, disponibilidad y semanas planificadas.
2. **JOTASON pilot data**: instancia historica del piloto para validar el
   contrato y conservar contexto operacional.

Los schemas no implican tablas, RPCs ni cambios de runtime. Son contratos de
contexto para alimentar servicios existentes o futuros de planificacion.

## Limites

- No hardcodear JOTASON en la logica de la app.
- No convertir datos del piloto en defaults universales.
- No mezclar sesiones planificadas con sesiones ejecutadas.
- No usar payloads Garmin/FIT crudos como contrato de coach.


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
-> user-specific equipment inventories by location
-> user-specific goals
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

## Ubicaciones Y Material

El material disponible no es global por defecto. Cada inventario debe declarar
su ubicacion o ambito:

- `home`: material propio del usuario en casa.
- `gym`: material conocido de un gimnasio concreto.
- `studio`: contexto de clase o sesion guiada.
- `outdoor`: contexto exterior.
- `outside_home` o `unknown`: usar solo datos explicitos o criterios genericos.

En el piloto JOTASON, `inventory_home_v4` representa solo material de casa. No
se debe usar para sesiones `outside_home`, `gym`, `studio`, `outdoor` o
`unknown` salvo que el usuario lo indique explicitamente para esa sesion.

## Piloto JOTASON

Para JOTASON hay dos fuentes con papeles distintos:

1. `promaestro-v5-summary.json`: paraguas global de objetivos, prioridades,
   estructura semanal y reglas maestras.
2. `home-equipment-inventory.json`: material disponible en casa, aplicable solo
   cuando `location_type = "home"`.

## Limites

- No hardcodear JOTASON en la logica de la app.
- No convertir datos del piloto en defaults universales.
- No fusionar Promaestro V5 y el inventario de casa como si fueran una sola
  fuente.
- No usar inventario de casa para sesiones fuera de casa.
- No mezclar sesiones planificadas con sesiones ejecutadas.
- No usar payloads Garmin/FIT crudos como contrato de coach.

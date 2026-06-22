# Coach Decision Rules

Estas reglas son genericas para ENQIDU. No pertenecen a un atleta concreto.
Los ejemplos JOTASON solo sirven como instancia piloto y no deben convertirse en
defaults universales.

## Flujo

1. Leer el objetivo global del usuario. En el piloto JOTASON, leer Promaestro
   V5 como fuente global de objetivos, prioridades, estructura semanal y reglas
   maestras.
2. Leer disponibilidad del usuario.
3. Leer `location_type` de cada sesion o inferirlo solo si el usuario lo ha
   dejado claro.
4. Si `location_type = "home"`, usar el inventario home del usuario. En el
   piloto JOTASON, ese inventario es `inventory_home_v4`.
5. Si `location_type != "home"`, no usar el inventario home salvo indicacion
   expresa del usuario para esa sesion.
6. Leer historial reciente, incluyendo carga, sesiones ejecutadas, descanso y
   senales subjetivas.
7. Leer molestias, restricciones y politica de riesgo.
8. Proponer sesion, adaptacion o criterios de ejecucion coherentes con el
   contexto.
9. Guardar la intencion como `PlannedSession` o `PlannedWeek` cuando el usuario
   lo confirme o el flujo autorizado lo permita.
10. No modificar sesiones ejecutadas salvo accion explicita del usuario.

## Prioridades De Decision

- Seguridad y restricciones activas prevalecen sobre objetivos de rendimiento.
- Disponibilidad real prevalece sobre una semana ideal.
- La ubicacion de la sesion decide que inventario puede usarse.
- El material disponible condiciona la seleccion de ejercicios solo dentro de
  su ubicacion valida.
- El historial reciente evita duplicar estres, impacto o patrones de carga.
- El coach puede proponer alternativas cuando falten datos, pero debe marcar la
  incertidumbre.

## Reglas De Ubicacion

- `home`: el coach puede disenar una sesion completa con el inventario de casa
  del usuario.
- `outside_home`: el coach no debe asumir material de casa. Puede planificar
  intencion, RPE, restricciones y criterios de adaptacion.
- `gym`: usar solo material explicitamente conocido de ese gimnasio o dictado
  por el usuario.
- `studio`: tratar como sesion externa guiada; registrar objetivo, duracion,
  restricciones y notas sin inventar material.
- `outdoor`: planificar por terreno, duracion, intensidad y seguridad; no
  asumir material de casa.
- `unknown`: pedir aclaracion o planificar sin equipamiento concreto.

## Planned Vs Executed

El coach planifica intenciones futuras. Una sesion ejecutada es evidencia
historica. Reconciliar plan y real puede ser una funcion futura, pero no debe
ocurrir de forma implicita ni destruir datos objetivos.

## Ejemplo JOTASON

Para el piloto JOTASON, estas reglas se aplican leyendo los JSON de
`docs/coach-context/examples/jotason/`.

Promaestro V5 gobierna el objetivo global:

- `primary`: `functional_lean_mass_full_body`.
- `secondary`: `skills_mastery`.
- `tertiary`: `endurance_events_trail_triathlon`.

`inventory_home_v4` gobierna solo el material de casa. Por ejemplo, para una
sesion `home` el coach puede usar front squat con barra, landmine press, ring
row, kettlebell goblet squat, Pallof press con bandas, step-up con box o foam
roller si encajan con la restriccion lumbar. Para una sesion `outside_home`
debe limitarse a intencion y criterios salvo que el usuario dicte material o
ejercicios externos.

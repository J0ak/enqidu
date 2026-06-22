# Location Equipment Rules

Estas reglas son genericas para ENQIDU. El inventario de un usuario solo puede
usarse dentro de la ubicacion para la que fue declarado.

## Home

- Usar el inventario home del usuario.
- En el piloto JOTASON, usar `inventory_home_v4`.
- La IA puede disenar ejercicios completos.
- La IA puede proponer material y cargas compatibles con casa.
- Las propuestas deben seguir restricciones activas, historial reciente y
  readiness.

## Outside Home / Gym

- No usar el inventario home.
- Usar solo informacion explicita del usuario, del entrenamiento externo o de
  un inventario especifico de ese gimnasio si existe.
- No prescribir cargas ni material de casa.
- Si el entrenamiento externo ya viene definido, registrarlo como
  `PlannedSession` o `ExecutedSession` segun corresponda.
- Si faltan detalles, proponer criterios de adaptacion, no material concreto
  inventado.

## Studio / Yoga

- Tratar como sesion externa guiada.
- No inventar material.
- Registrar objetivo, duracion, restricciones y notas.
- Si el usuario dicta bloques o ejercicios de la clase, guardarlos como planned
  blocks o performed blocks segun corresponda.

## Outdoor

- Planificar por duracion, terreno, intensidad, seguridad, desnivel o ruta
  cuando esos datos existan.
- No asumir material de casa.
- El material solo aparece si el usuario lo indica para esa salida.

## Unknown

- Pedir aclaracion o planificar de forma generica sin equipamiento.
- Si el usuario no responde y hay que proponer, usar criterios de intensidad,
  movilidad, duracion y seguridad sin inventario concreto.

## Regla Critica Para ChatGPT

- Si el usuario dice "en casa", puede disenar la sesion con el inventario home.
- Si el usuario dice "fuera de casa", no usar el inventario home.
- Si el usuario dice "gimnasio" o "clase", tratar como entrenamiento externo.
- Si el usuario dicta ejercicios externos, guardarlos como planned blocks.
- Si no hay material externo, no inventarlo.


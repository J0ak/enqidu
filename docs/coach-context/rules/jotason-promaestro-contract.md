# JOTASON / Promaestro Pilot Contract

JOTASON/Promaestro es una implementacion piloto y una fuente historica de
referencia. Sirve para validar el contrato del coach con un caso real, pero no
define el modelo universal de ENQIDU.

ENQIDU debe abstraer estos contratos para soportar otros usuarios, atletas,
objetivos, restricciones, inventarios y disponibilidades.

## Alcance Del Piloto

El piloto conserva contexto sobre Joaquin/JOTASON:

- perfil de atleta hibrido;
- Promaestro V5 como paraguas global de objetivos, prioridades, estructura
  semanal, reglas maestras y criterios de decision del coach;
- objetivos de masa magra funcional full body, mastery de skills, rendimiento
  hibrido, trail y triatlon;
- sensibilidad lumbar;
- `inventory_home_v4` como material disponible solo en casa;
- disponibilidad semanal;
- reglas historicas de captura manual y planned sessions.

Estos datos deben residir en `docs/coach-context/examples/jotason/` o en datos
de usuario persistidos. No deben aparecer hardcodeados en runtime.

## Relacion Con Promaestro

Promaestro actua como antecedente conceptual del piloto: un coach que interpreta
contexto, decide con restricciones y genera planes accionables. ENQIDU toma esa
experiencia y la convierte en contratos genericos.

Promaestro V5 no es inventario. Debe tratarse como fuente principal para:

- objetivos globales;
- prioridades;
- estructura semanal;
- reglas maestras del entrenamiento;
- criterios de decision del coach.

El inventario home no es Promaestro. Debe tratarse como material disponible
exclusivamente cuando `location_type = "home"`.

## Regla De Abstraccion

Cuando una regla sea valida para cualquier usuario, moverla a `rules/` o
`schema/`.

Cuando un dato dependa de Joaquin/JOTASON, mantenerlo en
`examples/jotason/` o en la base de datos del usuario.

Cuando una decision combine ambas cosas, documentar la regla generica y dejar
el ejemplo piloto como instancia.

## Fuentes Piloto

- `examples/jotason/promaestro-v5-summary.json`: resumen versionado del paraguas
  Promaestro V5.
- `examples/jotason/weekly-structure.json`: estructura semanal base derivada de
  Promaestro V5.
- `examples/jotason/home-equipment-inventory.json`: inventario home derivado de
  `inventory_home_v4`.
- `examples/jotason/location-rules.json`: reglas de uso de material por
  ubicacion.

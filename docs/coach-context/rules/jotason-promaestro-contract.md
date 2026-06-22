# JOTASON / Promaestro Pilot Contract

JOTASON/Promaestro es una implementacion piloto y una fuente historica de
referencia. Sirve para validar el contrato del coach con un caso real, pero no
define el modelo universal de ENQIDU.

ENQIDU debe abstraer estos contratos para soportar otros usuarios, atletas,
objetivos, restricciones, inventarios y disponibilidades.

## Alcance Del Piloto

El piloto conserva contexto sobre Joaquin/JOTASON:

- perfil de atleta hibrido;
- objetivos de masa magra, fuerza de pierna, rendimiento hibrido, trail y
  skills;
- sensibilidad lumbar;
- material disponible;
- disponibilidad semanal;
- reglas historicas de captura manual y planned sessions.

Estos datos deben residir en `docs/coach-context/examples/jotason/` o en datos
de usuario persistidos. No deben aparecer hardcodeados en runtime.

## Relacion Con Promaestro

Promaestro actua como antecedente conceptual del piloto: un coach que interpreta
contexto, decide con restricciones y genera planes accionables. ENQIDU toma esa
experiencia y la convierte en contratos genericos.

## Regla De Abstraccion

Cuando una regla sea valida para cualquier usuario, moverla a `rules/` o
`schema/`.

Cuando un dato dependa de Joaquin/JOTASON, mantenerlo en
`examples/jotason/` o en la base de datos del usuario.

Cuando una decision combine ambas cosas, documentar la regla generica y dejar
el ejemplo piloto como instancia.


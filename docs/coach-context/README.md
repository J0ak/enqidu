# ENQIDU Coach Context

Este directorio define la arquitectura inicial del contexto del coach ENQIDU.

ENQIDU es un producto generico. Jotason es un piloto, fixture de validacion,
referencia historica y ejemplo real. Los JSON existentes se preservan como
referencias y fixtures cuando esten disponibles.

Este PR no modifica runtime, Supabase, Garmin/FIT ni UI.

Evolucion prevista:

```text
JSON existentes
-> documentacion y manifiesto
-> adaptadores JavaScript
-> validadores
-> Supabase
-> IA integrada
```

Mapa de contexto:

```text
ChatGPT pilot memory
-> JSON references/fixtures
-> docs/coach-context
-> JS adapters
-> Supabase live user data
-> integrated Coach AI
```

Reglas de alcance:

- Markdown guarda decisiones humanas, arquitectura y reglas.
- JSON existentes guardan datos, contratos y fixtures de referencia.
- JavaScript normalizara estos JSON en adaptadores futuros.
- Supabase guardara datos vivos, editables y por usuario en una fase posterior.
- Jotason no debe hardcodearse en runtime, componentes, rutas, tablas, render ni logica de coach.


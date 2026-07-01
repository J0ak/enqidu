# Fixture Jotason vs contexto real de usuario

## Contexto real

El contexto real pertenece a un usuario autenticado y se guarda con `user_id`.

Debe usarse para:

- personalizar la experiencia del usuario real;
- guardar objetivos confirmados;
- guardar restricciones, lesiones o preferencias relevantes;
- guardar inventario disponible;
- alimentar futuros prompts del Coach.

Debe leerse con:

- JWT valido;
- RLS activa;
- filtros por `user_id`;
- DTO compacto, sin exponer payloads crudos sensibles.

## Fixture Jotason

El fixture Jotason es diagnostico, test y documentacion. No es la fuente viva del producto.

Solo debe usarse cuando la llamada pida explicitamente:

```json
{
  "mode": "fixture_diagnostic",
  "fixture_user": "jotason"
}
```

En ese modo:

- las tablas `coach_*` con `user_id` se leen con `fixture_user = "jotason"` y `user_id is null`;
- `coach_seed_runs` se lee solo por `fixture_user`, porque esa tabla no tiene `user_id`;
- si no existe service role en la Edge Function, la respuesta debe ser `empty` con warning, no un fallo de producto;
- la UI debe mostrar `Modo piloto` y `Origen: Fixture Jotason`.

## Reglas de separacion

- No mezclar filas fixture con filas reales.
- No hardcodear Jotason en logica normal de producto.
- No duplicar actividades reales como fixtures.
- No leer JSON como fuente viva.
- No tocar Garmin/FIT desde Coach Context.
- No exponer service role en frontend.

## Estado UI esperado

Usuario real con contexto:

- titulo: `Contexto del entrenador`;
- estado: `Activo para tu usuario`;
- objetivo o inventario;
- ultima actualizacion si existe.

Usuario real sin contexto:

- titulo: `Contexto del entrenador`;
- estado: `Sin contexto real todavia`;
- texto: `Puedes crearlo conversando con el Coach.`

Fixture diagnostico:

- titulo: `Contexto del entrenador`;
- estado: `Modo piloto`;
- conteos de fuentes y sesiones de referencia;
- origen: `Fixture Jotason`.

Error:

- titulo: `Contexto del entrenador`;
- estado: `No disponible`;
- mensaje breve sin stacktrace.

## Siguiente paso fuera de este PR

Despues de revisar este PR, el siguiente trabajo puede ser una via separada para corregir sesiones ya guardadas desde conversacion. Esa correccion debe vivir en otro PR y no debe tocar Garmin/FIT ni duplicar sesiones.

La integracion de `coach-reply` con Coach Context real tambien debe ir en otro PR incremental.

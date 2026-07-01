# Coach Context real por usuario

Estado de este PR: base funcional para que Coach Context deje de depender de fixtures como fuente viva y pueda guardar memoria conversacional por `user_id` en Supabase.

## Principios

- Supabase es la fuente de verdad del contexto vivo del Coach.
- La conversacion es el mecanismo principal para capturar memoria nueva.
- Los JSON quedan limitados a fixture, seed, test, import puntual o trazabilidad.
- El fixture Jotason solo puede usarse en modo diagnostico explicito.
- Garmin/FIT sigue siendo la fuente de actividades y metricas reales.
- Coach Context no duplica datos Garmin/FIT; resume hechos utiles para personalizar el Coach.

## Flujo objetivo

1. El usuario conversa, dicta o corrige informacion.
2. Una capa de extraccion genera hechos estructurados.
3. `coach-context-memory` permite previsualizar el cambio.
4. El usuario confirma o una regla segura aplica el cambio.
5. El cambio se guarda en tablas `coach_*` con `user_id`.
6. `coach-context` lee un DTO compacto para la UI y para futuros prompts.
7. La UI muestra estado, origen y trazabilidad basica.

## Implementado ahora

- `coach-context` lee por `user_id` en modo normal.
- `coach-context` mantiene fixture solo con `mode = "fixture_diagnostic"` y `fixture_user = "jotason"`.
- `coach_seed_runs` ya no recibe filtro `user_id` en modo fixture.
- `coach-context-memory` acepta `preview` y `apply` con JWT real.
- `coach-context-memory` obtiene el usuario con `auth.getUser()` y escribe con RLS.
- `coach-context-memory` guarda trazabilidad en `coach_context_sources`.
- Objetivos, restricciones y material se guardan en tablas `coach_*` existentes.
- Preferencias y notas quedan preservadas en snapshot cuando no hay columna estructurada adecuada.
- La UI solo prepara una nota conversacional para el Coach; no ejecuta `preview`/`apply` automaticamente en este PR.

## No implementado en este PR

- Extraccion LLM automatica desde texto libre.
- Integracion completa de `coach-reply` con el nuevo DTO de Coach Context.
- Correccion conversacional de sesiones ya guardadas.
- Aplicacion automatica desde la tarjeta UI.
- Nuevas migraciones de esquema.

## Contrato minimo de memoria

Entrada conceptual:

```json
{
  "mode": "preview",
  "capture_type": "coach_memory_conversation",
  "local_date": "2026-07-01",
  "message": {
    "source": "coach_chat",
    "language": "es",
    "text": "..."
  },
  "extracted": {
    "profile": {},
    "goals": [],
    "constraints": [],
    "equipment": [],
    "preferences": [],
    "notes": []
  }
}
```

Respuesta compacta:

```json
{
  "ok": true,
  "mode": "preview",
  "user_id": "...",
  "changes": {
    "profile": 0,
    "goals": 1,
    "constraints": 1,
    "equipment": 3,
    "sources": 1
  },
  "warnings": []
}
```

## Seguridad y limites

- `verify_jwt = true` queda declarado para las Edge Functions.
- No se usa `SUPABASE_SERVICE_ROLE_KEY` en frontend.
- `coach-context-memory` no usa `fixture_user`.
- `coach-context-memory` valida modo, tipo de captura y tamanos maximos.
- `preview` no escribe en base de datos.
- `apply` escribe solo en tablas `coach_*`.
- La respuesta no devuelve texto completo de conversacion; guarda hash y longitud para trazabilidad.

## Relacion con Garmin/FIT

Garmin/FIT permanece intacto. Las tablas de actividad real, muestras, laps, FIT payloads, raw payloads, splits y metricas originales no se modifican en este flujo.

Cuando el Coach necesite combinar memoria y entrenamiento real, el orden correcto sera:

1. Prompt base del Coach.
2. Coach Context real por `user_id`.
3. Actividades reales recientes desde Supabase.
4. Sesion o peticion actual.

Ese consumo por `coach-reply` queda para un PR separado.

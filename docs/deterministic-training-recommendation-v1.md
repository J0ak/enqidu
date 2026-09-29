# Recomendación determinista del entrenamiento de hoy V1

## Alcance y arquitectura

La pregunta sobre qué entrenar hoy sigue este flujo:

1. `coach-reply` obtiene el contexto mediante el RPC autenticado existente y carga
   `planned_training_sessions`/`planned_session_blocks` con el JWT del usuario y RLS.
2. `trainingRecommendation.js` normaliza objetivos, restricciones, recuperación,
   historial, entorno y material disponibles en el contexto.
3. El motor aplica reglas puras y devuelve una sesión estructurada o un resultado
   explícito de datos insuficientes.
4. `coachDeterministicReply.js` crea la explicación sin LLM.
5. `coachCards.js` presenta `planned_training_today` si existe plan o, de forma
   excluyente, `recommended_training_today` si el motor calculó una propuesta.

No se escribe ninguna recomendación. La tabla `recommended_sessions` no se usa en
V1 y nunca se modifica `planned_training_sessions`: recomendar no equivale a
planificar. Tampoco se añadieron migraciones, políticas ni permisos.

## Precedencia y reglas

- Un plan existente siempre tiene precedencia y evita ejecutar el motor.
- Una señal de readiness marcada como baja, o un score inferior a `62`, produce
  recuperación activa. El límite reutiliza la clasificación ya visible en ENQIDU
  (`main.jsx`) y está centralizado en `RECOMMENDATION_RULES`.
- Una restricción activa compatible con lesión o impacto fuerza una propuesta sin
  impacto ni carga incompatible.
- Una sesión intensa en los dos días anteriores no repite la misma modalidad. La
  ventana está centralizada y se aplica solo si la sesión contiene intensidad
  explícita; no se deduce intensidad de métricas ausentes.
- Los objetivos activos orientan fuerza o resistencia, sin anular recuperación o
  restricciones.
- Un entorno solicitado tiene precedencia. El material se filtra por disponibilidad
  y entorno, y únicamente sus nombres reales aparecen en la recomendación.
- Sin señales accionables (historial, objetivos, restricciones, recuperación,
  entorno o material), se explica que faltan datos y no se genera card.

Las duraciones de V1 son plantillas de producto para dimensionar los bloques, no
umbrales médicos ni una inferencia fisiológica. La intensidad nunca supera
“moderada” y la recuperación propuesta es “baja”.

## Contrato y seguridad

Las respuestas de este intent mantienen `response_mode="deterministic"`,
`llm_used=false` y `usage=null`. El endpoint retorna antes del camino opcional de
OpenAI para este intent incluso si `OPENAI_COACH_ENABLED` estuviera habilitado para
otras conversaciones.

La card recomendada lleva procedencia
`enkidu_deterministic_recommendation`, subtítulo “Recomendación calculada · no
guardada” y tipo `recommended_session_summary`, para no confundirse con el plan
persistido.

## Limitaciones V1

- El motor consume solo campos ya presentes en el contexto del Coach; no consulta
  proveedores externos.
- La detección de restricciones y modalidades usa vocabulario explícito en español
  e inglés. Una restricción no descrita de forma reconocible no puede interpretarse
  de manera segura.
- HRV sin estado/baseline individual se muestra como dato, pero no se clasifica como
  alta o baja.
- La carga se usa solo cuando el contexto la expresa como intensidad; V1 no inventa
  una carga a partir de datos parciales.

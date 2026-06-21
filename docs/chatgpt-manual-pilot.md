# ChatGPT Manual Pilot Bridge

Este piloto permite usar ChatGPT como intérprete manual sin conectar todavía una `OPENAI_API_KEY` en Supabase.

El flujo es:

1. El atleta escribe o dicta un mensaje en ENQIDU.
2. El mensaje humano se copia y se pega en ChatGPT.
3. ChatGPT consulta contexto seguro con `chatgpt_pilot_*`.
4. ChatGPT devuelve una captura JSON estructurada.
5. La captura se valida con `chatgpt_pilot_preview_capture`.
6. Si el preview es correcto, se graba con `chatgpt_pilot_apply_capture`.
7. ENQIDU muestra la sesión Garmin/FIT enriquecida o una sesión manual provisional.
8. Se registra coste simulado en `enkidu_ai_usage_estimates`.

## Por Qué No Consume OpenAI API

Este modo no llama a OpenAI desde Supabase ni desde una Edge Function. ChatGPT hace la interpretación en la conversación actual y usa Supabase solo para leer contexto compacto y escribir una captura validada.

`coach-reply` puede seguir desplegada y devolver `openai_api_key_missing` hasta que se active el flujo automático real.

## Funciones SQL

Funciones públicas del piloto:

- `chatgpt_pilot_status()`: comprueba si el piloto está activo y muestra límites seguros.
- `chatgpt_pilot_find_session(date, text)`: localiza sesiones del usuario piloto por fecha.
- `chatgpt_pilot_get_safe_context(date, uuid, text)`: devuelve contexto mínimo para interpretar un mensaje.
- `chatgpt_pilot_preview_capture(jsonb)`: valida una captura sin grabar.
- `chatgpt_pilot_apply_capture(jsonb)`: graba enriquecimiento, bloques, ejercicios, métricas y coste simulado.
- `chatgpt_pilot_record_cost_estimate(uuid, uuid, jsonb)`: registra coste estimado sin llamar a OpenAI.

Todas operan sobre el usuario configurado en `chatgpt_pilot_config`. No aceptan `user_id` arbitrario y no dependen de `auth.uid()`.

## Uso Desde ChatGPT

Comprobar estado:

```sql
select public.chatgpt_pilot_status();
```

Buscar una sesión:

```sql
select public.chatgpt_pilot_find_session(date '2026-06-18', null);
```

Leer contexto seguro:

```sql
select public.chatgpt_pilot_get_safe_context(date '2026-06-18', null, 'capture');
```

Validar antes de grabar:

```sql
select public.chatgpt_pilot_preview_capture($json$
{
  "capture_type": "training_session_conversation",
  "local_date": "2026-06-18",
  "target": {
    "mode": "enrich_existing_session",
    "session_id": null
  },
  "user_message": {
    "source": "copied_from_enqidu_chat",
    "text": "Clase de yoga suave, movilidad, respiración y estiramientos.",
    "language": "es"
  },
  "coach_interpretation": {
    "summary": "Yoga suave con movilidad, respiración y estiramientos.",
    "session_intent": "Yoga / movilidad / recuperación",
    "pain_or_risk_flags": [],
    "confidence": "reported"
  },
  "blocks": [
    {
      "order": 1,
      "type": "mobility",
      "name": "Yoga suave",
      "summary": "Movilidad, respiración y estiramientos.",
      "confidence": "reported",
      "exercises": [
        {
          "order": 1,
          "name": "Movilidad y respiración",
          "confidence": "reported"
        }
      ]
    }
  ],
  "metrics": [],
  "ai_cost_estimate": {
    "model_simulated": "gpt-5.5-mini",
    "input_tokens_estimated": 800,
    "output_tokens_estimated": 500,
    "total_cost_eur_estimated": 0.001
  }
}
$json$::jsonb);
```

Aplicar si el preview devuelve `ok=true`:

```sql
select public.chatgpt_pilot_apply_capture($json$
{ "...": "misma captura validada" }
$json$::jsonb);
```

## Límites de Seguridad

El piloto:

- No devuelve tablas crudas.
- No devuelve FIT crudo, `payload`, `raw_payload` ni `original_payload`.
- No acepta nombres de tablas, columnas, SQL ni `user_id`.
- Rechaza claves peligrosas en cualquier nivel del JSON.
- Limita mensaje, bloques y ejercicios según `chatgpt_pilot_config`.
- Usa `SECURITY DEFINER SET search_path = public, pg_temp`.
- Opera solo sobre el usuario piloto configurado.
- No modifica datos Garmin objetivos: duración, distancia, frecuencia cardiaca, calorías, laps o samples.

Claves rechazadas:

```text
raw_payload, original_payload, payload_sql, sql, query, table, schema,
fit_message_payload, session_samples, wearable_provider_raw_payloads,
service_role, openai_api_key, password, secret, token
```

## Coste Simulado

El coste se guarda en `enkidu_ai_usage_estimates` con:

- `phase='chatgpt_manual_pilot'`
- modelo simulado
- tokens estimados de entrada y salida
- coste EUR estimado
- sesión y enriquecimiento asociado
- `exact_billing_available=false`

Esto permite medir el flujo antes de activar una llamada real a OpenAI.

## Paso A Coach Real

Cuando se active `OPENAI_API_KEY`, el flujo manual se puede sustituir por:

1. `coach-reply` recibe el mensaje dentro de ENQIDU.
2. La Edge Function obtiene contexto con las RPC normales autenticadas.
3. El modelo interpreta y devuelve respuesta.
4. El backend graba capturas usando una ruta controlada equivalente al piloto.
5. El coste real sustituye o complementa el coste simulado.

Hasta entonces, este puente permite validar interpretación, persistencia, visualización y costes sin bloquearse por payloads grandes ni por falta de JWT del conector.

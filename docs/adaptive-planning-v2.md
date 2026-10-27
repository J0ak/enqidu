# #106 — Adaptive Planning V2: expediente de auditoría

Base auditada y comprobada mediante `git fetch origin`: `05b093ae70af9ad184a87c1161c73245f597e601`. Se volvió a comprobar tras recuperar el entorno el 27/10/2026; `origin/main` seguía en esa revisión. Rama: `codex/106-adaptive-planning-v2`.

## Contrato y alcance

`Canonical state → deterministic assessment → proposal → preview → explicit confirmation → existing transactional action → persisted readback`.

La evaluación `adaptive_assessment_v2`, política `enqidu.adaptive.v2.0.0`, devuelve `safe_proposal`, `requires_choice`, `insufficient_information`, `ambiguous_request`, `not_admissible` o `no_change`. Incluye IDs de reglas, códigos de motivos, versiones de políticas, calendario del perfil, referencias acotadas y, cuando procede, el preview existente. `llm_used=false`, `usage=null`. No hay modelo, planner nuevo, scheduler, servicio de pago ni escrituras desde la evaluación.

El parser reconoce frases completas y acotadas. El texto no construye nombres de tools, tablas, RPC, SQL ni identidades. Las selecciones por tarjeta contienen referencias; el servidor vuelve a autenticar, releer y comprobar ownership. No se usan tarjetas previas como fuente de hechos. Los fast paths anteriores conservan su ruta, pero resuelven su referencia contra el plan persistido de la semana antes del preview.

`get_adaptive_assessment_v2` se clasifica como **PREVIEW**, aunque su nombre empiece por `get`, porque puede construir un preview. En Remote MCP requiere `enqidu.read` + `enqidu.preview`; no habilita escrituras.

## Operaciones reutilizadas y piezas nuevas

| Necesidad | Autoridad reutilizada | Cambio de #106 |
|---|---|---|
| Identidad/calendario | `createEnqiduToolRuntime`, Auth, `profiles.timezone`, `userCalendar` | Ninguna identidad o zona desde texto/args |
| Plan del día/semana | `get_today_plan`, `get_week_plan`, `loadActionPlans` | Orquestación y selección explícita de sesiones persistidas |
| Duración | `adapt_duration`, `scalePlannedBlockDurations`, `adapt_coach_planned_session_duration` | Guarda semántica y selector opcional de plan; escritor existente intacto |
| Casa/material | `adapt_environment`, inventario/ubicaciones DB, `buildTrainingRecommendation` | Presentación explícita como reemplazo; ninguna sustitución inventada |
| Mal sueño | `get_health_status`, `get_readiness`, `get_morning_coach_brief`, `get_daily_coach_operating_brief` | Consume decisiones existentes; vincula evidencia matinal al fingerprint y la relee en apply |
| Sobrecarga | `get_recent_training`, `get_training_session`, `get_closed_loop_assessment`, `preview_closed_loop_proposal` | Selección de ejecución y exigencia de enlace exacto/medidas comparables |
| Indisponibilidad | `set_training_unavailability`, `set_coach_training_unavailability` | READ/PREVIEW/confirmación y entrada en `apply_enqidu_action_v1`; se elimina el auto-apply first-party |
| Semana | `adapt_remaining_week`, `planRemainingWeekReschedule`, escritor semanal existente | Paridad de estados terminales JS/SQL y límite de semana |
| Confirmación | Fingerprint, TTL, reautenticación, wrapper transaccional, readback | Readback específico de disponibilidad, incluso mañana fuera de la semana actual |
| Presentación | `CoachActionPreview`, `actionPreviewView`, Coach cards | Disponibilidad antes/después, pérdidas por reemplazo, selección; sin JSON/UUID visible |
| Progress/#105 | Dominios y contratos existentes | No se modifica el motor de progreso, resolución de ejercicios ni materialización semántica |

Piezas nuevas: `src/adaptivePlanning/{interpreter,assessment,contract,presentation}.js`, tests específicos y una migración. El resto son cambios puntuales en los componentes reutilizados; no se crean tablas.

## Reglas

| Regla | Resultado y evidencia |
|---|---|
| `AP2.BOUNDED_LANGUAGE` | Una frase incompleta/compuesta reconocida requiere aclaración; no se ejecuta como instrucción parcial |
| `AP2.PERSISTED_PLAN` | Ausencia de plan se informa como ausencia, nunca como descanso |
| `AP2.PENDING_PLAN` / `AP2.UNIQUE_PLAN` / `AP2.OWNED_SELECTION` | Se reutiliza la elegibilidad pendiente: ninguna ejecución enlazada ni estado cancelled/canceled/skipped/completed/enriched. Varias candidatas requieren elección; una referencia ajena o retirada falla |
| `AP2.PERSISTED_REST` / `AP2.ENVIRONMENT_UNCHANGED` | Descanso explícito o entorno ya solicitado: no cambio |
| `AP2.DURATION_BOUNDS` | Entero de 10–180 min, sujeto a la estructura real de bloques |
| `AP2.EXACT_EXECUTION` | La lista de actividades sólo permite elegir; identidad de ejecución exclusivamente mediante enlace persistido exacto |
| `AP2.COMPARABLE_EVIDENCE` / `AP2.EXISTING_PROPOSAL` | Se exige comparación canónica y propuesta de reducción/recovery existente; exceso de duración por sí solo no crea una política nueva |
| `AP2.HEALTH_REVIEW` | El relato de mal sueño no crea mediciones ni diagnósticos. Health ausente, parcial o stale conserva sus limitaciones |
| `AP2.ACTION_PREFLIGHT` | El dominio existente prepara o rechaza. Sólo un preview aplicable permite confirmación |

Políticas reutilizadas: `training_recommendation_v1.1`, Morning Coach V1, readiness V1, Closed Loop V1 y `enqidu.closed-loop-action.v1.0.0`. Sus umbrales/cálculos no se duplican en la evaluación.

### Duración: `enqidu.duration.v2.0.0`

El algoritmo anterior repartía minutos proporcionalmente entre **todos** los bloques, con mínimo de un minuto por bloque y mayores restos para redondear. Podía acortar calentamiento, recuperación o una prescripción de fuerza manteniendo sus series/repeticiones intactas.

La nueva regla autoriza reducir únicamente bloques tipados `aerobic` cuya única prescripción modificable sea el tiempo: sin ejercicios, rondas, restricciones, objetivo ni notas secundarios. Todos los demás bloques conservan exactamente su duración y contenido. Si la sesión contiene un objetivo, notas del Coach o restricciones globales, una reducción exige revisión: esos campos pueden imponer distancia, trabajo o seguridad que los bloques por sí solos no demuestran conservar. No se interpretan notas libres como autorizaciones; incluso una nota meramente informativa mantiene esta limitación conservadora. Un no-op sigue siendo no-op. No se infiere semántica por título. Se rechazan aumentos, tiempos no enteros en minutos, duraciones ausentes/cero, sesiones sin bloques, más de 12 bloques y objetivos incompatibles con los bloques fijos. Cada bloque ajustable conserva al menos un minuto; el total debe ser exacto y ningún bloque puede aumentar por redondeo. Un no-op conserva la estructura sin redistribuirla.

Se mantienen el orden, IDs y contenido de los bloques. No se fabrican ejercicios, series, repeticiones ni cargas. La guarda semántica también existe en la frontera SQL para rechazar un comando privilegiado incoherente; no se cambia el escritor de duración.

Esta restricción es deliberada: las prescripciones detalladas necesitan revisión. Los fixtures de aceptación de reducción se han tipado como aeróbicos sólo por duración; se conserva la prescripción histórica de fuerza y se añaden pruebas explícitas de rechazo. No se eliminan tests ni se modifica un golden histórico para ocultar una regresión.

### Entorno

`adapt_environment` ya reemplaza los bloques mediante el recomendador existente. El preview ahora dice **reemplazar** y muestra el contenido anterior perdido, la nueva prescripción, fechas, duración y entorno. El inventario no se mezcla entre ubicaciones; se respetan restricciones y `coach_led_only`.

No existe catálogo autoritativo de equivalencias de ejercicios en este flujo. Por ello #106 no promete conservar la sesión mediante sustituciones. Si la prescripción actual ya corresponde a casa, no hay cambio; si la política puede producir una nueva prescripción, se ofrece como reemplazo; si no puede, se pide revisión. Ausencia de material no implica automáticamente imposibilidad: una nueva prescripción sin material sólo procede si el recomendador existente la permite.

## Transacción, seguridad y concurrencia

Migración única: `supabase/migrations/20261025193006_adaptive_planning_v2.sql`. Reemplaza la definición completa de **la misma** RPC `apply_enqidu_action_v1`, como exige `CREATE OR REPLACE FUNCTION`; los cambios lógicos son acotados:

1. Añade la operación cerrada `set_training_unavailability`, con alcance hoy/mañana y comando `sourceDate`.
2. Compara plan, bloques, perfil y disponibilidad bajo los locks existentes **antes** de llamar al UPSERT existente en la misma transacción. Se incluye `availability.updated_at` para detectar revisiones incluso con el mismo valor.
3. Permite seleccionar por el `sessionId` ya admitido por los escritores de duración/entorno; sin selección el dominio sigue rechazando ambigüedad. Ownership y fecha se comprueban siempre.
4. Valida que una reducción no cambie bloques no reducibles, incremente tiempos ni ignore instrucciones globales de la sesión.

Se conservan `security invoker`, `search_path` cerrado, privilegios exclusivos de `service_role`, locks de fechas/filas/tablas, comparación completa, rollback atómico e aislamiento `READ COMMITTED`. No hay nuevos grants al navegador, tablas, triggers, LLM ni escrituras sobre actividades/FIT.

La inspección sólo lectura del contrato productivo el 26/10/2026 confirma que `training_availability_overrides` sólo admite `unavailable`; ausencia de override no es una fila `available`. El CHECK actual de planes tampoco permite persistir `completed` ni `enriched`. Se conserva ese CHECK: el dominio y la RPC rechazan defensivamente esos estados históricos/de entrada, y los tests SQL comprueban tanto el rechazo del CHECK como el de snapshots falsificados. `skipped` y `cancelled` sí se verifican como estados persistidos. No se amplía el esquema para acomodar fixtures.

La indisponibilidad mostrada aún no guarda nada. Tras confirmación, un segundo apply del mismo preview falla stale sin cambiar `xmin`; un nuevo preview de un día ya no disponible es no-op. El endpoint de compatibilidad también exige preview/confirmación y delega en el runtime común, con reautenticación y readback.

La caducidad de cinco minutos y el calendario se validan al admitir la acción, como en la frontera existente. Los locks de tablas siguen siendo una barrera conservadora contra inserciones fantasma y serializan escrituras de planificación entre atletas; las lecturas continúan. La evidencia de Health/Closed Loop se relee y vincula al fingerprint, pero no se convierte en autoridad SQL de prescripción ni se bloquean las tablas de Health durante la transacción.

## Validación

Los resultados definitivos, comandos, entorno y CI se registran en `adaptive-planning-v2-validation.md`. La ejecución incluye la batería base completa, Coach evals, PostgreSQL real con conexiones independientes y barreras `pg_locks`/`pg_blocking_pids`, E2E y build; no se omite un test para conseguir verde.

Comprobación **sólo lectura** en producción el 25/10/2026: dos actividades distintas en `2026-10-15`; `session_exercises.exercise_id IS NOT NULL = 0`; RPCs existentes `security invoker` y EXECUTE restringido a `service_role`. Ninguna de esas filas se ha modificado.

## Límites

- Lenguaje acotado, sin interpretación general ni inferencias médicas.
- Selección de ejecuciones limitada a 20 referencias recientes mostradas; una referencia explícita debe superar ownership/estado/enlace en una nueva lectura.
- Duración de estructuras detalladas, intervalos, rondas, ejercicios, tiempos fraccionarios o extensiones requiere revisión.
- Entorno: reemplazo con política existente; no equivalencias de ejercicios inventadas.
- Mal sueño con varias sesiones puede seguir requiriendo revisión aunque se elija una: no se reescribe la política matinal para forzar una reducción.
- Sobrecarga sin enlace exacto, evidencia comparable o propuesta existente no produce adaptación.
- Semana sin capacidad, fechas pasadas, sesiones ejecutadas o conflictos no se fuerzan. No se convierte un plan pasado no enlazado en missed.
- No se ha ejecutado rollout, rollback, merge ni deploy. La auditoría independiente y la decisión del Product Owner siguen pendientes.

## Incidencia de paridad productiva (independiente de #106)

Hallazgo aportado: `enqidu-tools` **v10 ACTIVE** contiene 47 archivos; 46 coinciden con `main`. El `src/health/healthIngestionStatus.js` desplegado no integra `loadGarminSyncStatus`, presente en `main`.

Impacto: el contrato actual de `get_health_ingestion_status` exige `sync_enabled`, `consent_status`, `connection_status`, `runtime_available` y `scheduler_status`. El bundle discrepante no los construye, por lo que el runtime puede rechazar la salida con `output_contract_violation`. No demuestra ausencia de salud ni error de ingesta de Garmin. Puede dejar sin estado verificable las superficies que consumen esa tool.

**Gate de rollout cerrado** hasta verificar paridad del bundle completo. #106 no modifica `healthIngestionStatus.js`, `garminSyncStatus.js`, conectores, ingesta, parser FIT, jobs ni datos Garmin. La corrección de paridad corresponde a un despliegue futuro expresamente autorizado; no se ejecuta aquí.

Checklist obligatorio, con evidencia adjunta al release:

- [ ] Fijar el SHA aprobado y exportar el bundle activo y candidato de cada Edge Function afectada (`enqidu-tools`, `coach-reply`, `coach-plan-action`).
- [ ] Inventariar todos sus archivos/imports transitivos y comparar bytes/hash con ese SHA, no sólo el entrypoint ni el número histórico de 47 archivos.
- [ ] Cero archivos faltantes, extras inesperados o versiones mixtas de registry/runtime/actions/preview/assessment/Health.
- [ ] Verificar específicamente el import y la llamada a `loadGarminSyncStatus` y los cinco campos requeridos en `healthIngestionStatus.js`; reproducir el contrato autenticado de `get_health_ingestion_status`.
- [ ] Registrar versiones, hashes, `verify_jwt`, configuración y dependencias efectivas; confirmar `OPENAI_COACH_ENABLED` desactivado y ausencia de claves privilegiadas en frontend.
- [ ] Verificar paridad de la definición SQL desplegada y la migración aprobada; no admitir un frontend nuevo con wrapper antiguo.
- [ ] Ejecutar pruebas de humo de lectura/preview y consentimiento con usuarios controlados, aislamiento, stale y doble confirmación; no usar entrenamientos históricos como datos de prueba.
- [ ] Obtener auditoría independiente y aprobación expresa del Product Owner antes de cualquier rollout.

## Rollout y rollback propuestos, no ejecutados

Rollout: aprobar el PR y sus evidencias; cerrar la incidencia/gate de bundles; aplicar la migración y publicar los backends como conjunto compatible; comprobar Auth, READ/PREVIEW y rechazos seguros; publicar el frontend; verificar confirmación y readback con datos controlados. No activar modelos, cron ni proveedores. Mantener las superficies nuevas bloqueadas si falta la frontera nueva o no hay paridad.

Rollback: retirar la nueva interfaz y conservar el backend que exige consentimiento, o desplegar una revisión correctiva aprobada. Un frontend anterior no debe recuperar el auto-apply de indisponibilidad: el endpoint reforzado lo rechaza sin preview. La migración no transforma datos ni crea tablas, por lo que no hay backfill que deshacer. Sólo restaurar la definición previa de la RPC junto con un backend compatible y bloqueo explícito de la vía antigua de indisponibilidad, mediante otro cambio aprobado. No revertir actividades, salud, enlaces o historial; los cambios ya confirmados siguen siendo acciones legítimas del usuario.

## Coste y archivos

Coste incremental autorizado/previsto: **0,00 €**. Se reutilizan infraestructura y servicios existentes; pruebas en el entorno local y runners estándar del repositorio público. No se contratan proveedores, habilitan LLM, realizan llamadas OpenAI ni activan servicios de pago. No se han ejecutado acciones productivas.

La lista exacta de archivos del PR está en `git diff --name-only origin/main...HEAD`; los grupos modificados son evaluación adaptativa, runtime/acciones/previews, presentación/cliente Coach, endpoint de compatibilidad, migración/bootstrap local, fixtures y pruebas/documentación. Los archivos de Garmin, Progress y semántica #105 permanecen sin cambios funcionales.

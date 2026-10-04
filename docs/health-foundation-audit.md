# Health Foundation V1: auditoría del modelo wearable

Fecha de inspección: **2026-10-04**. Base del repositorio: `main` / `f326df08203656297891de57c3ad2f10b2f9e192`.
Se leyó [AGENTS.md](../AGENTS.md) y se inspeccionó Supabase real, proyecto `rdduqsziboqxlgeqouxq`, mediante consultas **solo de lectura** a columnas, constraints, índices, policies, grants, triggers, vistas, historial de migraciones y conteos agregados. Esta auditoría describe el estado previo al bloque; no aplica ni certifica un despliegue de la nueva migración.

## Resultado y alcance

**Existe un modelo wearable amplio que debe reutilizarse.** Hay tablas para evidencia/importación, resúmenes diarios, sueño, HRV, series biométricas, composición corporal e interpretaciones del proveedor. Falta un contrato interno estable, un normalizador común y una frontera de persistencia idempotente que no identifique el dato canónico por el canal de transporte.

No se necesita un segundo esquema `garmin_*`, `fitness_ai_*` ni otro almacén health paralelo. Fitness AI será una fuente temporal del proveedor Garmin; no definirá columnas ni reglas de ENQIDU. Readiness, cards, gráficas, MCP, integración real de Fitness AI e importación FIT quedan fuera de este bloque.

## Repositorio frente a producción

La producción contiene migraciones wearable de mayo de 2026 que **no están versionadas en `supabase/migrations` del repositorio al inicio**. Ejemplos reales del historial:

| Versión | Migración aplicada en producción |
| --- | --- |
| `20260527164532` | `create_wearable_health_ingestion_evidence_layer` |
| `20260527165128` | `create_wearable_health_observations_timeseries` |
| `20260527165543` | `add_health_assisted_capture_idempotency` |
| `20260527200310` | `create_garmin_health_metric_catalog_and_daily_master` |
| `20260527202126` | `create_garmin_sleep_master_entities` |
| `20260527202902` | `create_garmin_heart_rate_and_hrv_series` |
| `20260527202949` | `create_garmin_stress_and_body_battery_series` |
| `20260527204643` | `create_garmin_respiration_spo2_and_optional_beat_to_beat` |
| `20260527211013` | `create_garmin_vendor_insights_store` |
| `20260527220316` | `create_wearable_provider_raw_payload_ingress` |
| `20260528051058` | `create_garmin_epoch_body_composition_and_blood_pressure_entities` |
| `20260528053744` | `restrict_health_master_authenticated_writes_by_channel` |
| `20260528054421` | `sync_assisted_garmin_daily_summary_to_master` |
| `20260528064633` | `make_raw_payload_external_idempotency_upsert_compatible` |

`e2e-local/supabase/migrations/20260619000000_ui_read_contract.sql` contiene solamente un subconjunto local vacío para lecturas UI. No reproduce la producción: omite provenance, constraints e importaciones, y algunas PK de series son `uuid` en local frente a `bigint` en real. No se usa como prueba de disponibilidad ni como baseline wearable de producción. Las migraciones del repositorio principal también dependen de otros objetos preexistentes; aplicar solamente este repositorio a una base vacía no reconstruye toda producción.

La nueva migración del bloque debe ser un cambio incremental sobre esos objetos observados; la prueba SQL aislada documentará explícitamente su subset de esquema real. No debe crear tablas redundantes para compensar este desfase histórico.

## Datos realmente existentes

Los valores `rows` de `list_tables` eran estimaciones desactualizadas y llegaron a indicar cero en tablas pobladas. Se contrastaron con `COUNT(*)`, sin descargar datos personales ni payloads:

| Tabla | Filas exactas en la inspección |
| --- | ---: |
| `wearable_health_imports` / `wearable_health_daily` / `wearable_hrv_nightly_summaries` | 1 cada una |
| `wearable_sleep_sessions` | 7 |
| `wearable_sleep_stage_intervals` | 3 |
| `wearable_heart_rate_samples` / `wearable_hrv_nightly_samples` / `wearable_body_battery_samples` / `wearable_respiration_samples` | 84 cada una |
| `wearable_body_battery_events` | 1 |
| `wearable_health_observations` / `wearable_stress_samples` / `wearable_spo2_samples` / `wearable_epoch_summaries` | 0 |
| `wearable_body_composition_measurements` / `wearable_blood_pressure_measurements` / `wearable_beat_to_beat_intervals` | 0 |
| `wearable_nap_sessions` / `wearable_sleep_score_qualifiers` / `wearable_vendor_insights` | 0 |
| `wearable_provider_raw_payloads` | 4 |
| `wearable_metric_catalog` / `wearable_metric_source_evidence` / `wearable_metric_evidence_links` | 41 / 13 / 68 |
| `readiness_snapshots` | 0 |
| `wearable_activity_imports` | 91 |

Los resúmenes diarios, sueño, HRV e importaciones health existentes tienen `provider='garmin'`, `provider_mode='assisted_capture'`, `ingestion_channel='chatgpt_assisted_capture'`. Esto demuestra capturas persistidas, **no** una sincronización Fitness AI ni acceso oficial Garmin, ni que cada campo nullable contenga un valor. Las familias documentadas en el catálogo tampoco demuestran disponibilidad para un usuario, dispositivo, permiso o conector concreto. La ausencia de una métrica continúa siendo ausencia.

## Inventario reutilizable y campos

Todas las tablas de este inventario son `public` y tenían RLS habilitada. Las tablas de usuario relacionan `user_id` con `auth.users`. IDs principales son UUID salvo observaciones/series/intervalos/epochs, que usan `bigint`; catálogos y links tienen claves de texto o compuestas. La siguiente tabla separa datos medidos, evidencia e interpretación.

| Tabla | Campos relevantes existentes | Función en el modelo canónico |
| --- | --- | --- |
| `wearable_health_imports` | `user_id`, `connection_id`, `provider`, `provider_mode`, `ingestion_channel`, `health_record_type`, `observation_date`, `captured_at`, `source_reference`, `source_asset_metadata`, `raw_observation`, `normalized_payload`, `data_confidence`, `processing_status`, `raw_payload_id`, `readiness_snapshot_id`, `notes`, `created_at`, `updated_at` | Registro de ingestión y enlace entre evidencia y proyecciones; reutilizar. |
| `wearable_provider_raw_payloads` | `user_id`, `provider`, `provider_mode`, `ingestion_channel`, `api_product`, `payload_type`, `external_payload_id`, `observation_date`, `received_at`, `payload_sha256`, `raw_payload`, `source_asset_metadata`, `processing_status`, `parser_version`, `notes`, timestamps | Evidencia original y revisión del payload; almacén compartido también con actividad/FIT. |
| `wearable_health_observations` | `health_import_id`, `readiness_snapshot_id`, provenance, `observation_date`, `metric_code`, `metric_name`, `observation_scope`, `observed_at`, `interval_start_at`, `interval_end_at`, `value_numeric`, `value_text`, `value_json`, `unit`, `data_confidence`, `source_path` | Escalares/observaciones adicionales sin inventar columnas por proveedor; no duplicar métricas ya proyectadas. |
| `wearable_health_daily` | Provenance, `calendar_date`, `health_import_id`, `readiness_snapshot_id`, HR reposo/mín./máx., estrés, pasos, distancia, intensidad, calorías, Body Battery, SpO2, respiración, `raw_payload`, `data_confidence`, timestamps | Resumen diario medido/reportado; reutilizar. |
| `wearable_sleep_sessions` | Provenance, `calendar_date`, enlaces import/readiness, inicio/fin, duración, etapas agregadas, puntuación, HR, respiración, SpO2, HRV, Body Battery, temperatura, `raw_payload`, confianza y timestamps | Noche de sueño canónica, sin cálculo de readiness. |
| `wearable_sleep_stage_intervals` | `user_id`, `sleep_session_id`, `provider`, `ingestion_channel`, `stage_code`, `interval_start_at`, `interval_end_at`, `duration_seconds`, `data_confidence`, `raw_payload` | Etapas temporales del sueño, si están presentes. |
| `wearable_sleep_score_qualifiers` | `user_id`, `sleep_session_id`, `score_type`, `qualifier`, `raw_payload` | Calificadores del proveedor; no biometría objetiva nueva. |
| `wearable_nap_sessions` | `user_id`, `health_import_id`, `provider`, `ingestion_channel`, `start_at`, `duration_seconds`, `validation_type`, `raw_payload` | Siestas; no asumir que vienen en el primer conector. |
| `wearable_hrv_nightly_summaries` | Provenance, `calendar_date`, enlaces import/sleep, `last_night_avg_ms`, `last_night_5min_high_ms`, `status`, `raw_payload`, confianza, timestamps | HRV nocturna reportada; estado del proveedor no equivale a readiness ENQIDU. |
| `wearable_heart_rate_samples` | Provenance, enlaces import/sleep, `context`, `recorded_at`, `heart_rate_bpm`, `nominal_resolution_seconds`, `resolution_status`, `raw_payload` | Serie 24/7 HR; separada de `session_samples` FIT. |
| `wearable_hrv_nightly_samples` | `provider`, `ingestion_channel`, enlaces summary/sleep, `recorded_at`, `hrv_ms`, resolución y raw | Serie HRV nocturna. |
| `wearable_stress_samples` | Provenance, enlace import, `recorded_at`, `stress_value`, `stress_status`, resolución y raw | Serie de estrés y ausencia/código de estado explícitos. |
| `wearable_body_battery_samples` | Provenance, enlace import, `recorded_at`, `body_battery_value`, resolución y raw | Serie Body Battery reportada por Garmin. |
| `wearable_body_battery_events` | Provenance, enlace import, `event_type`, `start_at`, `duration_seconds`, `impact`, `raw_payload` | Eventos Garmin; interpretación del proveedor, no sesión deportiva nueva. |
| `wearable_respiration_samples` | Provenance, enlaces import/sleep, `context`, `recorded_at`, `breaths_per_minute`, resolución y raw | Respiración 24/7/sueño; no reemplaza respiración FIT. |
| `wearable_spo2_samples` | Provenance, enlaces import/sleep, `context`, `recorded_at`, `spo2_percent`, resolución y raw | SpO2 observada. |
| `wearable_beat_to_beat_intervals` | `provider`, `ingestion_channel`, enlace import, `recorded_at`, `interval_ms`, `feed_type`, `availability_status`, `raw_payload` | Feed opcional avanzado existente; fuera del primer conector. |
| `wearable_epoch_summaries` | Provenance, enlaces import/raw, `interval_start_at`, `interval_end_at`, resolución, `steps`, `distance_m`, `active_kcal`, `intensity_minutes`, `mean_heart_rate_bpm`, `raw_payload` | Actividad cotidiana por intervalos; no actividades FIT. |
| `wearable_body_composition_measurements` | `provider`, `ingestion_channel`, enlaces import/raw, `measured_at`, `weight_kg`, `body_fat_pct`, `body_water_pct`, `skeletal_muscle_mass_kg`, `bone_mass_kg`, `bmi`, `raw_payload` | Medición corporal; reutilizar sin otra tabla de peso. |
| `wearable_blood_pressure_measurements` | `provider`, `ingestion_channel`, enlaces import/raw, `measured_at`, `systolic_mmhg`, `diastolic_mmhg`, `pulse_bpm`, `raw_payload` | Estructura existente opcional; fuera del bloque solicitado. |
| `wearable_vendor_insights` | Provenance, import, `insight_code`, `insight_domain`, `observation_date`, `observed_at`, `value_numeric`, `value_text`, `value_json`, `unit`, `vendor_calculated`, `api_availability`, raw, confianza y timestamps | VO2max, Fitness Age y otros resultados del proveedor; separados de biometría objetiva. |
| `wearable_metric_catalog` | `metric_code` PK, `provider`, `domain`, `display_name`, `data_kind`, `expected_granularity_seconds`, `granularity_status`, `source_priority`, `garmin_api_product`, `api_availability`, `canonical_storage`, `ui_reference`, `notes`, timestamps | Catálogo de diseño/afirmaciones de soporte; no presencia de datos. |
| `wearable_metric_source_evidence` | `provider`, `source_code`, `source_type`, título/URL, `authority_level`, flags de soporte de familia/campos/granularidad, `validation_status`, notas | Evidencia documental de capacidades. |
| `wearable_metric_evidence_links` | `metric_code`, `evidence_id`, `claim_supported`, `is_primary_evidence` | Relación catálogo/evidencia documental. |
| `user_wearable_connections` | `user_id`, `provider`, `connection_status`, `sync_mode`, `external_user_reference`, `granted_scopes`, fechas conexión/revocación/sync, `metadata`, timestamps | Conexión administrativa; no fuente de truth de biometría ni transporte health implementado. |
| `readiness_snapshots` | `captured_at`, `snapshot_date`, `source_type`, `source_reference_id`, scores sueño/energía/dolor/fatiga/estrés/readiness, minutos/restricciones, `engine_version_id`, proveedor/conexión, resúmenes wearable, confianza, canal y raw/evidence | Estructura ya existente de otro dominio; no usarla como tabla canónica health ni escribir scores en este bloque. |
| `wearable_activity_imports` | `external_activity_id`, proveedor/modo/canal, fuente/sesión/raw, parser, retry/status/error, `provider_payload`, `processing_summary`, fechas | Pipeline de actividad/FIT existente; intocable. |
| `wearable_workout_exports` | conexión, proveedor, sesión recomendada/de entrenamiento, workout externo, payload, status, mock/error/fecha exportación | Exportación deportiva; no modificar. |

En las filas anteriores, «provenance» significa las columnas existentes `user_id`, `provider`, `provider_mode`, `ingestion_channel`; **no** implica que todas las tablas tengan la misma envoltura. Body composition, etapas, HRV samples y algunas tablas auxiliares no tienen `provider_mode` ni `data_confidence` dedicados; recuperan la envoltura completa por import/raw o el payload de evidencia. Tampoco existe una columna `source_identifier` común en las proyecciones.

### Campos de resumen completos

`wearable_health_daily` contiene: `resting_heart_rate_bpm`, `min_heart_rate_bpm`, `max_heart_rate_bpm`, `average_stress_level`, `max_stress_level`, `steps`, `intensity_minutes`, `active_kcal`, `bmr_kcal`, `distance_m`, `active_time_seconds`, `moderate_intensity_seconds`, `vigorous_intensity_seconds`, `steps_goal`, `intensity_goal_seconds`, `stress_duration_seconds`, `rest_stress_duration_seconds`, `activity_stress_duration_seconds`, `low_stress_duration_seconds`, `medium_stress_duration_seconds`, `high_stress_duration_seconds`, `stress_qualifier`, `body_battery_current`, `body_battery_charged`, `body_battery_drained`, `spo2_avg_pct`, `spo2_min_pct`, `respiration_avg_brpm`, `respiration_min_brpm`.

`wearable_sleep_sessions` contiene: `sleep_start_at`, `sleep_end_at`, `total_duration_seconds`, `deep_sleep_seconds`, `light_sleep_seconds`, `rem_sleep_seconds`, `awake_seconds`, `unmeasurable_seconds`, `sleep_score`, `restless_moments_count`, `respiration_variation_status`, `avg_sleep_heart_rate_bpm`, `resting_heart_rate_bpm`, `body_battery_change`, `spo2_avg_pct`, `spo2_min_pct`, `respiration_avg_brpm`, `respiration_min_brpm`, `hrv_last_night_avg_ms`, `hrv_last_night_5min_high_ms`, `skin_temperature_change_c`.

Estos valores son nullable. No convertir `null` a cero, ni derivar métricas ausentes de otra familia. `bmi` existe como valor reportado y no exige calcularlo. `sleep_score`, estrés y Body Battery son índices del proveedor, no resultados médicos ni readiness ENQIDU.

## Cobertura conceptual hacia el contrato GarminSource

La columna de disponibilidad recoge el **esquema y catálogo inspeccionados**; no promete un payload Fitness AI ni acceso Garmin oficial. Todo campo sigue siendo opcional hasta observar evidencia autorizada.

| Familia solicitada | Storage existente y mapping | Soporte / carencia real |
| --- | --- | --- |
| Daily health | `GarminDailyHealth` → `wearable_health_daily` | Resumen y fecha existen; falta envoltura común de observación/retrieval/timezone y upsert independiente del canal. |
| Steps | `steps`, `steps_goal`; epochs si hay intervalos | Almacenable. Catálogo reconoce la familia; no garantiza datos del conector. |
| Distance | `distance_m`; epochs `distance_m` | Almacenable en metros. Catálogo marca `portal_payload_validation_required`. No tomar distancia FIT como distancia diaria. |
| HR mín./máx./reposo | Daily `min_heart_rate_bpm`, `max_heart_rate_bpm`, `resting_heart_rate_bpm`; samples `heart_rate_bpm` | Columnas/serie existentes. Reposo está en catálogo; min/max disponibles solo si el source aporta evidencia. |
| Sleep | `GarminSleep` → `wearable_sleep_sessions` | Duración e inicio/fin existen; fecha corresponde al día del resumen de sueño que el source debe declarar. |
| Sleep stages | Agregados de segundos y `wearable_sleep_stage_intervals` | Ambos soportes existentes. Etapa desconocida válida `unknown`; no fabricar intervalos ni rellenar huecos. |
| Sleep score | `sleep_score`; qualifiers relacionados | Almacenable. Catálogo exige validación del feed autorizado; no calcular un score propio. |
| HRV nocturna | `GarminHRV` → summary y `wearable_hrv_nightly_samples` | Media nocturna, máximo 5 min y estado existentes. Catálogo marca payload pendiente de validar. No inferir HRV a partir de HR. |
| Stress | `GarminStress` → daily/samples | Resumen/serie existen; estados permiten distinguir off-wrist/no data/movimiento. No interpretar sentinels negativos como estrés medido. |
| Body Battery | `GarminBodyBattery` → daily/samples/events | Índice del proveedor y eventos existentes; no deducir recuperación ni morning/high/low de campos diferentes sin un cálculo futuro explícito. |
| Respiration | `GarminRespiration` → daily/sleep/samples | Respiraciones/minuto (`brpm`), no HR `bpm`. Cadencia exacta del feed no validada. |
| Intensity minutes | Daily `intensity_minutes`, moderate/vigorous seconds; epochs | Minutos y duración por intensidad almacenables. No suponer ponderación de minutos vigorosos. |
| Active calories | Daily/epochs `active_kcal` | Kilocalorías reportadas. No mezclar total, actividad y BMR. |
| BMR | Daily `bmr_kcal` | Columna existente; el catálogo requiere validar desagregación del payload. No calcular BMR. |
| SpO2 | `GarminSpO2` → daily/sleep/samples | Porcentaje 0–100. Tabla samples vacía; no completar ausencia. |
| Body composition | `GarminBodyComposition` → measurements | Peso, grasa, agua, músculo, hueso, BMI existentes; sin mediciones en la inspección. Falta natural UNIQUE. |
| VO2max | `GarminVendorInsight` → `wearable_vendor_insights` | Catálogo contiene `training.vo2max.running` y `.cycling` con `portal_payload_validation_required`. No hay columna dedicada ni valores vendor persistidos. |
| Fitness Age | `GarminVendorInsight` → `wearable_vendor_insights` | Sin columna específica ni entrada de catálogo observada. El store genérico puede conservar una lectura futura; su disponibilidad es desconocida. |
| Vendor insights | `wearable_vendor_insights` | Store genérico existente para valores numéricos/texto/JSON, unidad, `vendor_calculated` y disponibilidad. Separar de métricas objetivas. |

El contrato, adapter y documentación de uso final viven en el bloque Health Foundation; no se añade traducción del formato particular de Fitness AI en el dominio. Los nombres conceptuales de DTO anteriores describen familias, no requieren clases ni otra persistencia.

## Provenance previa y carencias

El modelo ya distingue proveedor y transporte. FIT registra `provider='garmin'`, `provider_mode='manual_upload'`, `ingestion_channel='fit_manual_upload'`, manteniendo `training_sources.provenance`. Health usa `provider`, `provider_mode`, `ingestion_channel`, `data_confidence`, enlaces import/raw, `source_reference`, `external_payload_id`, `source_path`, resolución y estado de disponibilidad.

Los CHECK health existentes aceptan modos `assisted_capture`, `official_api`, `manual_entry`, `mock_test`. Los CHECK de imports/observations aceptan canales `chatgpt_assisted_capture`, `lovable_manual_entry`, `garmin_health_api`, `admin_backfill`, `mock_test`; daily/sleep/vendor omiten `lovable_manual_entry`. Raw añade `garmin_activity_api` y `fit_manual_upload`. **Ninguno de esos CHECK restrictivos acepta todavía `fitness_ai_connector` ni modo `aggregator`.** Ampliar solo los objetos reutilizados necesarios; no etiquetar un agregador como API oficial.

El contrato nuevo debe distinguir:

| Dato | Semántica / reuse |
| --- | --- |
| `provider` | Fabricante del dato: `garmin`, aunque llegue por Fitness AI. |
| `provider_mode` | Acceso provisional: `aggregator`; acceso oficial futuro: `official_api`. |
| `ingestion_channel` | Fitness AI: `fitness_ai_connector`; oficial futuro podrá ser `garmin_health_api`. |
| `source_identifier` | Identidad reportada por el source, si existe; evidencia/provenance y `source_reference`/`external_payload_id` existentes. No fabricar un ID Garmin. |
| `observed_at` | Instante de observación aportado; para datos diarios puede faltar. No sustituirlo silenciosamente por retrieval. |
| `retrieved_at` | Instante de obtención del source; reutilizar raw `received_at` para recepción ENQIDU y preservar la distinción en provenance. |
| `calendar_date` / timezone | Fecha diaria/nocturna y zona IANA explícita cuando aplique. No depender de zona del navegador ni de `DATE(timestamptz)` en zona DB. |
| `data_confidence` / calidad | Confianza declarada, no inferida de proveedor/canal. Enum previo: `reported`, `user_verified`, `calculated`, `estimated`, `ocr_unverified`, `unknown`. |
| Raw/evidence | Campos no usados continúan disponibles en evidencia JSON. No descartar extensiones del source ni exponer raw al Coach/UI. |

`captured_at` en imports y `received_at` en raw tienen defaults `now()`: por sí solos no distinguen tiempo biométrico y tiempo de obtención. Las proyecciones daily/sleep/HRV carecen de timezone dedicada. La envoltura canónica debe conservar ambos tiempos y zona aunque se proyecten por JSON para mantener mínima la migración.

Unidades esperadas: distancia en metros, duraciones en segundos (excepto `intensity_minutes`, ya existente), HR en latidos/minuto, respiración en respiraciones/minuto, HRV en milisegundos, energía en kcal, peso/masas en kg, composición/SpO2 en porcentaje, temperatura en °C, VO2max en ml/kg/min únicamente si el source lo identifica así. Índices vendor conservan su escala declarada. Una unidad desconocida no autoriza una conversión supuesta.

## Claves naturales e idempotencia previas

| Objeto | UNIQUE real previo | Limitación |
| --- | --- | --- |
| Daily / sleep | `(user_id, provider, ingestion_channel, calendar_date)` | Reintento mismo canal se puede upsert; al cambiar canal se crea otro resumen del mismo día. Sleep representa una noche principal por día/canal; siestas tienen tabla propia. |
| HRV summary | Misma clave día/proveedor/canal, con **dos índices idénticos** | Duplicidad de índices (`wearable_hrv_nightly_summary_source_unique`, `wearable_hrv_summary_source_unique`); no necesita otro índice equivalente. |
| Health imports | `(user_id, ingestion_channel, source_reference, health_record_type)` parcial solo `chatgpt_assisted_capture` y reference no null | No cubre Fitness AI/oficial; omite proveedor y fecha. Un ID reutilizado en dos días podría colisionar en la captura legacy. |
| Raw con external ID | `(user_id, provider, ingestion_channel, external_payload_id)` | External ID nullable permite múltiples null; no incluye tipo/fecha. Source IDs compartidos por tipo/día podrían colisionar. |
| Raw hash sin external ID | `(user_id, provider, ingestion_channel, api_product, payload_type, payload_sha256)` parcial solo `garmin_health_api`, ID null/hash no null | Deduplica exactos oficiales; una corrección cambia hash y necesita separación entre revisión de evidencia y dato canónico. No cubre Fitness AI. |
| Vendor insights | `(user_id, provider, ingestion_channel, observation_date, insight_code)` parcial solo captura ChatGPT | No cubre los futuros canales; riesgo de duplicados. |
| Observaciones, muestras, etapas, epochs, eventos, mediciones corporales/PA | Solo PK artificial; índices de acceso no UNIQUE | Reinsertar el mismo dato duplica filas; un índice por timestamp no es idempotencia. |
| Conexiones | `(user_id, provider)` constraint e índice equivalente duplicado | Administrativa, no clave del dato health. No rehacer aquí. |
| Activity imports FIT | `(user_id, provider, external_activity_id)` y `(connection_id, external_activity_id)` | Reuse existing FIT; no alterar deduplicación. |

Se contaron grupos por `(user_id, provider, calendar_date)` que tuvieran más de una fila en daily/sleep/HRV: **0 en las tres tablas** durante esta inspección. También se verificaron **0 grupos duplicados** para HR y respiración por `(user_id, provider, context, recorded_at)`, HRV y Body Battery por `(user_id, provider, recorded_at)`, y etapas por `(user_id, sleep_session_id, interval_start_at)`. Estos conteos no evitan futuras carreras ni acreditan ausencia de duplicados en todas las tablas opcionales.

El diseño del bloque añade una identidad foundation independiente del canal en el registro de importación, con el usuario, proveedor, tipo y fecha/instante/scope reales. Los IDs reportados se conservan como evidencia; no definen un agregado diario si pueden cambiar con una corrección o cambio de canal. Raw recibe identidad de revisión/hash separada: varios payloads corregidos pueden constituir evidencia de **un mismo** registro canónico.

Las proyecciones existentes se reutilizan: se adopta una sola candidata legacy compatible o se aborta si hay ambigüedad. No se borra ni fusiona histórico por heurística. La persistencia debe ser transaccional y serializar escritores del mismo usuario; una comprobación JS seguida de INSERT sin constraint/lock no protege contra reintentos concurrentes. Reingesta exacta es no-op; corrección del mismo dato actualiza el registro/proyección manteniendo identidad; datos de dos días o usuarios distintos no colisionan. Evidencia de revisión y resultados canónicos no deben confundirse al contar duplicados.

Las tablas opcionales no escritas por V1 conservan sus gaps. La integración futura solo podrá habilitar una familia de series cuando tenga clave natural, validación de ownership y regression tests adecuados; esta auditoría no presenta todas las tablas legacy como idempotentes.

## RLS, permisos y escritura

Estado **previo** inspeccionado, no garantías inferidas a partir de tests sintéticos:

1. Todas las tablas inventariadas tienen RLS. SELECT de datos del usuario usa `auth.uid() = user_id` para `authenticated`. Catálogo y evidencia documental permiten lectura global autenticada (`USING true`) y no contienen ownership biométrico.
2. La mayoría de tablas health tienen INSERT/UPDATE/DELETE de `authenticated` restringidos por RLS a `auth.uid() = user_id AND ingestion_channel='chatgpt_assisted_capture'`. UPDATE incluye USING y WITH CHECK. Estas policies no autorizan una API Fitness AI/oficial, pero son escrituras legacy directas existentes.
3. `wearable_sleep_score_qualifiers` solamente tiene SELECT policy aunque conserva grants DML. `wearable_activity_imports` tiene SELECT/INSERT/UPDATE de propietario; el frontend FIT usa ese camino actual. Conexiones, exports y readiness tienen ALL de propietario; no ampliar ni rediseñar esos caminos.
4. Los grants reales previos incluyen **TRUNCATE, REFERENCES y TRIGGER tanto para `anon` como para `authenticated`** en las tablas inspeccionadas. `authenticated` además conserva SELECT y DML, con las excepciones de catálogo/evidencia (sin INSERT/UPDATE/DELETE). `anon` no tiene SELECT ni DML sobre esos datos. RLS no protege TRUNCATE: habilitar RLS por sí solo no equivale a quitar este privilegio. El hardening del bloque debe revocar escritura y privilegios auxiliares en el alcance health seleccionado; no crear grants generales frontend.
5. `service_role` tiene privilegios de backend existentes y nunca debe llegar a `src`/Vite. La persistencia nueva queda en código servidor con una RPC estrecha `SECURITY INVOKER`, acceso solo servidor, tipos/filas permitidos y ownership validado; no acepta SQL, tablas libres ni instrucciones de un LLM. No hay una ruta UI/MCP/LLM de escritura health añadida.
6. `wearable_provider_raw_payloads` es compartida con FIT/actividad. No se usa una revocación indiscriminada de permisos que degrade esa ruta. El bloque documenta y preserva las restricciones legacy necesarias y mantiene la nueva escritura del canal conector en la frontera servidor. No considerar esa excepción como una autorización general frontend para health.

La nueva migración/versionado y sus tests describen el hardening concreto y el RPC; el estado de producción continúa siendo el anterior hasta el despliegue normal revisado del PR. La auditoría no cambia plan, billing, RLS ni datos reales durante la inspección.

### Trigger legacy y vistas

Existe un trigger `trg_sync_assisted_garmin_daily_summary` sobre INSERT/UPDATE de `normalized_payload`, `readiness_snapshot_id` o `processing_status` en imports. Su función `sync_assisted_garmin_daily_summary_to_master()` es `SECURITY DEFINER SET search_path=public`, pero solo actúa cuando proveedor/modo/canal son exactamente Garmin / assisted capture / captura ChatGPT. Inserta/upserta daily con la clave antigua que incluye canal. Usa COALESCE en métricas, por lo que una corrección a `null` no elimina un valor previo; no usarla como normalizador ni como frontera foundation. Fitness AI/oficial pasan por el nuevo adapter/persistencia y no dependen de ese trigger.

Las vistas inspeccionadas `v_daily_health_context`, `v_garmin_sleep_master_context`, `v_garmin_health_master_context`, `v_wearable_metric_coverage` tienen `security_invoker=true`. `v_daily_health_context` parte de readiness, por lo que no es la entidad canónica health nueva. La vista health master agrega muestras con `DATE(recorded_at)` en timezone de la sesión DB y por usuario/fecha sin provider/canal; no reutilizarla para declarar cobertura diaria exacta en la zona del atleta. La vista sleep enlaza por sleep ID y no da por sí sola una garantía UNIQUE de join HRV. No se rediseñan vistas/UI/readiness en este bloque.

## FIT conserva su contrato

```text
FIT Garmin + parser ENQIDU + relato/feedback usuario + Coach
                          ↓
                  sesión canónica fusionada
```

El import actual está en `src/main.jsx` (`persistParsedFitSession`, normalización y persistencia de payloads/samples/laps/sets) y `scripts/backfill-garmin-relational.mjs`. Usa `fit-file-parser`, `training_sources`, `training_sessions`, `session_samples`, `session_metrics`, `session_laps`, `session_garmin_sets`, `swimming_lengths`, `fit_message_payloads`, y el registro `wearable_activity_imports`. La identidad existente incorpora checksum, `external_reference='fit:<checksum>'`, fingerprint y metadata de fuente. Las pruebas `garmin-strength-series`, universal training y corrección conversacional protegen partes de ese contrato.

**Health Foundation no modifica parser, deduplicación, muestras, históricos FIT ni sesiones realizadas.** El FIT preserva detalle objetivo/fisiológico. La semántica deportiva confirmada por usuario/Coach prevalece para coaching: Garmin `Unknown` y front squat confirmado `45×5` conservan ambas evidencias sin convertir la incertidumbre de Garmin en una instrucción deportiva. Véanse [Garmin/FIT adapter](./garmin-fit-jotason-adapter.md), [backfill existente](./garmin-backfill.md) y [ADR-007](./coach-context/adr/ADR-007-garmin-type-is-not-training-intent.md).

## Decisiones y verificación del siguiente bloque

Se reutilizan imports/raw y las proyecciones del dominio solicitado; no se crean tablas por Fitness AI, Garmin oficial, readiness o UI. No se implementa el transporte Fitness AI, no se infiere su disponibilidad y no se consulta una API de pago. La interfaz exacta source → adapter → persistencia y sus DTOs se documentan junto al contrato V1.

Antes de activar la futura ingestión se debe verificar, sobre el entorno de despliegue:

- Que la migración incrementa los objetos wearable reales existentes y la RPC solo tiene EXECUTE de servidor; SELECT de usuarios mantiene ownership y no hay nuevos grants de escritura frontend.
- Que las candidatas legacy son inequívocas; ante múltiples filas compatibles, investigar y resolver con evidencia antes de ingerir. No borrar históricos para hacer pasar un UNIQUE.
- Que reintentos exactos, correcciones tardías y cambios de canal mantienen un único dato canónico; distintos usuarios/días/instantes conservan registros separados y cada revisión raw queda vinculada.
- Que timestamps, timezone, unidades y nulls provienen de payloads autorizados. Comparar al menos una fixture redacted autorizada del conector con el DTO; fixtures sintéticas prueban contrato, no disponibilidad real.
- Que los logs/resultados de ingestión exponen contadores y IDs seguros, sin payloads sensibles ni credenciales; las métricas ausentes permanecen ausentes.

El PR puede probar normalizador, contrato, SQL real aislado, RLS/grants, idempotencia, seguridad y build sin desplegar código en producción ni generar previews Vercel. Los datos reales, transporte Fitness AI y payloads oficiales requieren su bloque posterior específico.

## Cambio incremental preparado en V1

La [migración versionada](../supabase/migrations/20261004134444_health_foundation_v1.sql) no crea tablas ni modifica filas durante su aplicación. Añade claves foundation e índices UNIQUE a imports, evidencia y las proyecciones reutilizadas; imports también recibe tiempos de observación/retrieval/versión, timezone y hash de revisión. Amplía únicamente los CHECK de modo/canal necesarios para los objetos escritos. El helper interno conserva el usuario resuelto en servidor y la RPC calcula la identidad; no acepta una clave, tabla o SQL del source.

`source_asset_metadata.foundation_sample_keys` es un registro interno de las identidades que cada snapshot completo ha cubierto. Conserva las claves retiradas o corregidas a `null`, sin copiar valores biométricos. Un índice GIN permite contrastar la versión global más reciente antes de proyectar una muestra, aunque una retirada ya haya eliminado su fila numérica. Así una entrega antigua de otro día no resucita datos retirados. La corrección conserva evidencia raw y sólo elimina proyecciones vigentes cuando su versión lo permite.

Se revocan DML y privilegios auxiliares de cliente en las tablas health seleccionadas, manteniendo SELECT de propietario y RLS. La tabla raw compartida conserva su DML legacy, con TRUNCATE/REFERENCES/TRIGGER de cliente revocados y un trigger que protege los nuevos campos foundation y su evidencia. Antes de adoptar una proyección legacy inequívoca, se archiva su fila completa en raw con canal `admin_backfill` y modo `manual_entry`: esa operación de archivo no se presenta como una nueva captura oficial Garmin. La provenance original queda en la fila archivada y metadata.

El [contrato exacto y siguiente source](garmin-health-contract.md), el [runbook](health-foundation-deployment.md) y las [consultas de verificación sin escritura](../supabase/verification/health_foundation_v1.sql) completan la preparación. La migración se aplica mediante el despliegue normal tras revisar/mergear el PR; el trabajo de este bloque no altera el esquema ni los datos reales.

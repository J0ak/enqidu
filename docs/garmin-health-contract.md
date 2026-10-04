# Garmin Health Foundation V1: contrato interno

Este contrato prepara ingestión wearable 24/7. No implementa el transporte Fitness AI, el acceso Garmin oficial, readiness, Coach, UI ni MCP. El JavaScript ESM encaja con el repositorio; los `.d.ts` describen DTOs estables para futuros consumidores TypeScript sin añadir dependencias.

```text
FitnessAiGarminSource (siguiente bloque) ─┐
                                      ├─ GarminSource DTO ─ GarminAdapter ─ envelope ENQIDU ─ RPC server-side
OfficialGarminSource (futuro) ───────────┘
```

## Interfaz que implementará FitnessAiGarminSource

`src/health/garminSource.js` define la interfaz; `garminSource.d.ts` define `GarminHealthRecord`, discriminado por `data_type`:

- `daily_health`, `sleep`, `hrv`, `stress`, `body_battery`;
- `respiration`, `spo2`, `body_composition`, `vendor_insight`, `heart_rate`.

El único método obligatorio es:

```ts
getHealthRecords(request: {
  from_date: string; // YYYY-MM-DD, inclusive, calendario del atleta
  to_date: string;   // YYYY-MM-DD, inclusive
  timezone: string;  // IANA explícita del perfil; no timezone del navegador
  cursor?: string | null; // opaco, perteneciente a esta solicitud
}): Promise<{
  records: GarminHealthRecord[];
  next_cursor: string | null;
}>
```

La fuente debe llamar `validateGarminSourceRequest`, resolver credenciales exclusivamente en servidor y devolver DTOs completos. Un cursor pagina **registros completos**, nunca fragmentos de las muestras de un mismo tipo/día. Si el proveedor entrega parches o varias páginas para un mismo registro, la fuente debe ensamblar el snapshot completo antes de entregarlo al adapter. Este bloque no crea transporte, autenticación del proveedor, scheduler ni endpoint de ingestión público.

Mientras se use Fitness AI, todo DTO llevará `provider="garmin"`, `provider_mode="aggregator"` e `ingestion_channel="fitness_ai_connector"`. La integración oficial futura usará `provider="garmin"`, `provider_mode="official_api"` e `ingestion_channel="garmin_health_api"`. El adapter rechaza combinaciones cruzadas y no depende de las claves o del SDK de ninguno de los transportes. La presencia de un DTO soportado **no acredita** que un proveedor pueda obtener esa métrica.

Cada DTO lleva `calendar_date`, `retrieved_at` y el tipo. También puede llevar `timezone`, `observed_at`, `source_updated_at`, `source_identifier`, `data_confidence`, `measurements` y `raw`. `source_identifier` es un identificador opaco, no vacío, de hasta 2000 caracteres; su ausencia es `null`. La identidad del usuario queda fuera del DTO y procede del contexto autenticado del servidor.

`measurements` utiliza nombres canónicos de columnas existentes, pero **la unidad del valor de entrada la determina `unit`**. Por ejemplo, `distance_m: {value: 2, unit: "km"}` se convierte a `distance_m=2000`. La fuente no debe renombrar datos calculados del vendedor como observaciones fisiológicas objetivas.

```js
const dto = {
  provider: "garmin",
  provider_mode: "aggregator",
  ingestion_channel: "fitness_ai_connector",
  data_type: "daily_health",
  calendar_date: "2026-10-04",
  timezone: "Europe/Madrid",
  retrieved_at: "2026-10-05T08:00:00+02:00",
  source_updated_at: null,
  source_identifier: "opaque-provider-id",
  data_confidence: "reported",
  measurements: {
    steps: { value: 8500, unit: "count" },
    distance_m: { value: 6.3, unit: "km" },
    resting_heart_rate_bpm: { value: null, unit: "bpm" },
  },
  raw: { supplied_fields: { steps: 8500, distanceKm: 6.3 } },
};
```

## DTOs y modelo canónico

`normalizeGarminHealthRecord(dto)` o `new GarminAdapter().normalize(dto)` devuelve:

```ts
{
  schema_version: "enqidu.wearable.v1",
  data_type, calendar_date,
  timezone: string | null,
  observed_at: string | null, // UTC
  provenance: {
    provider: "garmin", provider_mode, ingestion_channel,
    source_identifier: string | null,
    retrieved_at: string, // UTC obligatorio
    source_updated_at: string | null, // UTC, versión/actualización realmente suministrada
    data_confidence: "reported" | "user_verified" | "calculated" |
      "estimated" | "ocr_unverified" | "unknown",
  },
  metrics: { /* columnas canónicas; valores ausentes => null */ },
  samples: [], stages: [],
  evidence: { raw: JSON | null, source_dto: /* DTO completo */ },
}
```

`GarminAdapter.normalizePage({records,next_cursor})` aplica el mismo normalizador sin persistir. `validateCanonicalHealthRecord(envelope)` vuelve a normalizar la evidencia y exige igualdad estructural del envelope. Añadir columnas arbitrarias, identidad de usuario o valores que no coincidan con la evidencia falla antes de la escritura.

| Tipo | Campos/representación reutilizados |
| --- | --- |
| daily_health | Columnas de `wearable_health_daily`: pasos, distancia, HR min/max/resting, estrés, intensidades, calorías activas/BMR, SpO2, respiración y Body Battery suministrados. `GARMIN_MEASUREMENT_FIELDS.daily_health` es la lista exacta; `stress_qualifier` es texto independiente. |
| sleep | Columnas de `wearable_sleep_sessions`, incluyendo duración y fases agregadas, sleep score, HRV suministrada, respiración, SpO2 y cambio de temperatura. Límites opcionales `sleep_start_at`/`sleep_end_at`, texto `respiration_variation_status`; `stages` representa intervalos. |
| hrv | `last_night_avg_ms`, `last_night_5min_high_ms`, `status` opcional; muestras `hrv_ms`. No se calcula un promedio a partir de muestras. |
| stress | Campos diarios de estrés si se suministran; muestras `stress_value` y `stress_status`. No se estima estrés a partir de HR. |
| body_battery | `body_battery_current`, `body_battery_charged`, `body_battery_drained`; muestras `body_battery_value`. No se calcula energía ni readiness. |
| respiration | `respiration_avg_brpm`, `respiration_min_brpm`; muestras `breaths_per_minute`. |
| spo2 | `spo2_avg_pct`, `spo2_min_pct`; muestras `spo2_percent`. |
| heart_rate | `resting_heart_rate_bpm`, `min_heart_rate_bpm`, `max_heart_rate_bpm`; muestras `heart_rate_bpm`. |
| body_composition | `measured_at` obligatorio; `weight_kg`, `body_fat_pct`, `body_water_pct`, `skeletal_muscle_mass_kg`, `bone_mass_kg`, `bmi` suministrados. No se deriva BMI. |
| vendor_insight | `insight` con `code`, `domain` y al menos uno de `value_numeric`, `value_text`, `value_json`. Produce los campos existentes de `wearable_vendor_insights`, siempre `vendor_calculated=true`. VO2max y Fitness Age permanecen aquí como resultados del vendedor. |

Un código de insight identifica una semántica estable dentro de Garmin; la fuente debe evitar reutilizar un código para significados distintos. `api_availability` sólo admite los valores existentes del esquema y por defecto es `not_publicly_confirmed`; nunca se presume disponibilidad oficial.

Una muestra fuente es `{recorded_at, measurement?:{value,unit}, context?, nominal_resolution?:{value,unit}, resolution_status?, stress_status?, raw?}`. El resultado usa el nombre de columna de su familia y preserva `{raw,source_dto}` en `raw_payload`. Contexto ausente se convierte a `unknown` donde exista ese campo. Cadencia ausente permanece `null`; `resolution_status` por defecto es `observed_to_validate`, sin atribuir una cadencia ni validación oficial inexistentes. Estrés sin estado usa `unidentified`. Un sentinel negativo de estrés sólo se convierte en ausencia numérica cuando la fuente declara explícitamente un estado no medido; el valor original se conserva en evidencia.

Una fase fuente es `{stage_code?,start_at,end_at,duration?:{value,unit},raw?}`. Las fases permitidas son `awake`, `rem`, `light`, `deep`, `unmeasurable`, `unknown`. El adapter rechaza intervalos duplicados, solapados, inversos, duración explícita contradictoria o intervalos fuera de los límites de sueño cuando éstos se conocen. No calcula una duración ausente ni rellena fases desconocidas.

## Unidades, nulls y evidencia

| Magnitud | Entradas aceptadas | Unidad canónica |
| --- | --- | --- |
| distancia | m, km | m |
| duración | s, min, h | segundos; intensidad diaria en minutos |
| HRV | ms, s | ms |
| masa | kg, lb | kg |
| porcentaje | %, fraction | % |
| energía | kcal, kJ | kcal |
| frecuencia cardiaca | bpm | bpm |
| respiración | brpm, breaths/min | respiraciones/minuto |
| puntuación/capacidad | score | escala reportada 0–100 |
| carga/descarga acumulada Body Battery | score | unidades reportadas; pueden superar 100 en un día |
| conteos | count | enteros |
| BMI | ratio | valor reportado, sin cálculo |
| cambio temperatura | C, °C | °C; se admite signo |

Los campos integer de Postgres requieren un entero no negativo de 32 bits tras conversión; no se redondean silenciosamente minutos ni segundos. HR observado exige `0 < bpm <= 300`; porcentajes/capacidades/puntuaciones se validan en 0–100 y los límites min/max sólo se comparan cuando ambos existen. El cero observado válido se conserva como cero; una métrica ausente, `null` o `{value:null,unit:válida}` es `null`. No se usan strings numéricos, unidades adivinadas o biometría derivada.

Timestamps deben ser ISO con `Z` u offset explícito, años 0001–9999 y hasta milisegundos. Se convierten a UTC `YYYY-MM-DDTHH:mm:ss.sssZ`, rechazando fechas inválidas y precisiones que podrían colisionar al truncarse. `calendar_date` conserva el día que la fuente declara; en sueño puede representar el día de despertar. La zona IANA se normaliza mediante `Intl` (por ejemplo, `europe/madrid` → `Europe/Madrid`); la escritura original permanece en evidencia. Timezone desconocida permanece `null`; el request sí exige timezone del atleta. No hay fallback al navegador.

Campos desconocidos, incluyendo mediciones todavía sin proyección, siguen en `evidence.source_dto`; `raw` sigue en `evidence.raw`. La fuente debe extraer únicamente payload sanitario autorizado y excluir cabeceras Authorization, cookies, tokens, contraseñas y secretos **antes** de construir el DTO. No se presupone que un payload real Fitness AI esté validado en este bloque. Se permiten sólo valores JSON finitos, arrays densos y objetos simples; se rechazan ciclos, accessors y pérdida silenciosa de propiedades. El DTO y envelope completo, incluidas las copias de evidencia, se limitan a 2 MiB, profundidad 32 y 100000 nodos. Una fuente futura debe dividir lotes en registros completos sin truncar evidencia o muestras silenciosamente.

## Identidad y persistencia

`getGarminHealthNaturalKey(userId,envelope)` expresa la identidad lógica, con serialización JSON sin concatenación ambigua:

| Familia | Identidad, además de usuario + provider + tipo |
| --- | --- |
| daily_health, sleep, hrv y familias diarias de muestras | calendar_date |
| body_composition | measured_at UTC; calendar_date es un atributo corregible |
| vendor_insight con observed_at | insight_code + observed_at UTC; calendar_date es corregible |
| vendor_insight sin observed_at | insight_code + calendar_date |
| muestras proyectadas | provider + familia + recorded_at UTC + contexto cuando exista |
| fases de un sueño | sesión canónica + intervalo UTC |

`source_identifier` se conserva como provenance, pero no crea otra identidad canónica cuando cambia entre conectores, aparece tarde o cambia en una corrección. `provider_mode`, `ingestion_channel`, `retrieved_at`, raw y confianza tampoco forman parte de la identidad. Datos de usuarios, tipos, días distintos o mediciones en instantes distintos no colisionan.

Una corrección que cambia el instante físico `measured_at`/`observed_at` es otra identidad; este bloque no adivina que se trate del mismo evento. Si payloads autorizados demuestran que esos timestamps se corrigen, el siguiente bloque necesitará reconciliación explícita mediante alias/evidencia antes de activar ese caso, con su regression test.

Cada DTO es un **snapshot completo del tipo y ámbito**, no un patch: una métrica ausente equivale a `null`; una lista ausente equivale a `[]`. Una corrección puede retirar una muestra o fase previa de ese snapshot. La fuente deberá fusionar cambios parciales con su snapshot previo o consultar de nuevo la totalidad antes de entregar el DTO. El envelope canónico preserva las muestras desconocidas; las proyecciones objetivas omiten valores `null` cuando su tabla exige valores numéricos, con evidencia conservada. No se asigna cero para hacer pasar un NOT NULL.

Imports conserva las identidades de muestras cubiertas en metadata interna, incluidas las retiradas. Ese registro no contiene biometría; permite comparar versiones entre snapshots de distintos días y bloquear la recuperación de una muestra antigua después de una retirada a `null` o por ausencia. Las filas numéricas representan la proyección global vigente; los envelopes conservan los snapshots suministrados y su evidencia, incluidos los datos que una versión posterior ha reemplazado.

La persistencia usa `wearable_health_imports.normalized_payload` como envelope completo y las tablas `wearable_*` existentes como proyecciones. Resúmenes de stress/Body Battery/respiration/SpO2/heart_rate permanecen en su propio envelope; no sobrescriben la fila `daily_health` de otro tipo. Las escrituras pasan por el helper de servidor y la RPC estrecha `ingest_garmin_health_record`; el navegador no recibe acceso de escritura ni `service_role`. Véanse `health-foundation-audit.md` y la migración versionada para privilegios, versionado de evidencia y actualización tardía.

La llamada de un solo registro es `persistGarminHealthRecord({db, authenticatedUser, record})`, en `supabase/functions/_shared/garminHealthPersistence.js`. `record` es el envelope validado; `authenticatedUser.id` procede de autenticación o de una conexión consentida verificada en servidor. El helper llama exclusivamente `ingest_garmin_health_record(p_user_id uuid, p_record jsonb)` y devuelve `{status,health_import_id,raw_payload_id,record_key}`. Los estados son `inserted`, `updated`, `unchanged` e `ignored_stale`; los errores se propagan sin avanzar un cursor.

La actualización prioriza `source_updated_at` cuando el proveedor la aporta; sin versión del proveedor, usa `retrieved_at`. Si el estado actual tiene versión conocida y la nueva entrega carece de ella, conserva la versión conocida y registra la evidencia de la entrega. El timestamp de retrieval no forma otra revisión raw por sí solo. No se infiere una versión o un momento de observación ausentes.

La interfaz exacta de persistencia es `persistGarminHealthRecord({db,authenticatedUser:{id},record})` en `supabase/functions/_shared/garminHealthPersistence.js`. Devuelve `{status,health_import_id,raw_payload_id,record_key}`; `status` es `inserted`, `updated`, `unchanged` o `ignored_stale`. La RPC valida de nuevo los campos permitidos. El transporte futuro no recibe autoridad para seleccionar un usuario mediante su payload.

El siguiente bloque consumirá la función de orquestación existente `ingestGarminHealthPage`, sin cambiar el adapter ni el dominio:

```js
import { ingestGarminHealthPage } from "./supabase/functions/_shared/ingestGarminHealthPage.js";

// serverDb, verifiedUser y fitnessAiGarminSource los resolverá el servidor futuro.
const result = await ingestGarminHealthPage({
  db: serverDb,
  authenticatedUser: verifiedUser,
  source: fitnessAiGarminSource,
  request: {
    from_date: "2026-10-01", to_date: "2026-10-04", timezone: "Europe/Madrid",
    cursor: null,
  },
});
// {processed_count,next_cursor,results}; source page <=100 registros completos.
```

La página entera se normaliza antes de empezar a escribir; cada registro se persiste de forma atómica. Si falla un registro, no se devuelve un cursor de éxito: se reintenta la página y la idempotencia absorbe los registros ya persistidos. Los DTOs deben quedar dentro del rango de fechas solicitado.

Antes de activar Fitness AI, demostrar mediante el contrato y la base local: ingestión inicial; reingesta idéntica sin nuevas filas; corrección del mismo día sin duplicados; corrección stale sin degradar el estado; cambio de identificador/canal sin duplicado; aislamiento entre usuarios/días; retirada válida de una muestra; evidencia preservada. Los tests de normalización y persistencia de este bloque son el gate reutilizable, no pruebas de disponibilidad de una API todavía no conectada.

## Límite con el pipeline FIT

Se conserva explícitamente: **FIT Garmin + parser ENQIDU + relato/feedback del usuario + Coach = sesión canónica fusionada**. FIT conserva detalle objetivo/fisiológico; usuario y Coach conservan significado semántico real. Si Garmin informa `Unknown` y el usuario confirma front squat 45×5, ENQIDU conserva la evidencia Garmin y utiliza la semántica confirmada para coaching. Este contrato sanitario no modifica parsing FIT, históricos, sesiones realizadas ni su deduplicación.

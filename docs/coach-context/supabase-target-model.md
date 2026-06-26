# Supabase Target Model v0

Este modelo empezo como propuesta documental. La fase schema v0 lo convierte en
una migracion revisable bajo `supabase/migrations/`, pero no la aplica contra
Supabase real.

## Criterios transversales schema v0

Todas las tablas futuras deberian:

- usar `user_id uuid null` cuando puedan mapearse a `auth.users`;
- usar `fixture_user text null` para fixtures historicos;
- distinguir `editable_live_state` de `historical_fixture`;
- conservar `source_path` y, cuando aplique, `raw_source_path`;
- definir una `natural_key` unica para idempotencia;
- habilitar RLS antes de exponerse a clientes;
- evitar que Jotason aparezca en nombres de tablas o logica runtime.
- mantener fixtures `user_id is null` sin politica publica de lectura.

## Migracion preparada

La migracion `coach_context_schema_v0` crea tablas con prefijo `coach_` para
evitar colisiones:

- `coach_athlete_profiles`
- `coach_athlete_training_goals`
- `coach_athlete_constraints`
- `coach_equipment_locations`
- `coach_equipment_items`
- `coach_context_sources`
- `coach_context_snapshots`
- `coach_session_fixtures`
- `coach_session_blocks`
- `coach_session_exercises`
- `coach_seed_runs`

La migracion es aditiva y no debe tocar Garmin/FIT, planned/executed, Edge
Functions ni auth runtime.

## `athlete_profiles`

Proposito: perfil base del atleta.

Campos minimos: `id`, `user_id`, `fixture_user`, `display_name`, `role`,
`editable_live_state`, `historical_fixture`, `source_path`, `natural_key`.

Relacion con `auth.users`: `user_id` sera obligatorio para usuarios reales y
null para fixtures. `fixture_user` identifica pilotos sin auth real.

Dato vivo o historico: vivo para usuarios reales; historico para Jotason.

Origen normalized: `athlete-context.normalized.json`.

Trazabilidad raw: via `source_traceability.source_files`.

Riesgos: no confundir fixture con cuenta real.

Decision abierta: si el fixture debe vivir en la misma tabla o en tablas de
fixtures.

Clave natural: `fixture_user:athlete_profile` o `user_id`.

RLS futura: `TO authenticated` con `user_id = auth.uid()` para datos vivos;
fixtures solo rol interno.

Relacion Garmin/FIT: indirecta por atleta, no por proveedor.

## `athlete_training_goals`

Proposito: objetivos, prioridades y reglas de entrenamiento.

Campos minimos: `id`, `user_id`, `fixture_user`, `plan_name`, `priorities`,
`rules`, `editable_live_state`, `source_path`, `natural_key`.

Relacion auth: `user_id` para objetivos vivos; `fixture_user` para referencias.

Dato vivo o historico: vivo cuando el usuario edita objetivos; historico para
Promaestro.

Origen normalized: `training-reference.normalized.json`.

Trazabilidad raw: `jotason_promaestro_v5.json`.

Riesgos: tratar un plan historico como disponibilidad actual.

Decision abierta: versionar objetivos o mantener solo estado actual.

Clave natural: `fixture_user:training_goals:plan_name`.

RLS futura: propietario por `user_id`; fixtures no publicos.

Relacion Garmin/FIT: ayuda a interpretar carga, no sustituye metricas.

## `athlete_constraints`

Proposito: restricciones de entrenamiento, lesiones, reglas de ubicacion y
limitaciones.

Campos minimos: `id`, `user_id`, `fixture_user`, `location_id`,
`constraints jsonb`, `source_path`, `natural_key`.

Relacion auth: por usuario real o fixture.

Dato vivo o historico: vivo para restricciones actuales; historico si viene de
fixture.

Origen normalized: `equipment-inventory.normalized.json` y futuros perfiles.

Trazabilidad raw: `inventory_home_v4.json`.

Riesgos: inferir restricciones globales desde una ubicacion home.

Decision abierta: separar lesiones de restricciones logisticas.

Clave natural: `fixture_user:constraints:location_id`.

RLS futura: solo propietario; datos sensibles.

Relacion Garmin/FIT: puede modular recomendaciones tras carga real.

## `athlete_equipment_locations`

Proposito: ubicaciones donde existe inventario.

Campos minimos: `id`, `user_id`, `fixture_user`, `location_id`,
`location_type`, `label`, `source_path`, `natural_key`.

Relacion auth: propietario real o fixture.

Dato vivo o historico: vivo si el usuario edita ubicaciones.

Origen normalized: `equipment-inventory.normalized.json`.

Trazabilidad raw: `inventory_home_v4.json`.

Riesgos: usar inventario home en sesiones fuera de casa.

Decision abierta: catalogo cerrado de `location_type`.

Clave natural: `fixture_user:equipment_location:location_id`.

RLS futura: propietario por `user_id`.

Relacion Garmin/FIT: ninguna directa.

## `athlete_equipment_items`

Proposito: items disponibles por ubicacion.

Campos minimos: `id`, `location_id`, `item_id`, `category`, `name`,
`quantity`, `unit`, `value`, `source_path`, `natural_key`.

Relacion auth: mediante ubicacion/usuario.

Dato vivo o historico: vivo para inventario editable; historico para fixture.

Origen normalized: `equipment-inventory.normalized.json`.

Trazabilidad raw: `inventory_home_v4.json`.

Riesgos: duplicados por nombres similares o unidades ambiguas.

Decision abierta: normalizar catalogo global de equipamiento.

Clave natural: `fixture_user:equipment_item:location_id:item_id`.

RLS futura: via ownership de ubicacion.

Relacion Garmin/FIT: ninguna directa.

## `coach_context_sources`

Proposito: catalogo de fuentes raw y normalized usadas por Coach Context.

Campos minimos: `id`, `fixture_user`, `source_kind`, `source_path`,
`editable_live_state`, `natural_key`.

Relacion auth: opcional; sources fixture pueden no tener usuario real.

Dato vivo o historico: historico.

Origen normalized: manifest y source traceability.

Trazabilidad raw: path directo.

Riesgos: rutas fuera de `docs/coach-context/`.

Decision abierta: almacenar hash de contenido.

Clave natural: `fixture_user:source_kind:source_path`.

RLS futura: solo lectura interna.

Relacion Garmin/FIT: registrar origen si hay fuente Garmin versionada.

## `coach_context_snapshots`

Proposito: snapshot reproducible del contexto coach normalizado.

Campos minimos: `id`, `fixture_user`, `source_path`, `references_count`,
`session_fixtures_count`, `editable_live_state`, `natural_key`.

Relacion auth: usuario real en snapshots vivos; fixture en historicos.

Dato vivo o historico: historico para esta fase.

Origen normalized: `coach-context.normalized.json`.

Trazabilidad raw: source files dentro del snapshot.

Riesgos: snapshot grande si se guarda completo.

Decision abierta: guardar JSON completo o solo metadata.

Clave natural: `fixture_user:coach_context_snapshot:version`.

RLS futura: propietario o rol interno.

Relacion Garmin/FIT: puede referenciar resumen de carga, no sustituirlo.

## `coach_session_fixtures`

Proposito: sesiones fixture normalizadas.

Campos minimos: `id`, `fixture_user`, `date`, `title`, `sport`,
`session_type`, `normalized_path`, `raw_source_path`, `natural_key`.

Relacion auth: null para fixtures; opcional para usuario real si se promueve.

Dato vivo o historico: historico.

Origen normalized: `sessions/*.normalized.json`.

Trazabilidad raw: `source_traceability.source_path`.

Riesgos: confundir tipo Garmin con intencion.

Decision abierta: si se separan planned fixtures y executed fixtures.

Clave natural: `fixture_user:session:date:source_file`.

RLS futura: lectura interna o fixtures anonimizados.

Relacion Garmin/FIT: secundaria y explicita.

## `coach_session_blocks`

Proposito: bloques estructurados de una sesion fixture.

Campos minimos: `id`, `session_id`, `block_order`, `block_id`, `block_type`,
`title`, `rounds`, `estimated_duration_min`, `normalized_path`,
`natural_key`.

Relacion auth: por sesion.

Dato vivo o historico: historico para fixtures.

Origen normalized: `session.blocks`.

Trazabilidad raw: path de sesion.

Riesgos: algunos fixtures no tienen bloques.

Decision abierta: mapear bloques planned, Garmin y coach en tablas separadas.

Clave natural: `session_natural_key:block:block_id`.

RLS futura: heredar ownership de sesion.

Relacion Garmin/FIT: no mezclar con laps o intervalos Garmin sin capa clara.

## `coach_session_exercises`

Proposito: ejercicios dentro de bloques coach.

Campos minimos: `id`, `block_id`, `exercise_order`, `exercise_name`,
`equipment`, `sets`, `reps`, `duration_sec`, `rest_sec`, `load_kg`,
`natural_key`.

Relacion auth: por bloque/sesion.

Dato vivo o historico: historico para fixtures.

Origen normalized: `block.exercises`.

Trazabilidad raw: path de sesion.

Riesgos: ejercicios sparse o nombres no canonicos.

Decision abierta: catalogo canonico de ejercicios.

Clave natural: `block_natural_key:exercise:order`.

RLS futura: heredar ownership de sesion.

Relacion Garmin/FIT: complementa, no reemplaza metricas reales.

## `coach_seed_runs`

Proposito: registrar ejecuciones dry-run y futuras ejecuciones reales de seed.

Campos minimos: `id`, `fixture_user`, `mode`, `generated_from`,
`writes_to_database`, `created_at`, `natural_key`, `summary`.

Relacion auth: rol interno.

Dato vivo o historico: historico operacional.

Origen normalized: script de seed.

Trazabilidad raw: listado de sources del plan.

Riesgos: permitir un modo real sin aprobacion.

Decision abierta: formato de rollback.

Clave natural: `fixture_user:seed_run:mode:version`.

RLS futura: no expuesto a cliente.

Relacion Garmin/FIT: ninguna directa.


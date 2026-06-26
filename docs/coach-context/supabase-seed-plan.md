# Supabase Seed Plan v0

Este documento prepara una fase futura de seed Supabase desde Coach Context
normalizado. No define una migracion activa y no escribe datos reales.

Principio clave:

```text
Los normalized JSON son una fuente preparada y trazable, no son todavia datos
vivos de produccion.
```

## Fuentes

Los raw JSON son los archivos historicos del piloto Jotason conservados bajo
`docs/coach-context/references/jotason/` y
`docs/coach-context/fixtures/jotason/sessions/`. Son evidencia y fixture; no son
el modelo runtime de ENQIDU.

Los normalized JSON son materializaciones generadas por adaptadores JavaScript
bajo `docs/coach-context/normalized/jotason/`. Aplican un contrato generico
ENQIDU sobre datos Jotason y conservan trazabilidad a raw JSON.

Actualmente existen:

- `athlete-context.normalized.json`
- `coach-context.normalized.json`
- `equipment-inventory.normalized.json`
- `training-reference.normalized.json`
- `normalized-manifest.json`
- 16 sesiones bajo `sessions/*.normalized.json`
- `supabase-seed-plan.generated.json`, generado por `npm run coach:supabase:plan`

## Entidades derivables

Desde los normalized JSON se puede preparar un seed dry-run para:

- `athlete_profiles`
- `athlete_training_goals`
- `athlete_constraints`
- `athlete_equipment_locations`
- `athlete_equipment_items`
- `coach_context_sources`
- `coach_context_snapshots`
- `coach_session_fixtures`
- `coach_session_blocks`
- `coach_session_exercises`
- `coach_seed_runs`

El seed real debe esperar a una PR posterior con modelo aprobado, migraciones,
RLS y entorno dev. Esta rama solo produce un plan local.

## Que puede cargarse como seed

Puede cargarse, en una fase futura, informacion fixture historica con
`fixture_user = jotason` y sin `auth_user_id` real:

- perfil fixture del atleta piloto;
- objetivos historicos y reglas Promaestro;
- ubicacion de inventario detectada;
- items de inventario normalizados;
- fuentes raw y normalized;
- snapshot del contexto coach;
- sesiones normalizadas;
- bloques y ejercicios de esas sesiones;
- registro de seed dry-run o seed real.

Cada fila candidata debe tener clave natural, operacion idempotente y
trazabilidad a `docs/coach-context/`.

## Que no debe cargarse todavia

No cargar como dato vivo:

- usuario real de `auth.users`;
- disponibilidad actual;
- preferencias editables actuales;
- Garmin/FIT ejecutado como si viniera del fixture coach;
- planned sessions productivas;
- recomendaciones IA reales;
- credenciales, tokens o configuracion de entorno;
- datos que dependan de UI, auth, Edge Functions o RPCs actuales.

## Trazabilidad

Cada entidad futura debe conservar:

- `source_path` al normalized JSON que la origina;
- `raw_source_path` cuando exista;
- `fixture_user`;
- `historical_fixture`;
- `editable_live_state`;
- `natural_key`.

La cadena esperada es:

```text
raw JSON
-> normalized JSON
-> supabase-seed-plan.generated.json
-> future migration review
-> future controlled seed
```

## Genericidad

Jotason no se convierte en producto. Se usa como `fixture_user`. El modelo debe
aceptar otros atletas, otros inventarios, otros proveedores de actividades y
otras estructuras de semana. Ninguna tabla futura debe llamarse con Jotason en
el nombre.

## Campos editables e historicos

Editables en produccion, para usuarios reales:

- perfil de atleta;
- objetivos;
- restricciones;
- ubicaciones e inventario;
- disponibilidad;
- recomendaciones aceptadas;
- planned sessions.

Historicos o no editables para fixtures:

- raw JSON;
- normalized JSON;
- sesiones fixture;
- trazabilidad;
- snapshots de contexto;
- resultados de seed.

## Duplicados y rollback

El plan usa claves naturales reproducibles con `fixture_user`, tipo de entidad y
path o fecha de origen. La fase real deberia usar `insert ... on conflict` sobre
esas claves naturales, con logs de seed en `coach_seed_runs`.

Rollback futuro:

- identificar `coach_seed_runs`;
- borrar solo filas con `fixture_user = jotason` y run aprobado;
- no tocar `training_sessions` reales;
- no borrar datos de usuarios reales;
- conservar raw y normalized JSON versionados.

## Garmin/FIT y Coach fixtures

Garmin/FIT real sigue siendo fuente fisiologica. Los fixtures coach conservan
intencion, bloques y ejercicios cuando existan. El seed no debe mezclar
metricas Garmin/FIT reales con sesiones fixture salvo que exista una
trazabilidad explicita y una relacion aprobada.

## Riesgos abiertos

- decidir si los fixtures viven en tablas compartidas o en un namespace de seed;
- definir RLS para datos fixture visibles solo a roles internos;
- mapear `fixture_user` a `auth.users` solo si se aprueba explicitamente;
- separar objetivos historicos de objetivos actuales;
- resolver campos sparse en sesiones antiguas sin inventar datos;
- validar costes antes de conectar IA integrada.


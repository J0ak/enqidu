# Apply Supabase Schema v0

Este documento describe como aplicar manualmente el schema Coach Context v0 en
una fase posterior. Este PR no aplica nada por si mismo.

## Antes de aplicar

1. Revisar el PR completo.
2. Revisar `supabase/migrations/20260626123654_coach_context_schema_v0.sql`.
3. Confirmar que solo crea tablas `coach_*`.
4. Confirmar que no toca Garmin/FIT, planned/executed, Edge Functions ni auth
   runtime.
5. Confirmar backups del entorno destino.
6. Usar solo entorno dev.
7. No usar produccion para la primera aplicacion.

## Pre-apply checklist

- Revisar migracion.
- Revisar RLS.
- Confirmar entorno dev.
- Confirmar backup.
- Ejecutar `npm run coach:supabase:dev-preflight`.
- Generar `npm run coach:supabase:dev-verify-sql`.
- Aplicar migracion manualmente.
- Verificar tablas.
- Verificar RLS enabled.
- Verificar policies.
- Verificar funcion y triggers `coach_context_set_updated_at`.
- No ejecutar seed todavia.
- Preparar rollback.
- Documentar resultado.

## Aplicacion manual

1. Aplicar la migracion solo cuando este aprobada.
2. Comprobar que existen las 11 tablas nuevas.
3. Comprobar que todas tienen RLS habilitada.
4. Comprobar que `anon` no tiene acceso.
5. Comprobar que `authenticated` solo accede a filas con `user_id = auth.uid()`.
6. Confirmar que fixtures con `user_id is null` no quedan visibles a usuarios.
7. Revisar indices y constraints.
8. Ejecutar seed solo despues, si se aprueba explicitamente.
9. Verificar conteos esperados.
10. Aplicar rollback si algo falla.

## Verificacion local previa

```bash
npm run coach:supabase:dev-preflight
npm run coach:supabase:dev-verify-sql
```

El preflight no conecta a Supabase. El generador de verificacion solo escribe un
SQL local con consultas `SELECT`. La aplicacion de la migracion sigue siendo
manual y debe hacerse solo en Supabase dev.

## Seed

El seed no se ejecuta automaticamente.
El seed real queda para otra fase, despues de revisar RLS y verificar la
migracion aplicada en dev.

Archivos relevantes:

- `supabase/seed/coach_context_jotason_seed_draft.sql`
- `supabase/seed/coach_context_jotason_seed.generated.sql`
- `supabase/seed/coach_context_jotason_rollback_draft.sql`

El seed generado esta envuelto en `rollback;` para dejar claro que es un
artefacto de revision. Para una fase real habra que editarlo, aprobarlo y
ejecutarlo conscientemente en dev.

## Updated at

La migracion crea `public.coach_context_set_updated_at()` y solo la usa en
triggers de tablas nuevas `coach_*`. No modifica ni reutiliza funciones/triggers
existentes para evitar efectos laterales sobre tablas actuales.

## Fixtures y RLS

Las filas fixture usan `user_id is null` y `fixture_user = 'jotason'`.

No hay politica publica para leer fixtures. Las policies de usuarios reales
usan `auth.uid() = user_id`, de modo que los fixtures no quedan visibles para
usuarios finales por defecto.

## Verificaciones posteriores

- Las tablas `coach_*` existen.
- La funcion `coach_context_set_updated_at` existe.
- Los triggers `updated_at` solo existen sobre tablas `coach_*`.
- No hay cambios en `training_sessions`.
- No hay cambios en tablas Garmin/FIT.
- No hay cambios en `planned_training_sessions`.
- No hay cambios en `supabase/functions/`.
- RLS no contiene policies publicas.
- Los fixtures `jotason` conservan `fixture_user` y trazabilidad.

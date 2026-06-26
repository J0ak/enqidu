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

## Seed

El seed no se ejecuta automaticamente.

Archivos relevantes:

- `supabase/seed/coach_context_jotason_seed_draft.sql`
- `supabase/seed/coach_context_jotason_seed.generated.sql`
- `supabase/seed/coach_context_jotason_rollback_draft.sql`

El seed generado esta envuelto en `rollback;` para dejar claro que es un
artefacto de revision. Para una fase real habra que editarlo, aprobarlo y
ejecutarlo conscientemente en dev.

## Verificaciones posteriores

- Las tablas `coach_*` existen.
- No hay cambios en `training_sessions`.
- No hay cambios en tablas Garmin/FIT.
- No hay cambios en `planned_training_sessions`.
- No hay cambios en `supabase/functions/`.
- RLS no contiene policies publicas.
- Los fixtures `jotason` conservan `fixture_user` y trazabilidad.


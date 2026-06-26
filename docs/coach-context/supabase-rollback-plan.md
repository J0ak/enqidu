# Supabase Rollback Plan v0

Este plan cubre rollback de la fase Coach Context schema v0. No debe ejecutarse
automaticamente.

## 1. Revertir la migracion

Si la migracion aun no se ha aplicado, no hay rollback tecnico: cerrar o ajustar
el PR.

Si se aplico en dev y debe revertirse, crear una migracion posterior de rollback
revisada. No editar la migracion ya aplicada.

Tablas nuevas candidatas a eliminar:

- `coach_session_exercises`
- `coach_session_blocks`
- `coach_session_fixtures`
- `coach_context_snapshots`
- `coach_context_sources`
- `coach_equipment_items`
- `coach_equipment_locations`
- `coach_athlete_constraints`
- `coach_athlete_training_goals`
- `coach_athlete_profiles`
- `coach_seed_runs`

Eliminar en orden inverso a dependencias.

## Pre-rollback checklist

- Confirmar entorno dev.
- Confirmar backup reciente.
- Confirmar que el rollback afecta solo tablas `coach_*`.
- Confirmar que no hay datos reales con `user_id` en tablas `coach_*`.
- Confirmar `fixture_user = 'jotason'` para seed de fixture.
- No tocar Garmin/FIT.
- No tocar planned/executed.
- Documentar conteos antes y despues.

## 2. Proteger datos reales

Antes de borrar nada:

- confirmar entorno dev;
- revisar backups;
- revisar conteos por `user_id`;
- revisar conteos por `fixture_user`;
- confirmar que no hay usuarios reales usando tablas `coach_*`.

No borrar tablas fuera del prefijo `coach_`.

## 3. Evitar Garmin/FIT

El rollback no debe tocar:

- `training_sessions`;
- tablas de FIT payload;
- tablas de Garmin series;
- planned/executed actuales;
- import Garmin/FIT;
- Edge Functions.

## 4. Detectar seed runs

Consultar `coach_seed_runs` por:

- `fixture_user = 'jotason'`;
- `seed_key`;
- `mode`;
- `status`.

Un rollback de fixtures debe registrar resultado en `coach_seed_runs` o en una
migracion posterior aprobada.

## 5. Rollback solo de Jotason

Para limpiar solo fixtures:

1. Filtrar siempre por `fixture_user = 'jotason'`.
2. No filtrar por `user_id is null` como unica condicion.
3. Borrar primero ejercicios, bloques y sesiones.
4. Borrar despues snapshots, sources, inventario, objetivos y perfil.
5. Mantener datos reales de usuarios.

El archivo `supabase/seed/coach_context_jotason_rollback_draft.sql` contiene un
sketch no automatico para revision.

## 6. Que no hacer en produccion

- No ejecutar rollback sin backup.
- No ejecutar `delete` sin `where fixture_user = 'jotason'`.
- No usar el rollback para corregir datos reales.
- No tocar tablas Garmin/FIT.
- No usar claves de servicio desde cliente.
- No desactivar RLS como arreglo rapido.

## 7. Validacion despues del rollback

- `select count(*) from public.coach_athlete_profiles where fixture_user = 'jotason';`
- Repetir conteos para todas las tablas `coach_*`.
- Confirmar que `training_sessions` mantiene el mismo conteo.
- Confirmar que planned/executed mantiene el mismo conteo.
- Confirmar que Edge Functions no cambiaron.

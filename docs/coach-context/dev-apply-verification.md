# Coach Context Dev Apply Verification

Estas consultas son para ejecutar manualmente despues de aplicar la migracion en
Supabase dev. Son verificaciones de lectura.

El archivo generado equivalente vive en:

```text
docs/coach-context/generated/dev-apply-verification.sql
```

## Tablas `coach_*`

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'coach_%'
order by table_name;
```

## RLS

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename;
```

## Policies

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename, policyname;
```

## Indices

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename like 'coach_%'
order by tablename, indexname;
```

## Columnas criticas

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name like 'coach_%'
  and column_name in ('user_id', 'fixture_user', 'source_key', 'source_traceability', 'data_quality')
order by table_name, column_name;
```

## Tablas vacias antes de seed

La migracion debe crear estructura, no datos. Antes de seed, todas las tablas
`coach_*` deben tener cero filas.

```sql
select 'coach_athlete_profiles' as table_name, count(*) as rows from public.coach_athlete_profiles
union all select 'coach_athlete_training_goals', count(*) from public.coach_athlete_training_goals
union all select 'coach_athlete_constraints', count(*) from public.coach_athlete_constraints
union all select 'coach_equipment_locations', count(*) from public.coach_equipment_locations
union all select 'coach_equipment_items', count(*) from public.coach_equipment_items
union all select 'coach_context_sources', count(*) from public.coach_context_sources
union all select 'coach_context_snapshots', count(*) from public.coach_context_snapshots
union all select 'coach_session_fixtures', count(*) from public.coach_session_fixtures
union all select 'coach_session_blocks', count(*) from public.coach_session_blocks
union all select 'coach_session_exercises', count(*) from public.coach_session_exercises
union all select 'coach_seed_runs', count(*) from public.coach_seed_runs
order by table_name;
```

## Fixtures no publicos

No debe existir policy que lea fixtures por `fixture_user`.

```sql
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and tablename like 'coach_%'
  and cmd = 'SELECT'
  and coalesce(qual, '') ilike '%fixture_user%';
```

## Garmin/FIT sin cambios estructurales

Estas consultas solo leen metadatos para confirmar que las tablas no-coach
siguen fuera del alcance de esta fase.

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name = 'training_sessions'
    or table_name ilike '%garmin%'
    or table_name ilike '%fit%'
  )
order by table_name;
```


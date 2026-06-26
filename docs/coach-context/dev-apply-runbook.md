# Coach Context Dev Apply Runbook

Este runbook prepara la aplicacion controlada del schema Coach Context en un
entorno Supabase dev. No automatiza escritura en Supabase produccion.

El seed real vendra despues. En esta fase se aplica, como maximo, solo la
migracion revisada y se ejecutan verificaciones de lectura.

## Flujo

1. Preparar entorno dev.
2. Confirmar proyecto Supabase correcto.
3. Confirmar backup o snapshot.
4. Confirmar que no es produccion.
5. Revisar `supabase/migrations/20260626123654_coach_context_schema_v0.sql`.
6. Aplicar solo la migracion en dev, manualmente.
7. No aplicar seed todavia.
8. Verificar tablas `coach_*`.
9. Verificar RLS.
10. Verificar que fixtures `user_id is null` no son publicos.
11. Verificar que no se toco Garmin/FIT.
12. Documentar resultado.
13. Preparar rollback si algo falla.

## Comandos locales previos

```bash
npm run coach:supabase:dev-preflight
npm run coach:supabase:dev-verify-sql
npm test
npm run build
```

`coach:supabase:dev-preflight` no conecta a Supabase. Solo inspecciona archivos
locales.

`coach:supabase:dev-verify-sql` solo genera
`docs/coach-context/generated/dev-apply-verification.sql` con consultas
`SELECT`.

## Despues de aplicar en dev

Usar el SQL de verificacion generado para revisar:

- tablas creadas;
- RLS habilitado;
- policies;
- indices;
- columnas criticas;
- tablas vacias antes de seed;
- tablas Garmin/FIT sin cambios.

Registrar conteos y observaciones en el PR o en el documento operativo interno
antes de cualquier seed.


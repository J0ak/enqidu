# Supabase CLI Readiness for Coach Context

Esta guia prepara el entorno externo necesario para aplicar la migracion Coach
Context schema v0 en Supabase dev. No instala nada en este repo y no modifica
dependencias del proyecto.

## Principios

1. Supabase CLI debe instalarse o configurarse fuera del repo.
2. No se deben commitear tokens.
3. No se debe crear `.env` en el repo para esta fase.
4. Hay que confirmar el proyecto dev antes de aplicar nada.
5. Produccion debe quedar descartado explicitamente.
6. Hay que ejecutar `npm run coach:supabase:dev-preflight` antes de cualquier
   migracion.
7. Hay que aplicar solo `supabase/migrations/20260626123654_coach_context_schema_v0.sql`.
8. Hay que ejecutar `docs/coach-context/generated/dev-apply-verification.sql`
   despues de aplicar la migracion.
9. Hay que registrar el resultado en `docs/coach-context/dev-apply-results/`.
10. Seed queda prohibido en esta fase.

## Checklist de preparacion

- [ ] Supabase CLI disponible.
- [ ] Usuario autenticado fuera del repo.
- [ ] Proyecto dev identificado.
- [ ] Proyecto produccion descartado.
- [ ] Backup/snapshot confirmado.
- [ ] Migration target revisada.
- [ ] Seed prohibido en esta fase.

## Comandos de inspeccion permitidos

Estos comandos solo deben usarse para confirmar entorno antes de cualquier
apply:

```bash
supabase --version
supabase projects list
supabase status
```

Si cualquiera de estos comandos no esta disponible o deja dudas sobre el
proyecto destino, no aplicar la migracion.

## Secuencia segura

```bash
npm run coach:supabase:dev-preflight
npm run coach:supabase:dev-verify-sql
```

Despues, solo si dev esta confirmado y produccion descartado, aplicar la
migracion objetivo usando el flujo correcto de Supabase CLI para el proyecto
dev.

No ejecutar:

```bash
supabase db reset
supabase seed
```

No ejecutar ningun SQL de seed en esta fase.

## Registro posterior

Crear un archivo nuevo en `docs/coach-context/dev-apply-results/` con:

- fecha y hora;
- CLI disponible si/no;
- proyecto dev confirmado si/no;
- produccion descartado si/no;
- migracion aplicada si/no;
- seed ejecutado: no;
- verification SQL ejecutado si/no;
- resumen de tablas, RLS, policies, indices, columnas, funcion/triggers
  `updated_at`, tablas vacias antes de seed y Garmin/FIT untouched.

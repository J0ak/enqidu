# Next Phase: Real Supabase Seed

Esta guia describe la fase siguiente. No se ejecuta en esta PR.

## Checklist funcional

1. Revisar `supabase-target-model.md`.
2. Aprobar tablas y claves naturales.
3. Revisar la migracion `coach_context_schema_v0`.
4. Ejecutar `npm run coach:supabase:dev-preflight`.
5. Generar SQL de verificacion con `npm run coach:supabase:dev-verify-sql`.
6. Aplicar migracion solo en entorno dev.
7. Verificar tablas, RLS, policies y conteos vacios antes de seed.
8. Crear RLS antes de exponer tablas.
9. Crear seed controlado.
10. Crear rollback.
11. Probar solo en entorno dev.
12. Revisar datos insertados.
13. Conectar backend o loader.
14. Conectar Coach UI solo despues.

## Checklist de seguridad

- backup antes de seed real;
- entorno dev, no produccion;
- sin borrar datos existentes;
- RLS activado;
- rollback probado;
- logs de seed;
- control de duplicados;
- coste IA revisado antes de integracion;
- trazabilidad raw -> normalized -> Supabase;
- no mezclar Garmin/FIT con coach fixtures;
- no escribir datos fixture como usuario real sin mapping explicito;
- no usar claves de servicio en cliente;
- no usar `user_metadata` para autorizacion.

## Criterio de entrada

La fase real solo deberia empezar cuando:

- el plan dry-run sea estable;
- los tests de idempotencia pasen;
- el modelo objetivo este aprobado;
- exista una decision explicita sobre tablas fixture vs tablas compartidas;
- exista un entorno dev Supabase disponible.
- el SQL de verificacion post-migracion haya pasado en dev.


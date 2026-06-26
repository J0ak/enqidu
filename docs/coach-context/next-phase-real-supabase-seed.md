# Next Phase: Real Supabase Seed

Esta guia describe la fase siguiente. No se ejecuta en esta PR.

## Checklist funcional

1. Revisar `supabase-target-model.md`.
2. Aprobar tablas y claves naturales.
3. Crear migracion en entorno dev.
4. Crear RLS antes de exponer tablas.
5. Crear seed controlado.
6. Crear rollback.
7. Probar solo en entorno dev.
8. Revisar datos insertados.
9. Conectar backend o loader.
10. Conectar Coach UI solo despues.

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


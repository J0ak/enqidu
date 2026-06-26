# ADR-009 - Normalized fixtures as Supabase seed source

## Contexto

ENQIDU ya dispone de raw JSON versionados y normalized JSON ENQIDU
materializados para el `fixture_user` Jotason.

La siguiente capa necesita preparar persistencia Supabase sin convertir todavia
los fixtures en datos vivos ni escribir en una base real.

## Decision

Usar los normalized fixtures ENQIDU como fuente futura de seed controlado hacia
Supabase.

Esta fase genera solo inspeccion local, validacion estatica y un plan dry-run.

## Motivo

- raw JSON preservan trazabilidad historica;
- normalized JSON ofrecen un modelo generico mas estable;
- Supabase sera persistencia viva y editable despues;
- conviene separar preparacion de escritura real;
- Jotason no debe hardcodearse en runtime ni convertirse en producto.

## Consecuencias

- no hay migraciones reales;
- no hay escrituras en Supabase;
- no hay credenciales;
- no hay llamadas de red a Supabase;
- el seed real vendra en otra PR;
- Jotason sigue siendo `fixture_user`, no producto;
- cualquier dato insertable debe conservar `source_traceability`.


# Coach Context Operations

## Comandos

```bash
npm run coach:normalize
npm run coach:inspect
npm run coach:supabase:inspect
npm run coach:supabase:plan
npm run coach:supabase:seed-sql
npm run coach:supabase:dev-preflight
npm run coach:supabase:dev-verify-sql
npm test
npm run build
```

## Escritura local

`npm run coach:normalize` escribe JSON normalizados bajo
`docs/coach-context/normalized/jotason/` solo si cambian.

`npm run coach:supabase:plan` escribe
`docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json` solo
si cambia.

`npm run coach:supabase:seed-sql` escribe
`supabase/seed/coach_context_jotason_seed.generated.sql` solo si cambia. El
archivo generado es draft, no se ejecuta automaticamente y queda envuelto en
`rollback;`.

La migracion `coach_context_schema_v0` tambien es un artefacto revisable: se
commitea como SQL preparado, pero ningun comando npm la aplica.

`npm run coach:supabase:dev-verify-sql` escribe
`docs/coach-context/generated/dev-apply-verification.sql`. El archivo contiene
solo consultas `SELECT` para verificar un entorno Supabase dev despues de
aplicar manualmente la migracion.

## Solo inspeccion

`npm run coach:inspect` imprime resumen de raw y normalized fixtures.

`npm run coach:supabase:inspect` imprime resumen de entidades Supabase
derivables. No modifica archivos, no importa cliente Supabase y no hace red.

`npm run coach:supabase:dev-preflight` inspecciona archivos locales y scripts
npm relevantes. No conecta a Supabase, no aplica migraciones y no ejecuta seed.

`npm test` ejecuta tests locales.

`npm run build` compila la app sin cambiar runtime.

## Flujo completo

```text
raw JSON
-> normalized JSON
-> dry-run Supabase seed plan
-> future migration review
-> future real seed
-> future backend loader
-> future Coach UI
-> future AI contextualizada
```

## Barreras

Estos comandos no deben:

- crear migraciones;
- escribir en Supabase;
- aplicar migraciones;
- ejecutar seed real;
- automatizar escritura contra produccion;
- tocar UI;
- tocar `src/main.jsx`;
- tocar Edge Functions;
- tocar import Garmin/FIT;
- crear `.env`;
- usar credenciales.


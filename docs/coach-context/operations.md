# Coach Context Operations

## Comandos

```bash
npm run coach:normalize
npm run coach:inspect
npm run coach:supabase:inspect
npm run coach:supabase:plan
npm test
npm run build
```

## Escritura local

`npm run coach:normalize` escribe JSON normalizados bajo
`docs/coach-context/normalized/jotason/` solo si cambian.

`npm run coach:supabase:plan` escribe
`docs/coach-context/normalized/jotason/supabase-seed-plan.generated.json` solo
si cambia.

## Solo inspeccion

`npm run coach:inspect` imprime resumen de raw y normalized fixtures.

`npm run coach:supabase:inspect` imprime resumen de entidades Supabase
derivables. No modifica archivos, no importa cliente Supabase y no hace red.

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
- tocar UI;
- tocar `src/main.jsx`;
- tocar Edge Functions;
- tocar import Garmin/FIT;
- crear `.env`;
- usar credenciales.


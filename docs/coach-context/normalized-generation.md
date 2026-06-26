# Normalized Fixture Generation

Los JSON normalizados se generan desde las fuentes raw versionadas del Coach
Context.

Comandos:

```bash
npm run coach:normalize
npm run coach:inspect
```

`coach:normalize`:

- lee `docs/coach-context/source-json-manifest.json`
- carga fuentes con `status = copied`
- normaliza referencias
- normaliza sesiones
- escribe `docs/coach-context/normalized/jotason/`
- crea `normalized-manifest.json`
- es idempotente

`coach:inspect` imprime:

- numero de referencias
- numero de sesiones raw
- numero de sesiones normalizadas
- warnings
- missing fields relevantes
- listado resumido de sesiones detectadas

Los raw JSON no se mueven ni se reescriben. El directorio `normalized/` es una
materializacion ENQIDU generica derivada de esas fuentes.


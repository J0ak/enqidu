# Normalized Coach Context

Este directorio contiene JSON normalizados ENQIDU generados desde los JSON raw de
`docs/coach-context/references/` y `docs/coach-context/fixtures/`.

La carpeta `jotason/` representa un usuario fixture:

```json
{
  "fixture_user": "jotason"
}
```

Esto no es runtime productivo ni perfil vivo de usuario. Es una base versionada
para validar adapters, contratos y tests.

Archivos principales:

- `athlete-context.normalized.json`
- `equipment-inventory.normalized.json`
- `training-reference.normalized.json`
- `coach-context.normalized.json`
- `normalized-manifest.json`
- `sessions/*.normalized.json`

Regeneracion:

```bash
npm run coach:normalize
```

Inspeccion:

```bash
npm run coach:inspect
```


# #103 — Semantic Materialization & Training Normalization V1

Base verificada tras fetch: e9688fa09e0cb0f5b6e3dc870a19caa1f73c5894. Una rama, un PR; sin merge ni despliegue. Producción exclusivamente SELECT. No Python, dependencias nuevas, backfill, API OpenAI ni servicios de pago. llm_used=false; usage=null.

## Auditoría del pipeline #102

- `enqiduTools/schema.js`: vocabulario cerrado JSON Schema, sin coerción, con límites, union, objetos cerrados y UUID. Se reutiliza como único validador runtime.
- `semantics/contract.js`: operaciones cerradas, estado, preview HMAC y apply con confirmación. Conserva las 13 operaciones existentes.
- `semantics/domain.js`: patch puro, firma ligada a actor/canal/sesión/revisión/operaciones/caducidad, ownership antes del RPC service-only, readback. Antes no proyectaba en preview el UUID que SQL resolvería para add/rename; ahora consulta el catálogo persistido.
- `semantics/parser.js`: correcciones españolas ancladas de una observación, límite 600. Se reutiliza para producir hechos; el nuevo parser divide hasta 10 cláusulas en un texto de 2000 caracteres, sin interpretar lenguaje libre.
- `semantics/interpret.js`: resolvía sesión por fecha, luego un ejercicio usando catálogo JS. Ahora orquesta una materialización, una compilación y un preview #102.
- `exerciseCatalog.js`: aliases se pisaban y existía fallback `includes`. Eliminados. El adaptador de planificación conserva metadatos técnicos previos, pero códigos/nombres/aliases proceden de `catalogSeed.js` y usa el mismo resolver exacto. No autoriza escrituras.
- `progress/exerciseCatalogIdentity.js`: resolver exacto independiente. Sustituido por adaptador compartido; mantiene UUID autoritativo, sin fallback por nombre si el UUID es desconocido.
- SQL #102: única autoridad de escritura. Se mantiene locking, ownership, revisión, retry, rollback, no cambios FIT, enlaces supporting y evidencia append-only. La firma SQL incorpora un argumento opcional de evidencia; llamadas previas de 7 argumentos siguen funcionando por DEFAULT NULL. No se añade ningún RPC escritor.

## Contrato runtime

`src/training/materialization/contract.js` define `training_materialization_v1`. No representa operaciones: representa identidad, ejecución explícita, notas, confianza explícita y cláusula de procedencia. Distingue `parsed`, `resolved`, `unresolved`, `ambiguous`, `conflicting`, `missing`. Un campo de ejecución ausente significa **no mencionado**, nunca cero, borrado ni inferencia. La ausencia de carga no se traduce a bodyweight. Los null históricos siguen siendo ausencia en el contrato de lectura #102.

Ejemplo reducido:

```json
{
  "schema_version": "training_materialization_v1",
  "session_resolution": {"state":"missing","date_reference":"today"},
  "observations": [{
    "exercise":{"reported_name":"RDL","resolution_state":"parsed"},
    "execution":{"sets_completed":3,"reps_per_set":[8,8,8],"load_value":45,"load_unit":"kg"},
    "confidence":"explicit","provenance":{"clause":"RDL 3x8 con 45 kg","index":0},"state":"parsed"
  }],
  "unresolved_facts":[],"warnings":[]
}
```

## Texto → hechos → #102

1. Parse completo de cláusulas seguras (punto, punto y coma, salto de línea; un punto decimal no divide).
2. Hechos tipados, conservación del texto original y de motivos/notas literales.
3. Selección de sesión en calendario del perfil. Cero o varias sesiones: aclaración/selección explícita. Ninguna preferencia de modalidad.
4. Catálogo persistido bounded (máximo 2000 filas), resolución exacta única; validación runtime. Alias duplicado entre filas: ambiguous, nunca primero/último candidato.
5. Match al `session_exercise` de esa sesión. Repetición del mismo movimiento en varias filas exige selección. Dos cláusulas sobre el mismo target se consideran conflicting y van al editor.
6. Compilación a operaciones #102. Se conserva todo campo no mencionado. Reps iguales no generan cambio. Para normalizar una fila histórica se reutiliza `rename_exercise` con su nombre informado; SQL persiste el UUID sobre esa misma fila. Cambios de valores existentes aparecen en ANTES → DESPUÉS.
7. Un preview HMAC. La evidencia se genera en el servidor; el endpoint de preview de operaciones no acepta materialización inventada por el cliente. La firma incluye el objeto completo; alterar texto/hechos/canal/operaciones/revisión invalida apply.
8. Confirmación explícita, RPC #102 atómico, readback. El RPC revalida la resolución de catálogo de los hechos para rechazar cambios entre preview y apply.

Límites acumulados: 2000 caracteres, 10 observaciones, 30 operaciones; el límite existente de transporte de argumentos (8192 bytes) sigue aplicando. Texto no admitido → aclaración/editor; no aplicación parcial. Las notas son opacas. `set_last_reps` requiere reps previas válidas. `already_materialized` no genera preview ni evidencia duplicada.

## Catálogo: fuente de verdad y versionado

`public.exercise_catalog` es la autoridad semántica persistida. Materializador, preview, editor, Activities y Progress/Weekly leen la tabla. `catalogResolver.js` contiene el único algoritmo JS: ID exacto (sin fallback), código/nombre/alias explícito exacto tras trim, case, whitespace y acentos. Unknown no resuelve por nombre ni alias. El writer usa el equivalente SQL probado contra todos los labels del seed. Lectura histórica admite filas inactivas para conservar continuidad; captura usa activas.

`catalogSeed.js` es entrada versionada para migraciones y adaptador offline de planificación, no un fallback de escritura. La migración #103 actualiza metadata con catalog_version=103 y las listas de aliases revisadas. Tests comparan DB/seed y JS/SQL. Para ampliar: aportar evidencia, decidir variante, editar seed, generar migración, probar ausencia de colisiones y equivalencia SQL. No se añaden equivalencias mediante reglas lingüísticas. Una colisión futura falla cerrada.

Ver `epic-103-corpus-audit.md` para el inventario completo, decisiones ES/EN y cobertura simulada. No se modifican filas históricas durante la migración. El alias legado genérico «remo» sigue siendo una limitación heredada; no se amplía su alcance.

## Provenance y consumidores

`training_sources.original_json` conserva texto original, hechos y operaciones. El evento append-only de #102 incluye actor, canal, timestamp, before, after, receipt y materialization. El HMAC enlaza evidencia y operaciones. No se reinterpreta el mensaje en lecturas.

Activities muestra nombre canónico y «Registrado como» si difiere. Progress/Weekly usan campos estructurados y catálogo exacto; omisiones y Unknown quedan fuera de marcas. Coach dispone del mismo `get_training_semantics_v1`, del readback confirmado y del dashboard semanal que ya consume `loadProgress`.

`quality.js` clasifica complete / partial / needs_identity / needs_metrics / unresolved. El editor prioriza identidad y métricas relevantes. Progress ofrece hasta tres sesiones recientes para completar datos, con selección explícita; Activities accede directamente al editor. Se ocultan métricas inexistentes, se explican reps/carga faltantes, y cero continúa siendo un valor observado.

## Riesgos y revisión

- Gramática V1 intencionadamente acotada; frases mixtas, referencias implícitas múltiples, alias ambiguos o >30 operaciones requieren editor. No LLM de pago.
- La mayoría del corpus sigue sin resolver: no se confunde cobertura de identidad con métricas completas.
- Variantes, side, tempo, execution_type y unidad conservan sus fronteras de comparabilidad. Identidad común no autoriza fusionar variantes.
- Rollout futuro debe coordinar migración y función Edge. Este PR no lo ejecuta. La migración mantiene llamadas antiguas de 7 argumentos, pero la nueva evidencia requiere la migración instalada.
- Vercel deploymentEnabled=false para esta rama antes del push; no se lanza ningún deploy.

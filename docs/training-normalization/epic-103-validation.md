# #103 — Validación

Entorno de validación: Node 22, PostgreSQL/PGlite y Supabase local desechable.
Las únicas consultas a producción fueron SELECT para el contrato y el corpus.
No se aplicó la migración en producción, no se realizó backfill y no se llamó a OpenAI.

Los resultados definitivos, ligados al commit validado, se publican en los
[checks del PR #103](https://github.com/J0ak/enqidu/pull/103/checks).
Los contadores de tests y cualquier limitación se recogen en la entrega del PR.
Una ejecución interrumpida o una preparación local incompleta no cuenta como éxito.

Las capturas de [Progress](evidence/progress-390.png) y
[preview multi-ejercicio](evidence/materialization-preview-390.png) proceden del
golden y la prueba visual de CI del 20 de octubre, inspeccionados a 390 px.

## Matriz de aceptación

| Capa | Evidencia |
|---|---|
| Contrato y parser | `tests/training-materialization.test.mjs`: objetos cerrados, límites, múltiples ejercicios, coma decimal, kg/kg_each, reps, rondas, lado, pausa, omisión y notas literales |
| Identidad | Resolver compartido; aliases exactos, Unknown, colisiones, UUID autoritativo y variantes separadas |
| Compilación | Mismo target/sesión, campos no mencionados conservados, no-change, conflictos, repetición de identidad y selección ajena |
| Runtime | `tests/semantic-tools-runtime.test.mjs`: texto → hechos → preview firmado → confirmación; evidencia alterada rechazada; retry y aislamiento |
| PostgreSQL | `tests/semantic-corrections-postgres.test.mjs`: writer #102, catálogo DB/seed, paridad JS/SQL, rollback/stale/retry, ownership, FIT intacto y provenance |
| Progress / Weekly | Continuidad ES/EN sin escrituras históricas; carga/reps estructuradas; variantes separadas; omisiones y Unknown excluidos de marcas |
| Navegador 390 px | `e2e/semantic-corrections.spec.js`: golden de tres observaciones, confirmación, consumidores y reload; `e2e/progress.spec.js`: métricas vacías ocultas, explicación y Completar datos |
| Routing Coach | Eval de regresión: «Hazlo de 30 minutos» y «Déjalo en 30 minutos» conservan el preview de planificación; las métricas de ejercicios usan materialización |

## Comandos reproducibles

```sh
npm test
npm run test:coach-evals
npm run build
git diff --check
```

La ejecución completa de Node usa `node --test --test-concurrency=2 tests/*.test.mjs`
para limitar el consumo de memoria de los fixtures PostgreSQL.

El stack aislado se prepara siguiendo `.github/workflows/ci.yml`, incluyendo
`e2e-local/bootstrap-training-semantics.mjs`. Después:

```sh
ENQIDU_TRANSACTION_LOCAL=1 \
ENQIDU_TRANSACTION_ENV_FILE=/ruta/local/supabase.env \
npm run test:transactional-actions

ENQIDU_TRANSACTION_LOCAL=1 \
ENQIDU_TRANSACTION_ENV_FILE=/ruta/local/supabase.env \
node scripts/test-reconciliation-postgres.mjs

ENQIDU_TRANSACTION_LOCAL=1 \
ENQIDU_TRANSACTION_ENV_FILE=/ruta/local/supabase.env \
node scripts/test-semantics-postgres.mjs

npm run test:e2e -- --workers=1
```

Los scripts PostgreSQL rechazan destinos remotos y crean/eliminan una base de
prueba independiente. Los valores locales de Supabase no se incluyen en Git.

## Golden

Texto: «Hoy en press banca hice 40 kg, 10, 10 y 9. En RDL hice 3x8 con 45 kg.
No hice dead bug.»

El test comprueba tres observaciones y un único preview sin escritura previa;
press banca conserva la misma fila y cambia únicamente la última repetición;
RDL materializa 45 kg y [8,8,8]; dead bug queda omitido. Tras confirmar, todos
tienen `exercise_id`, el `training_session` y FIT permanecen intactos, y el evento
conserva texto/hechos/operaciones. Progress observa 1080 kg × reps de RDL;
Weekly y Coach consumen el mismo estado; Activities muestra el nombre canónico
tras recargar. Repetir el texto devuelve `already_materialized`.

## Límites de la evidencia

La cobertura de catálogo propuesta es una simulación sobre el corpus real
consultado, no un resultado de despliegue. Completar identidad no inventa reps
ni carga histórica. La gramática sigue siendo acotada y requiere el editor ante
datos ambiguos o fuera de los límites.

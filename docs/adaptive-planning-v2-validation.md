# #106 — Evidencias de validación

Base: `05b093ae70af9ad184a87c1161c73245f597e601`, verificada mediante fetch y de nuevo mediante fetch el 27/10/2026. Rama: `codex/106-adaptive-planning-v2`.

El expediente de arquitectura, políticas, seguridad, límites, rollout/rollback y gate de paridad está en [adaptive-planning-v2.md](adaptive-planning-v2.md).

## Comprobaciones

| Comando | Resultado |
|---|---|
| `npm run test:coach-evals` | 165 passed, 0 failed/skipped |
| `npm test` | 1.089 passed, 0 failed/skipped; CI y local |
| `npm run test:transactional-actions` | 54 passed, 0 failed/skipped; CI y local |
| `node scripts/test-reconciliation-postgres.mjs` | 43 passed, CI y local |
| `node scripts/test-semantics-postgres.mjs` | 9 passed, CI y local |
| `npm run test:mcp:oauth` | 8 passed, CI y local |
| `node scripts/test-mcp-oauth-supabase.mjs` | 14 escenarios passed, CI y local; incluye permiso PREVIEW del assessment |
| `npm run test:e2e -- --workers=1` | 55 casos ejecutados en CI: 53 passed + 2 flaky que pasaron con los reintentos existentes; detalle debajo |
| `npm run build` | Passed; aviso previo de bundle >500 kB |
| `git diff --check` | Passed |
| CI | [Implementación final `805e733`: verde](https://github.com/J0ak/enqidu/actions/runs/40387154811) · [Checks del HEAD del PR](https://github.com/J0ak/enqidu/pull/106/checks) |

No hay merge, deploy, migraciones productivas ni llamadas a modelos. Coste incremental: **0,00 €**.

## Entorno y ajustes de aceptación

CI usa Node 22, Supabase CLI del workflow y el grafo nativo de Edge Functions. Local: Node 22.14.0, PostgreSQL 17.11, Supabase CLI 2.119.0 y Chromium. Se usa el proyecto desechable `enqidu-e2e`; los scripts SQL rechazan hosts remotos. Las funciones locales se preparan con el bundler ya documentado en `playwright-e2e.md`; TLS permanece habilitado y OpenAI desactivado. El navegador usa America/Los_Angeles y los perfiles Europe/Madrid.

El daemon administrado usa `vfs`; se reutiliza el procedimiento documentado para aplanar la imagen oficial PostgreSQL conservando su configuración, sin cambiar el daemon. Se excluyen servicios locales innecesarios y se usa el bypass de proxy local existente. Reinicios del entorno no implican cambios en producción.

Las pruebas de reducción ahora usan bloques aeróbicos prescritos sólo por tiempo. Se mantienen las aserciones de persistencia, atomicidad, seguridad e historia y se añaden rechazos explícitos de fuerza/estructura no reducible. El recuento MCP incorpora el assessment PREVIEW y la indisponibilidad con confirmación. Las fixtures HTTP de Remote MCP y OAuth real cierran conexiones de loopback para evitar sockets keep-alive caducados durante validación intensiva de schemas; no se cambia el transporte productivo ni sus controles.

El primer run de PostgreSQL en CI detectó fixtures que intentaban guardar `available`, `completed` y `enriched`, rechazados por los CHECK canónicos. Se contrastó el contrato productivo mediante consulta sólo lectura; se corrigieron los fixtures y se conservaron pruebas de rechazo SQL/JS para estados no persistibles, sin relajar constraints.

La primera ejecución local transaccional sufrió un timeout al insertar un fixture mientras se recreaba Edge; su repetición pasó. La ejecución final completa pasa **54/54** sin cambiar timeouts. La batería base local completa pasa **1.089/1.089**, OAuth real **14/14** y el build también pasa.

La ejecución E2E local completa dio 51 passed y cuatro fallos de infraestructura: dos respuestas 546 del límite acumulado de CPU de Edge 1.77.1 (bundle local) y dos conexiones rechazadas al detenerse el servidor Vite reutilizado. Los cuatro casos pasaron al repetirlos con servicios locales recién arrancados, manteniendo las aserciones y límites. No se presenta ese intento local como 55 éxitos al primer intento.

El CI de `805e733` ejecutó las 55 pruebas con el grafo nativo, sin omisiones: 53 pasaron al primer intento y los goldens del editor manual #102 y de tres observaciones #103 pasaron con los reintentos ya configurados en main. Los fallos transitorios de esos intentos quedan en el log enlazado; no se han relajado permisos, reducido la batería ni alterado goldens para ocultarlos. El cierre posterior a ese SHA sólo ajusta documentación, un blanco final y la conexión del servidor OAuth de pruebas; los checks del HEAD vuelven a ejecutar todas las suites.

El E2E base de backend indisponible detectó que la nueva relectura mostraba ausencia de plan ante un fallo de red. Se corrigió el cliente para conservar el error seguro; se mantuvo intacta la aserción de que no hay fallback a escrituras legacy.

La revisión final añade una guarda para objetivo, notas y restricciones globales de sesión: pueden contener una prescripción no representada por los bloques. Incluye tres regresiones JS (también no-op) y tres rechazos SQL de comandos construidos con un snapshot auténtico. Las 104 pruebas focalizadas de dominio/acciones/Morning Coach y las suites completas posteriores pasan; los seis casos nuevos están incluidos en los recuentos finales.

## Cobertura de #106

- Cinco frases, seis resultados, sesión única/ambigua/seleccionada, lectura persistida sin tarjetas y cero writes antes de confirmar.
- Indisponibilidad con conflicto, stale/expiración, reautenticación, identidad ajena, doble confirmación y readback.
- Concurrencia PostgreSQL con conexiones independientes y barreras de locks: inserción/cambio de disponibilidad, plan fantasma, cambio de bloques, doble apply.
- Madrid con cliente en otra zona y límites DST; cero observado/missing; ausencia/rest; pasado no enlazado/missed; futuro/ejecución; dos actividades distintas y Closed Loop exacto.
- Health parcial/stale/ausente y cambio de evidencia matinal entre preview/apply.
- Duración sin bloques/no reducible; sustitución no inventada, inventario y entorno; semana sin capacidad y estados terminales.
- Remote MCP READ + PREVIEW, sin writes; siempre `llm_used=false`, `usage=null`.
- Goldens #100–#105 permanecen en las suites base/E2E. Comprobación productiva sólo lectura: dos actividades del 15/10 y cero `session_exercises.exercise_id` no nulos.

## Archivos modificados

- `docs/adaptive-planning-v2-validation.md`
- `docs/adaptive-planning-v2.md`
- `e2e-local/bootstrap-transactional-actions.mjs`
- `e2e/adaptive-planning.spec.js`
- `e2e/coach.spec.js`
- `e2e/tools-fixture.js`
- `scripts/test-mcp-oauth-supabase.mjs`
- `src/adaptivePlanning/assessment.js`
- `src/adaptivePlanning/contract.js`
- `src/adaptivePlanning/interpreter.js`
- `src/adaptivePlanning/presentation.js`
- `src/coachConversation/execute.js`
- `src/coachTools/actionPreviewView.js`
- `src/coachTools/planActions.js`
- `src/components/CoachActionPreview.jsx`
- `src/enqiduTools/actionPreview.js`
- `src/enqiduTools/actions.js`
- `src/enqiduTools/registry.js`
- `src/enqiduTools/runtime.js`
- `src/main.jsx`
- `src/services/aiCoachContextService.js`
- `supabase/functions/coach-plan-action/index.ts`
- `supabase/migrations/20261025193006_adaptive_planning_v2.sql`
- `tests/adaptive-planning-v2.test.mjs`
- `tests/coach-duration-adaptation.test.mjs`
- `tests/coach-plan-action.test.mjs`
- `tests/coach-tools-contract.test.mjs`
- `tests/coach-training-unavailability.test.mjs`
- `tests/enqidu-action-core.test.mjs`
- `tests/enqidu-mcp-remote.test.mjs`
- `tests/enqidu-mcp.test.mjs`
- `tests/enqidu-tools-runtime.test.mjs`
- `tests/fixtures/enqidu-action-db.mjs`
- `tests/support/enqiduToolsDb.mjs`
- `tests/support/remoteMcp.mjs`
- `tests/transactional-actions/adaptive-planning.test.mjs`
- `tests/transactional-actions/local-postgres.mjs`

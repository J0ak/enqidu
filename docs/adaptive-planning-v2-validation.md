# #106 — Evidencias de validación

Base: `05b093ae70af9ad184a87c1161c73245f597e601`, verificada mediante fetch y de nuevo contra GitHub el 26/10/2026. Rama: `codex/106-adaptive-planning-v2`.

Esta evidencia se completa durante la validación del PR. El expediente de arquitectura, políticas, seguridad, límites, rollout/rollback y gate de paridad está en [adaptive-planning-v2.md](adaptive-planning-v2.md).

## Comprobaciones

| Comando | Resultado |
|---|---|
| `npm run test:coach-evals` | 165 passed, 0 failed/skipped |
| `npm test` | CI: 1.086 passed, 0 failed/skipped; local final en curso |
| `npm run test:transactional-actions` | Pendiente de PostgreSQL local |
| `node scripts/test-reconciliation-postgres.mjs` | Pendiente |
| `node scripts/test-semantics-postgres.mjs` | Pendiente |
| `npm run test:mcp:oauth` | Incluido en la batería base; ejecución dedicada pendiente |
| `node scripts/test-mcp-oauth-supabase.mjs` | Pendiente |
| `npm run test:e2e -- --workers=1` | Pendiente |
| `npm run build` | Passed; aviso previo de bundle >500 kB |
| `git diff --check` | Passed |
| CI | Se adjuntará el run del SHA final |

No hay merge, deploy, migraciones productivas ni llamadas a modelos. Coste incremental: **0,00 €**.

## Entorno y ajustes de aceptación

Node 22.14.0, PostgreSQL 17.11, Supabase CLI 2.119.0 y Chromium local. Se usa el proyecto desechable `enqidu-e2e`; los scripts SQL rechazan hosts remotos. Las funciones locales se preparan con el bundler ya documentado en `playwright-e2e.md`; TLS permanece habilitado y OpenAI desactivado. El navegador usa America/Los_Angeles y los perfiles Europe/Madrid.

El daemon administrado usa `vfs`; se reutiliza el procedimiento documentado para aplanar la imagen oficial PostgreSQL conservando su configuración, sin cambiar el daemon. Se excluyen servicios locales innecesarios y se usa el bypass de proxy local existente. Reinicios del entorno no implican cambios en producción.

Las pruebas de reducción ahora usan bloques aeróbicos prescritos sólo por tiempo. Se mantienen las aserciones de persistencia, atomicidad, seguridad e historia y se añaden rechazos explícitos de fuerza/estructura no reducible. El recuento MCP incorpora el assessment PREVIEW y la indisponibilidad con confirmación. La fixture HTTP de Remote MCP cierra conexiones de loopback para evitar sockets keep-alive caducados durante validación intensiva de schemas; no se cambia el transporte productivo ni sus controles.

El primer run de PostgreSQL en CI detectó fixtures que intentaban guardar `available`, `completed` y `enriched`, rechazados por los CHECK canónicos. Se contrastó el contrato productivo mediante consulta sólo lectura; se corrigieron los fixtures y se conservaron pruebas de rechazo SQL/JS para estados no persistibles, sin relajar constraints.

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

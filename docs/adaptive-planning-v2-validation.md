# #106 — Evidencias de validación

Base: `05b093ae70af9ad184a87c1161c73245f597e601`, verificada mediante fetch y de nuevo contra GitHub el 26/10/2026. Rama: `codex/106-adaptive-planning-v2`.

El expediente de arquitectura, políticas, seguridad, límites, rollout/rollback y gate de paridad está en [adaptive-planning-v2.md](adaptive-planning-v2.md).

## Comprobaciones

| Comando | Resultado |
|---|---|
| `npm run test:coach-evals` | 165 passed, 0 failed/skipped |
| `npm test` | CI: 1.086 passed, 0 failed/skipped |
| `npm run test:transactional-actions` | CI: 51 passed, 0 failed/skipped |
| `node scripts/test-reconciliation-postgres.mjs` | 43 passed, CI y local |
| `node scripts/test-semantics-postgres.mjs` | 9 passed, CI y local |
| `npm run test:mcp:oauth` | 8 passed, CI y local |
| `node scripts/test-mcp-oauth-supabase.mjs` | CI: 14 escenarios passed, incluyendo permiso PREVIEW del assessment |
| `npm run test:e2e -- --workers=1` | CI: 55 passed en `ae9a8df`; se repite tras la guarda global de duración |
| `npm run build` | Passed; aviso previo de bundle >500 kB |
| `git diff --check` | Passed |
| CI | [Run verde de referencia](https://github.com/J0ak/enqidu/actions/runs/40385324616); validación final de la guarda global en curso |

No hay merge, deploy, migraciones productivas ni llamadas a modelos. Coste incremental: **0,00 €**.

## Entorno y ajustes de aceptación

CI usa Node 22, Supabase CLI del workflow y el grafo nativo de Edge Functions. Local: Node 22.14.0, PostgreSQL 17.11, Supabase CLI 2.119.0 y Chromium. Se usa el proyecto desechable `enqidu-e2e`; los scripts SQL rechazan hosts remotos. Las funciones locales se preparan con el bundler ya documentado en `playwright-e2e.md`; TLS permanece habilitado y OpenAI desactivado. El navegador usa America/Los_Angeles y los perfiles Europe/Madrid.

El daemon administrado usa `vfs`; se reutiliza el procedimiento documentado para aplanar la imagen oficial PostgreSQL conservando su configuración, sin cambiar el daemon. Se excluyen servicios locales innecesarios y se usa el bypass de proxy local existente. Reinicios del entorno no implican cambios en producción.

Las pruebas de reducción ahora usan bloques aeróbicos prescritos sólo por tiempo. Se mantienen las aserciones de persistencia, atomicidad, seguridad e historia y se añaden rechazos explícitos de fuerza/estructura no reducible. El recuento MCP incorpora el assessment PREVIEW y la indisponibilidad con confirmación. La fixture HTTP de Remote MCP cierra conexiones de loopback para evitar sockets keep-alive caducados durante validación intensiva de schemas; no se cambia el transporte productivo ni sus controles.

El primer run de PostgreSQL en CI detectó fixtures que intentaban guardar `available`, `completed` y `enriched`, rechazados por los CHECK canónicos. Se contrastó el contrato productivo mediante consulta sólo lectura; se corrigieron los fixtures y se conservaron pruebas de rechazo SQL/JS para estados no persistibles, sin relajar constraints.

Una ejecución local transaccional sufrió un timeout al insertar un fixture mientras se recreaba Edge; la repetición del caso pasó, y la suite completa 51/51 pasó en CI sin cambiar timeouts. La ejecución local inicial de E2E sufrió un timeout de Auth/Edge tras la interrupción del entorno; se reinició exclusivamente el runtime local. La segunda ejecución local observó respuestas 546 del límite acumulado de CPU de Edge (1.77.1, bundle local); se conservan las aserciones de errores de navegador. La batería base local quedó interrumpida; su evidencia completa es CI. Estos intentos incompletos no se presentan como éxitos.

El E2E base de backend indisponible detectó que la nueva relectura mostraba ausencia de plan ante un fallo de red. Se corrigió el cliente para conservar el error seguro; se mantuvo intacta la aserción de que no hay fallback a escrituras legacy.

La revisión final añade una guarda para objetivo, notas y restricciones globales de sesión: pueden contener una prescripción no representada por los bloques. Incluye tres regresiones JS (también no-op) y tres rechazos SQL de comandos construidos con un snapshot auténtico. Las 104 pruebas focalizadas de dominio/acciones/Morning Coach pasan; CI repite todas las suites.

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

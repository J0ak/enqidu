# Validación y entrega — Epic 100

Base comprobada de nuevo antes de entrega: origin/main e380741bac50c2b396ff862acdde73b89312cf50. Rama epic/100-canonical-training-reconciliation.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| npm test, Node 22 | 716/716, sin skips |
| npm run test:coach-evals | 27/27 |
| npm run test:transactional-actions, PostgreSQL real local | 33/33 |
| node scripts/test-reconciliation-postgres.mjs, PostgreSQL real local | 21/21, incluye dos conexiones y bloqueo real |
| npm run test:e2e -- --workers=1, Node 22 / Chromium | 35/35 |
| npm run build | OK; aviso habitual de bundle >500 kB |
| git diff --check | OK |
| Dry-run de snapshot productivo leído con SELECT | 17 evaluados: 1 matched, 1 ambiguous, 11 skipped, 4 already_reconciled |
| Apply y retry sólo en copia desechable | training_sessions y golden sin cambios; sin duplicación |

Se repitió una lectura read-only de producción antes de cerrar el informe: 113 sesiones, 241 bloques, 702 ejercicios y 157 enlaces de fuentes. No hubo escrituras remotas. El informe JSON contiene veredictos físicos MATCH/NO_MATCH/AMBIGUOUS y motivos de aplicación/omisión separados.

21/07: intacto, 5 bloques/21 ejercicios. 07/10: intacto, 6/14. 14/10: MATCH físico para Coach + FIT; la copia local materializa 6 bloques/14 ejercicios. Su plan sigue sin enlace automático por falta de hora prevista o referencia explícita. El 15/10 ya estaba enlazado a Fuerza; se conserva y Pilates permanece separado.

En el primer E2E completo hubo un HTTP 400 en una actualización background de get_daily_coach_operating_brief en el test Closed Loop. Las aserciones funcionales pasaron. Se inspeccionó la traza, se repitieron ese caso y el nuevo test de histórico (2/2) y después toda la suite (35/35); no se relajó ninguna aserción ni se modificó ese test. La última ejecución completa pasó sin retries de Playwright.

El entorno local usa una imagen oficial PostgreSQL compactada conservando su configuración porque Docker vfs agotaba disco al expandir capas. No cambió el motor, el almacenamiento del daemon ni la política de red. Las Edge Functions locales usan el bundler existente del repo y OpenAI deshabilitado. No hay despliegue remoto.

## Archivos

- Dominio y permisos: supabase/migrations/20261016054109_canonical_training_reconciliation_v1.sql.
- Frontend: src/main.jsx; src/services/conversationEnrichmentService.ts; src/training/activityHistory.js, lapSchema.js, plannedCalendar.js, sessionSources.js.
- Backfill y verificación: scripts/reconciliation-dry-run.mjs; scripts/test-reconciliation-postgres.mjs; scripts/sql/audit_canonical_training_reconciliation.sql.
- Regresiones: tests/activity-history.test.mjs; tests/training-reconciliation.test.mjs; tests/helpers/reconciliation-db.mjs; tests/fixtures/reconciliation-production-schema.sql; tests/supabase-privileged-rpc-grants.test.mjs.
- E2E/CI: e2e/training-history.spec.js; e2e-local/bootstrap-training-reconciliation.mjs; e2e-local/bootstrap-browser-read-contract.mjs; .github/workflows/ci.yml.
- Auditoría, diagramas, informe, rollout/rollback y este registro: docs/reconciliation/.

## Riesgos y rollout

No se interpreta texto libre ni JSON legacy arbitrario. Fuentes sin bloques compatibles se conservan para revisión. Dos sesiones físicas existentes nunca se fusionan automáticamente. Los clientes de captura legacy deben migrar antes del rollout porque se revoca EXECUTE de los dos RPC antiguos. La captura actual del detalle ya usa el nuevo contrato autenticado.

Instalar migración, publicar frontend compatible, verificar una nueva ingestión y revisar dry-run actualizado antes de aprobar cualquier backfill acotado. Para rollback, detener adaptadores y revertir eventos concretos con comparación de after-images; ediciones posteriores provocan rechazo seguro. Procedimiento completo en rollout.md.

Coste incremental confirmado: 0,00 €. No APIs de pago/OpenAI, planes, servicios, infraestructura facturable ni suscripciones añadidas. Garmin Health automático y MCP writes permanecen fuera del cambio. Sin merge ni despliegue.

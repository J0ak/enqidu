# Rollout y rollback — no ejecutados en producción

## Coste y perímetro

Sin API/LLM, plan, suscripción, cron, scheduler ni servicio adicional. Se utiliza el PostgreSQL existente. No se reactiva Garmin Health, Fitness AI transport, garmin-daily-sync ni MCP writes. Este PR no despliega ni aplica migraciones/backfill. La verificación se hace en PostgreSQL/PGlite/Supabase locales desechables.

## Rollout futuro

1. Revisar la auditoría, el SQL y el informe de dry-run. Verificar espacio/cuota existente antes del rollout; no contratar capacidad nueva.
2. Aplicar la única migración 20261016054109_canonical_training_reconciliation_v1.sql. Crea una función de dominio, helpers privados, auditoría con RLS y tres adaptadores de evento pequeños; no recorre ni modifica históricos al instalarse.
3. Verificar permisos: reconcile_training_day_v1 y rollback_training_reconciliation_v1 sólo service_role; capture_training_semantics_v1 sólo authenticated con auth.uid(), RLS y target propio. Helpers/trigger privados con search_path fijo; no SQL dinámico. La única función SECURITY DEFINER es el adaptador privado porque los usuarios no tienen UPDATE de planes y no se les otorga ese permiso.
4. Publicar frontend compatible con esa migración. Verificar una carga FIT nueva, fuente tardía, captura explícita y plan tardío con evidencia suficiente. Revisar resultados y training_reconciliation_events. Nuevos JSON semánticos deben usar blocks o sessions[0].blocks. Trainer usa semantic_role=trainer_evidence. No pasar un plan previsto como ejecución.
5. Exportar de nuevo SELECT en scripts/sql/audit_canonical_training_reconciliation.sql, guardar snapshot fuera de Git y ejecutar node scripts/reconciliation-dry-run.mjs snapshot.json report.json. Este comando sólo abre una base local en memoria y no acepta credenciales ni URL remota. Verifica apply/retry sobre la copia y compara todos los training_sessions y golden completos.
6. Tras revisión del informe actualizado, backfill limitado: llamar reconcile_training_day_v1(usuario, día, true), revisar; ejecutar false sólo para los días/usuario aprobados. Cada llamada es una transacción y serializa por atleta. No invocar lotes abiertos ni ignorar errores. Registrar el JSON devuelto y los IDs de training_reconciliation_events. Reintentar errores transitorios/deadlocks completos; nunca aplicar una parte manualmente.
7. Confirmar que 21/07 y 07/10 siguen intactos y que 14/10 añade una fuente secundaria y seis bloques/catorce ejercicios, sin modificar la fila FIT. No forzar el plan 14/10: falta anclaje. 15/10 debe seguir enlazado a Fuerza, nunca a Pilates.

## Rollback acotado

1. Detener las nuevas entradas y deshabilitar sólo reconcile_manual_source_arrival, reconcile_plan_arrival y reconcile_fit_completion durante la ventana de rollback. No parar Garmin Health ni otros servicios.
2. Con backend service_role, llamar rollback_training_reconciliation_v1(event_id) para los eventos aprobados, en orden inverso. Es idempotente. Compara las imágenes posteriores de bloques/ejercicios, el enlace de fuente y el enlace de plan. Si hay cambios posteriores, aborta: revisar explícitamente, nunca borrar a ciegas.
3. La reversión sólo elimina enlaces/filas creadas por esos eventos y restaura el enlace previo del plan. Nunca elimina training_sources, training_sessions, muestras, laps ni provenance. La auditoría se conserva con rolled_back_at.
4. Si se revierte código, mantener el esquema aditivo durante la investigación. La captura frontend anterior no debe reactivarse sin revisar su contrato legacy. No es necesario borrar la auditoría o desmontar tablas para detener el rollout.

## Límites explícitos

- No se fusionan dos sesiones físicas ya existentes. Una fuente que ya posee una sesión independiente requiere revisión.
- JSON legacy sin bloques estructurados se conserva y se reporta skipped, aunque haya correspondencia física. No se inventan nombres o cantidades a partir de texto.
- Una segunda interpretación sobre bloques existentes no se añade ni reemplaza automáticamente. Usar corrección explícita. Evidencia técnica de Trainer sí puede añadirse sin tocar ejercicios.
- La unicidad se evalúa con la evidencia disponible. Los enlaces explícitos ya persistidos se conservan; evidencia contradictoria futura exige revisión, no un auto-unlink destructivo.
- Los adaptadores automáticos cubren las entradas verificadas: fuente manual, plan y finalización wearable_activity_imports. Importadores externos de FIT que omitan ese último registro deben invocar el RPC cerrado tras persistir, no insertar descripciones como training_sessions.
- Las definiciones de los dos RPC de captura legacy se conservan, pero la migración revoca EXECUTE a todos los roles API (incluido service_role). Sus integraciones deben migrar a training_sources + reconciliador antes del rollout; no se permite que sigan creando sesiones por descripción o sustituyendo bloques fuera del reconciliador.
- Los 16 fixtures Jotason quedan sin user_id. Su migración requiere atribución y rollout separados.

El informe separa `match_status` (`MATCH`, `NO_MATCH`, `AMBIGUOUS`) de `outcome` (matched, skipped, ambiguous, already_reconciled). Por ejemplo, una fuente puede tener MATCH físico y quedar skipped por un formato semántico no soportado. `counts.candidate` cuenta todos los elementos evaluados, no sólo los aplicables.

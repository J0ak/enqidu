import { withSyncDeadline } from './garminSyncDeadline.js';
import { runMorningForOwner } from './autonomousMorningFlow.js';
import { safeSyncError } from './garminSourceBinding.js';

/** Called ONLY after scheduler authentication. The database claims the eligible identities. */
export async function runGarminSyncBatch({ serviceDb, sourceForUser, now = new Date(), observe,
  runForOwner = runMorningForOwner } = {}) {
  const { data, error } = await withSyncDeadline(() => serviceDb.rpc('claim_garmin_sync_batch'), AbortSignal.timeout(5_000));
  if (error || !Array.isArray(data) || data.length > 5 || new Set(data.map(row => row.user_id)).size !== data.length) {
    throw new Error('batch_claim_failed');
  }
  const report = { processed: 0, succeeded: 0, failed: 0, deferred: 0, error_codes: [], applied: false };
  const deadline = performance.now() + 100_000;
  for (const row of data) {
    if (performance.now() >= deadline) { report.deferred++; continue; }
    report.processed++;
    try {
      // Fresh domain and consent binding per owner. No JWT impersonation and no brief in cron response/logs.
      const signal = AbortSignal.timeout(20_000);
      const result = await withSyncDeadline(() => runForOwner({ readDb: serviceDb, serviceDb, userId: row.user_id, sourceForUser, now, days: 2, observe, signal }), signal);
      if (result.ingestion.failed || result.morning_error_code) {
        report.failed++;
        report.error_codes.push(...result.ingestion.warnings, ...(result.morning_error_code ? [result.morning_error_code] : []));
      } else report.succeeded++;
    } catch (error) { report.failed++; report.error_codes.push(safeSyncError(error)); }
  }
  report.error_codes = [...new Set(report.error_codes)];
  return report;
}

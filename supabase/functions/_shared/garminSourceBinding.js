import { withSyncDeadline } from './garminSyncDeadline.js';
import { FitnessAiGarminSource } from '../../../src/health/fitnessAiGarminSource.js';
import { FitnessAiServerTransportUnavailable } from '../../../src/health/fitnessAiServerTransport.js';
import { GARMIN_BINDING_SELECT, GARMIN_CONSENT_VERSION } from '../../../src/health/garminSyncStatus.js';
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
export const SYNC_ERROR_CODES = new Set(['connector_runtime_unavailable','consent_missing','consent_revoked','connection_unavailable',
  'binding_unverified','binding_read_unavailable','sync_authorization_changed','profile_timezone_required','sync_deadline_exceeded']);
export function safeSyncError(error) { return SYNC_ERROR_CODES.has(error?.code) ? error.code : 'morning_sync_failed'; }

export async function readGarminSourceBinding(db, userId) {
  if (typeof window !== 'undefined') fail('server_only');
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId || '')) fail('binding_read_unavailable');
  const { data, error } = await db.from('user_wearable_connections').select(GARMIN_BINDING_SELECT)
    .eq('user_id', userId).eq('provider', 'garmin').limit(1);
  if (error) fail('binding_read_unavailable');
  const row = data?.[0];
  if (!row) fail('consent_missing');
  if (row.user_id !== userId || row.provider !== 'garmin') fail('binding_unverified');
  if (row.consent_status === 'revoked' || row.revoked_at) fail('consent_revoked');
  if (row.consent_status !== 'active' || row.consent_version !== GARMIN_CONSENT_VERSION) fail('consent_missing');
  if (row.connection_status !== 'connected') fail('connection_unavailable');
  if (!row.binding_verified_at || !Number.isSafeInteger(row.binding_revision)) fail('binding_unverified');
  return Object.freeze({ ...row, provider_mode: 'aggregator', ingestion_channel: 'fitness_ai_connector' });
}

/** Server-only dependency injection. Transport receives a verified ENQIDU owner, never request credentials.
 * A future approved transport resolves its private credential reference itself for this owner + revision.
 */
export function createGarminSourceForUser({ db, transportForBinding = () => new FitnessAiServerTransportUnavailable() }) {
  return async (userId) => {
    const binding = await readGarminSourceBinding(db, userId);
    const transport = await transportForBinding(binding);
    const source = new FitnessAiGarminSource({ transport });
    return Object.freeze({ ...binding, source: {
      async getHealthRecords(request) {
        const current = await readGarminSourceBinding(db, userId);
        if (current.binding_revision !== binding.binding_revision) fail('sync_authorization_changed');
        return source.getHealthRecords(request);
      },
    } });
  };
}

/** Narrow capability facade keeps the domain's canonical persistence call intact. */
export function consentCheckedPersistence(db, binding, signal = AbortSignal.timeout(20_000)) {
  return { async rpc(name, args) {
    if (name !== 'ingest_garmin_health_record' || args.p_user_id !== binding.user_id) fail('sync_authorization_changed');
    return withSyncDeadline(() => db.rpc('ingest_owned_garmin_health_record', { ...args, p_binding_revision: binding.binding_revision }), signal);
  } };
}

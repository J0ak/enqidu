export const GARMIN_CONSENT_VERSION = 'garmin_daily_v1';
export const GARMIN_BINDING_SELECT = 'user_id,provider,connection_status,consent_status,consent_version,connected_at,revoked_at,binding_verified_at,binding_revision';
export async function loadGarminSyncStatus(db, userId) {
  const base = { sync_enabled: false, consent_status: 'not_configured', connection_status: 'not_configured',
    runtime_available: false, scheduler_status: 'blocked_runtime' };
  try {
    const response = await db.from('user_wearable_connections').select(GARMIN_BINDING_SELECT).eq('user_id', userId).eq('provider', 'garmin').limit(1);
    if (response.error) return { ...base, consent_status: 'error', connection_status: 'error' };
    const row = response.data?.[0];
    if (!row) return base;
    if (row.user_id !== userId || row.provider !== 'garmin') return { ...base, consent_status: 'error', connection_status: 'error' };
    return { ...base, sync_enabled: row.consent_status === 'active' && row.consent_version === GARMIN_CONSENT_VERSION,
      consent_status: row.consent_status, connection_status: row.connection_status };
  } catch { return { ...base, consent_status: 'error', connection_status: 'error' }; }
}

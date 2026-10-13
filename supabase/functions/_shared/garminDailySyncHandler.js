import { runAutonomousMorning } from './autonomousMorningFlow.js';
import { runGarminSyncBatch } from './garminSyncBatch.js';
import { safeSyncError, readGarminSourceBinding } from './garminSourceBinding.js';

async function secretMatches(actual, expected) {
  if (!expected || expected.length < 32 || !actual || actual.length > 512) return false;
  const digest = async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** No client date, timezone, identity, provider, RPC or transport selection. */
export function createGarminDailySyncHandler({ createReadDb, createServiceDb, sourceForUser = null,
  runtimeAvailable = false, schedulerSecret = null, schedulerEnabled = false,
  days = 2, now = () => new Date(), observe } = {}) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    // Query parameters are not another identity/configuration channel.
    if (new URL(request.url).search) return json({ error: 'invalid_request' }, 400);
    try {
      const schedulerHeader = request.headers.get('X-ENQIDU-Scheduler-Secret');
      const authorization = request.headers.get('Authorization');
      let readDb;
      if (schedulerHeader !== null) {
        if (authorization || !await secretMatches(schedulerHeader, schedulerSecret)) return json({ error: 'scheduler_auth_failed' }, 401);
      } else {
        if (!authorization?.startsWith('Bearer ')) return json({ error: 'auth_required' }, 401);
        readDb = createReadDb(authorization);
        const auth = await readDb.auth.getUser();
        if (auth.error || !auth.data?.user?.id) return json({ error: 'invalid_user' }, 401);
      }
      const reader = request.body?.getReader();
      let text = '', bytes = 0;
      const decoder = new TextDecoder();
      if (reader) for (;;) {
        const chunk = await reader.read();
        if (chunk.done) { text += decoder.decode(); break; }
        bytes += chunk.value.byteLength;
        if (bytes > 1024) { await reader.cancel(); return json({ error: 'invalid_request' }, 400); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: 'invalid_request' }, 400); }
      if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) return json({ error: 'invalid_request' }, 400);
      if (readDb && sourceForUser) {
        const auth = await readDb.auth.getUser();
        if (auth.error || !auth.data?.user?.id) return json({ error: 'invalid_user' }, 401);
        await readGarminSourceBinding(readDb, auth.data.user.id);
      }
      if (!runtimeAvailable || !sourceForUser) return json({ error: 'connector_runtime_unavailable', scheduler_enabled: false }, 503);
      if (schedulerHeader !== null) {
        if (!schedulerEnabled) return json({ error: 'scheduler_disabled' }, 503);
        return json(await runGarminSyncBatch({ serviceDb: createServiceDb(), sourceForUser, now: now(), observe }));
      }
      const result = await runAutonomousMorning({ readDb, serviceDb: createServiceDb(), sourceForUser, days, now: now(), observe });
      return json(result.ingestion, result.morning_error_code || result.ingestion.failed ? 503 : 200);
    } catch (error) {
      const code = safeSyncError(error);
      return json({ error: code }, ['consent_missing','consent_revoked'].includes(code) ? 403 : 503);
    }
  };
}

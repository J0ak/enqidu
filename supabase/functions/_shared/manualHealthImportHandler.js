import { ManualHealthError, MANUAL_HEALTH_MAX_BYTES, normalizeManualHealthImport } from '../../../src/health/manualHealthImport.js';
import { validateCanonicalHealthRecord } from '../../../src/health/garminAdapter.js';

const encoder = new TextEncoder();
const stable = value => value && typeof value === 'object' ? (Array.isArray(value) ? `[${value.map(stable).join(',')}]` : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`) : JSON.stringify(value);
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(stable(value))))].map(x => x.toString(16).padStart(2, '0')).join('');
const fail = (code) => { throw new ManualHealthError(code); };
const tokenData = value => btoa(JSON.stringify(value));
async function signingKey(secret) {
  if (!secret || secret.length < 32) throw new Error('signing_unavailable');
  return crypto.subtle.importKey('raw', encoder.encode(`manual-health-v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(value, secret) {
  const data = tokenData(value);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(data)));
  return `${data}.${btoa(String.fromCharCode(...signature))}`;
}
async function verify(token, secret) {
  try {
    if (typeof token !== 'string' || token.length > 4096) fail('invalid_preview');
    const parts = token.split('.');
    if (parts.length !== 2) fail('invalid_preview');
    const bytes = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', await signingKey(secret), bytes, encoder.encode(parts[0]))) fail('invalid_preview');
    return JSON.parse(atob(parts[0]));
  } catch { fail('invalid_preview'); }
}
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) fail('invalid_request');
  let bytes = 0, text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) { text += decoder.decode(); break; }
    bytes += chunk.value.byteLength;
    if (bytes > MANUAL_HEALTH_MAX_BYTES + 4096) { await reader.cancel(); fail('payload_too_large'); }
    text += decoder.decode(chunk.value, { stream: true });
  }
  try { return JSON.parse(text); } catch { fail('invalid_json'); }
}

/** Preview is read-only and stateless. Apply reauthenticates, revalidates and
 * binds confirmation to user + payload + profile timezone + DB revision. */
export function createManualHealthImportHandler({ createReadDb, createServiceDb, signingSecret, now = () => new Date() }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'auth_required' }, 401);
    try {
      const db = createReadDb(authorization);
      const auth = await db.auth.getUser();
      const user = auth.data?.user;
      if (auth.error || !user?.id) return json({ error: 'invalid_user' }, 401);
      if (new URL(request.url).search) fail('invalid_request');
      const body = await readBody(request);
      const allowed = body?.action === 'preview_manual_health_import' ? ['action', 'payload'] : ['action', 'payload', 'confirmation', 'preview_token'];
      if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !allowed.includes(k))) fail('invalid_request');
      if (!['preview_manual_health_import', 'apply_manual_health_import'].includes(body.action)) fail('invalid_action');
      const { data: profile, error } = await db.from('profiles').select('timezone').eq('id', user.id).maybeSingle();
      if (error) throw new Error('profile_read_failed');
      const timestamp = now().toISOString();
      const record = validateCanonicalHealthRecord(normalizeManualHealthImport(body.payload, { timezone: profile?.timezone, retrievedAt: timestamp }));
      const payloadHash = await digest(body.payload);
      if (body.action === 'preview_manual_health_import') {
        const { data: current, error } = await db.from('wearable_health_imports').select('foundation_revision_hash,ingestion_channel').eq('user_id', user.id).eq('provider', 'garmin').eq('foundation_record_key', `${record.data_type}:${record.calendar_date}`).maybeSingle();
        if (error) throw new Error('revision_read_failed');
        if (current && current.ingestion_channel !== 'chatgpt_assisted_capture') fail('source_conflict');
        const token = await sign({ user: user.id, payload: payloadHash, timezone: record.timezone, profile_timezone: profile.timezone, expected: current?.foundation_revision_hash ?? null, issued: timestamp, expires: Date.parse(timestamp) + 15 * 60 * 1000 }, signingSecret);
        return json({ ok: true, preview_token: token, preview: {
          observation_date: record.calendar_date, timezone: record.timezone, family: record.data_type,
          metrics: Object.fromEntries(Object.entries(record.metrics).filter(([, value]) => value !== null)),
          missing_metrics: Object.entries(record.metrics).filter(([, value]) => value === null).map(([key]) => key),
          source_evidence: body.payload.source_evidence, provenance: record.provenance,
          replaces_existing: Boolean(current), ignored_fields: [], rejected_fields: [],
        } });
      }
      if (body.confirmation !== true) fail('confirmation_required');
      const token = await verify(body.preview_token, signingSecret);
      if (token.user !== user.id || token.payload !== payloadHash || token.timezone !== record.timezone || token.profile_timezone !== profile.timezone || token.expires < Date.parse(timestamp) || token.issued > timestamp) fail('invalid_preview');
      const { data, error: writeError } = await createServiceDb().rpc('apply_manual_health_import', {
        p_user_id: user.id, p_record: record, p_expected_revision: token.expected,
      });
      if (writeError) {
        if (writeError.code === '40001') return json({ error: 'stale_preview' }, 409);
        if (writeError.code === '22023') return json({ error: 'source_conflict' }, 409);
        throw new Error('write_failed');
      }
      if (!['inserted', 'updated', 'unchanged', 'ignored_stale'].includes(data?.status)) throw new Error('invalid_write_result');
      return json({ ok: true, result: data });
    } catch (error) {
      if (error instanceof ManualHealthError) return json({ error: error.code, rejected_fields: error.fields }, error.code === 'payload_too_large' ? 413 : 400);
      // Never echo database errors, input, auth or health data into logs/responses.
      return json({ error: 'manual_import_unavailable' }, 503);
    }
  };
}

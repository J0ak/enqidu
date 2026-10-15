import { GARMIN_MEASUREMENT_FIELDS, normalizeGarminHealthRecord, normalizeHealthTimestamp } from './garminAdapter.js';
import { validateCalendarDate, validateHealthTimezone } from './garminSource.js';

export const MANUAL_HEALTH_VERSION = 'enqidu.manual-health.v1';
export const MANUAL_HEALTH_MAX_BYTES = 16384;
export const MANUAL_HEALTH_FAMILIES = Object.freeze(['daily_health', 'sleep', 'hrv', 'stress', 'body_battery', 'heart_rate', 'spo2', 'respiration']);
export class ManualHealthError extends Error {
  constructor(code, fields = []) { super(code); this.code = code; this.fields = fields; }
}
const fail = (code, fields) => { throw new ManualHealthError(code, fields); };
function closed(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_object', [path]);
  const unknown = Object.keys(value).filter(k => !keys.includes(k));
  // Report paths only, never echo rejected values (possibly credentials).
  if (unknown.length) fail('rejected_fields', unknown.map(k => `${path}.${k.slice(0, 80)}`));
}

/** Closed scalar-only capture. No arbitrary raw object, identifiers, URLs or text. */
export function normalizeManualHealthImport(input, { timezone, retrievedAt }) {
  let nodes = 0;
  const check = (value, depth = 0) => {
    if (depth > 5 || ++nodes > 512) fail('payload_depth');
    if (value && typeof value === 'object') for (const v of Object.values(value)) check(v, depth + 1);
  };
  check(input);
  if (new TextEncoder().encode(JSON.stringify(input)).length > MANUAL_HEALTH_MAX_BYTES) fail('payload_too_large');
  closed(input, ['version', 'observation_date', 'captured_at', 'family', 'source_evidence', 'measurements'], 'payload');
  if (input.version !== MANUAL_HEALTH_VERSION) fail('unsupported_version', ['payload.version']);
  if (!MANUAL_HEALTH_FAMILIES.includes(input.family)) fail('unsupported_family', ['payload.family']);
  closed(input.source_evidence, ['kind'], 'payload.source_evidence');
  if (!['garmin_connect_visible_summary', 'garmin_user_export'].includes(input.source_evidence.kind)) fail('invalid_source_evidence', ['payload.source_evidence.kind']);
  closed(input.measurements, Object.keys(GARMIN_MEASUREMENT_FIELDS[input.family]), 'payload.measurements');
  if (!Object.keys(input.measurements).length) fail('empty_measurements', ['payload.measurements']);
  for (const [key, value] of Object.entries(input.measurements)) {
    closed(value, ['value', 'unit'], `payload.measurements.${key}`);
    if (!Object.hasOwn(value, 'value') || !Object.hasOwn(value, 'unit')) fail('invalid_measurement', [`payload.measurements.${key}`]);
  }
  try {
    if (!timezone) fail('profile_timezone_required');
    const tz = validateHealthTimezone(timezone);
    const date = validateCalendarDate(input.observation_date);
    const captured = normalizeHealthTimestamp(input.captured_at, 'captured_at', false);
    const retrieved = normalizeHealthTimestamp(retrievedAt, 'retrieved_at', false);
    const localDate = (instant) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
    if (captured > retrieved || date > localDate(captured)) fail('future_observation');
    return normalizeGarminHealthRecord({
      provider: 'garmin', provider_mode: 'assisted_capture', ingestion_channel: 'chatgpt_assisted_capture',
      data_type: input.family, calendar_date: date, timezone: tz,
      retrieved_at: retrieved, source_updated_at: captured, data_confidence: 'user_verified',
      measurements: input.measurements,
      raw: { version: MANUAL_HEALTH_VERSION, profile_timezone: timezone, source_evidence: input.source_evidence, observation_date: date, captured_at: captured },
    });
  } catch (error) {
    if (error instanceof ManualHealthError) throw error;
    fail('invalid_measurement_or_date', ['payload.measurements', 'payload.observation_date', 'payload.captured_at']);
  }
}

export const manualHealthExample = {
  version: MANUAL_HEALTH_VERSION, observation_date: '2026-10-14', captured_at: '2026-10-14T08:00:00+02:00',
  family: 'sleep', source_evidence: { kind: 'garmin_connect_visible_summary' },
  measurements: { total_duration_seconds: { value: 28800, unit: 's' }, sleep_score: { value: 80, unit: 'score' } },
};

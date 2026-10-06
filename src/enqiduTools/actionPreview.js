export const ACTION_PREVIEW_VERSION = "enqidu_action_preview_v1";
export const ACTION_PREVIEW_TTL_MS = 5 * 60 * 1000;

// Ignore generation instants, never canonical dates/revisions. These fields
// change on every health read without changing the evidence or decision.
const ephemeral = new Set(["generated_at", "generatedAt", "request_id", "now", "expires_at"]);
function canonical(value, path = []) {
  if (Array.isArray(value)) return value.map((entry) => canonical(entry, path));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value)
    .filter((key) => !ephemeral.has(key) && value[key] !== undefined
      // The query cutoff instant varies between reads. Count + linked identity
      // remain hashed; actual observations and other as_of fields stay intact.
      && !(key === "as_of" && path.slice(-3).join(".") === "hrv.field_sources.readings_count"))
    .sort().map((key) => [key, canonical(value[key], [...path, key])]));
  return value;
}

/** A standard digest for consistency, NOT an authorization token. */
export async function fingerprintEnqiduAction(prepared) {
  const payload = canonical({ version: ACTION_PREVIEW_VERSION, action: prepared.action, args: prepared.args,
    before: prepared.before, after: prepared.after, state: prepared.state, reasons: prepared.reasons });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function buildEnqiduActionPreview({ prepared, calendar = prepared?.state?.calendar, now = new Date() } = {}) {
  if (!prepared?.ok || !calendar) throw new TypeError("A prepared domain action is required");
  return {
    schema_version: ACTION_PREVIEW_VERSION, action: prepared.action,
    target: { session_ids: prepared.before.map((session) => session.id),
      dates: [...new Set([...prepared.before, ...prepared.after].map((session) => session.date))] },
    before: prepared.before, after: prepared.after, consequences: prepared.consequences,
    warnings: prepared.warnings, reasons: prepared.reasons, affected_entities: prepared.affected_entities,
    fingerprint: await fingerprintEnqiduAction(prepared),
    expires_at: new Date(new Date(now).getTime() + ACTION_PREVIEW_TTL_MS).toISOString(),
    calendar_date: calendar.date, timezone: calendar.timezone, requires_confirmation: Boolean(prepared.mutation),
  };
}

export async function validateEnqiduActionPreview({ prepared, fingerprint, expiresAt, now = new Date() } = {}) {
  const time = new Date(now).getTime();
  const expiry = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(expiry) || expiry <= time || expiry > time + ACTION_PREVIEW_TTL_MS
    || typeof fingerprint !== "string" || fingerprint !== await fingerprintEnqiduAction(prepared)) {
    return { ok: false, error: "preview_stale" };
  }
  return { ok: true };
}

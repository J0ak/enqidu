import { GarminAdapter } from "../../../src/health/garminAdapter.js";
import { validateHealthTimezone } from "../../../src/health/garminSource.js";
import { calendarDateInTimeZone, isValidCalendarDate } from "../../../src/time/userCalendar.js";
import { shiftHealthCalendarDate } from "../../../src/health/healthEvidence.js";
import { persistGarminHealthRecord } from "./garminHealthPersistence.js";

export const DAILY_FAMILIES = Object.freeze(["daily_health", "sleep", "hrv", "stress", "body_battery", "spo2", "heart_rate", "respiration"]);
export const DAILY_PROVENANCE = Object.freeze({ provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector" });
const transientCodes = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "40001", "40P01", "53300", "57P03"]);
const secretKey = /^(?:authorization|cookie|(?:access|refresh|auth|bearer)_?token|token|api_?key|(?:client_?)?secret|credentials?)$/i;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
export function ingestionErrorCode(error) {
  const cause = error?.cause || error;
  const safeCodes = ["connector_runtime_unavailable", "consent_missing", "consent_revoked", "connection_unavailable", "binding_unverified", "binding_read_unavailable", "sync_authorization_changed", "sync_deadline_exceeded"];
  if (safeCodes.includes(error?.code)) return error.code;
  if (cause?.code === "P0001") return "sync_authorization_changed";
  if (cause?.status === 429) return "source_rate_limited";
  if ([401, 403].includes(cause?.status) || ["28000", "42501"].includes(cause?.code)) return "source_auth_failed";
  if (transientCodes.has(cause?.code) || [408, 429, 500, 502, 503, 504].includes(cause?.status)) return "transient_unavailable";
  if (error instanceof TypeError || error instanceof RangeError) return "invalid_source_record";
  return ["source_limit", "provenance_rejected", "credentials_rejected", "source_date_rejected"].includes(error?.code) ? error.code : "ingestion_failed";
}
function rejectCredentials(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (secretKey.test(key)) fail("credentials_rejected");
    rejectCredentials(child);
  }
}
export function dailyWindow({ timezone, now = new Date(), days = 2 }) {
  timezone = validateHealthTimezone(timezone);
  if (!timezone) fail("profile_timezone_required");
  if (!Number.isInteger(days) || days < 1 || days > 7) fail("invalid_window");
  const to = calendarDateInTimeZone(now, timezone);
  if (!to) fail("invalid_request_time");
  return { from: shiftHealthCalendarDate(to, 1 - days), to, timezone };
}

/** Internal server capability: identity and configuration come from the authenticated wrapper.
 * Each RPC is atomic. A failed record cannot roll back another family. No raw result escapes.
 */
export async function ingestGarminDaily({ db, authenticatedUser, source, timezone, now = new Date(), days = 2,
  signal = null, attempts = 3, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), observe = () => {} } = {}) {
  if (typeof window !== "undefined") fail("server_only");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(authenticatedUser?.id || "")) fail("authenticated_context_required");
  if (!db?.rpc || !source?.getHealthRecords || !Number.isInteger(attempts) || attempts < 1 || attempts > 3) fail("invalid_server_configuration");
  const range = dailyWindow({ timezone, now, days });
  timezone = range.timezone;
  const started = performance.now();
  const requestId = crypto.randomUUID();
  const report = { schema_version: "garmin_daily_ingestion_v1", requested_from: range.from, requested_to: range.to, timezone,
    source: DAILY_PROVENANCE, records_seen: 0, retry_count: 0, inserted: 0, updated: 0, unchanged: 0, ignored_stale: 0, failed: 0,
    family_results: [], latest_available_date: null, warnings: [], request_id: requestId };
  const emit = async (phase) => { try { await observe({ request_id: requestId, phase, timestamp: new Date().toISOString(), date_from: range.from, date_to: range.to,
    records_seen: report.records_seen, inserted: report.inserted, updated: report.updated, unchanged: report.unchanged,
    ignored_stale: report.ignored_stale, failed: report.failed, retry_count: report.retry_count, error_codes: [...report.warnings], duration_ms: Math.round(performance.now() - started) }); } catch { /* telemetry cannot change persistence outcome */ } };
  const retry = async (operation) => {
    for (let attempt = 1; ; attempt++) {
      try { if (signal?.aborted) fail("sync_deadline_exceeded"); return await operation(); } catch (error) {
        if (!["transient_unavailable", "source_rate_limited"].includes(ingestionErrorCode(error)) || attempt >= attempts) throw error;
        report.retry_count++;
        warning("transient_retry");
        await sleep(100 * 2 ** (attempt - 1));
      }
    }
  };
  const warning = (code) => { if (!report.warnings.includes(code)) report.warnings.push(code); };
  await emit("start");
  const adapter = new GarminAdapter();
  for (let date = range.from; date <= range.to; date = shiftHealthCalendarDate(date, 1)) {
    const families = Object.fromEntries(DAILY_FAMILIES.map((family) => [family, { date, family, status: "no_data", inserted: 0, updated: 0, unchanged: 0, ignored_stale: 0, failed: 0 }]));
    let cursor = null;
    const cursors = new Set();
    try {
      for (let pageIndex = 0; ; pageIndex++) {
        if (pageIndex >= 4) fail("source_limit");
        // Single-day calls are required by observed live series with no calendar_date.
        const page = await retry(() => source.getHealthRecords({ from_date: date, to_date: date, timezone, cursor }));
        if (!page || !Array.isArray(page.records) || page.records.length > 100 ||
            !(page.next_cursor === null || typeof page.next_cursor === "string" && page.next_cursor.length > 0 && page.next_cursor.length <= 2000)) throw new TypeError("invalid page");
        const latest = page.source_metadata?.latest_available_date;
        if (isValidCalendarDate(latest) && latest <= range.to && (!report.latest_available_date || latest > report.latest_available_date)) report.latest_available_date = latest;
        if (page.source_metadata?.data_status === "partial") warning("source_partial");
        for (const dto of page.records) {
          if (signal?.aborted) fail("sync_deadline_exceeded");
          report.records_seen++;
          const family = Object.hasOwn(families, dto?.data_type) ? families[dto.data_type] : null;
          try {
            if (!family || Object.hasOwn(dto, "user_id") || Object.hasOwn(dto, "rpc") || Object.hasOwn(dto, "table")) throw new TypeError("invalid source scope");
            if (Object.entries(DAILY_PROVENANCE).some(([key, value]) => dto[key] !== value)) fail("provenance_rejected");
            if (dto.calendar_date !== date || dto.timezone !== timezone) fail("source_date_rejected");
            const record = adapter.normalize(dto);
            rejectCredentials(record);
            if (record.samples.some((sample) => sample.context === "activity" || sample.resolution_status === "fit_exact")) throw new TypeError("activity outside daily scope");
            const result = await retry(() => persistGarminHealthRecord({ db, authenticatedUser, record }));
            report[result.status]++;
            family[result.status]++;
            if (family.status !== "failed") family.status = "available";
            if (!report.latest_available_date || date > report.latest_available_date) report.latest_available_date = date;
          } catch (error) {
            const code = ingestionErrorCode(error);
            report.failed++; warning(code);
            if (family) { family.failed++; family.status = "failed"; family.error_code = code; }
          }
        }
        cursor = page.next_cursor;
        if (cursor === null) break;
        if (cursors.has(cursor)) fail("source_limit");
        cursors.add(cursor);
      }
    } catch (error) {
      const code = ingestionErrorCode(error); warning(code);
      // Count one failed source operation; family counters describe affected coverage, not extra records.
      report.failed++;
      for (const family of Object.values(families)) { family.status = "failed"; family.error_code = code; }
    }
    report.family_results.push(...Object.values(families));
  }
  await emit("end");
  return report;
}

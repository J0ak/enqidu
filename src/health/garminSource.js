/** Stable internal source contract. No vendor transport or SDK belongs here. */
export const GARMIN_HEALTH_DATA_TYPES = Object.freeze([
  "daily_health", "sleep", "hrv", "stress", "body_battery", "respiration",
  "spo2", "body_composition", "vendor_insight", "heart_rate",
]);

export const GARMIN_SOURCE_CHANNELS = Object.freeze({
  aggregator: "fitness_ai_connector",
  official_api: "garmin_health_api",
});

export const HEALTH_DATA_CONFIDENCE = Object.freeze([
  "reported", "user_verified", "calculated", "estimated", "ocr_unverified", "unknown",
]);

export function validateCalendarDate(value, field = "calendar_date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
    throw new TypeError(`${field} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${field} is not a valid calendar date`);
  }
  return value;
}

export function validateHealthTimezone(value, field = "timezone") {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.trim() !== value || !/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) {
    throw new TypeError(`${field} must be an explicit IANA timezone or null`);
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new RangeError(`${field} must be an IANA timezone`);
  }
}

/** Validate before transport; a request never silently uses the device timezone. */
export function validateGarminSourceRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("GarminSource request must be an object");
  }
  const from_date = validateCalendarDate(request.from_date, "from_date");
  const to_date = validateCalendarDate(request.to_date, "to_date");
  if (from_date > to_date) throw new RangeError("from_date must not follow to_date");
  if (request.timezone === undefined || request.timezone === null) {
    throw new TypeError("GarminSource request requires the athlete timezone");
  }
  const timezone = validateHealthTimezone(request.timezone);
  const cursor = request.cursor ?? null;
  if (cursor !== null && (typeof cursor !== "string" || !cursor.trim())) {
    throw new TypeError("cursor must be a nonempty opaque string or null");
  }
  return { from_date, to_date, timezone, cursor };
}

/** Interface base only: FitnessAiGarminSource/OfficialGarminSource implement this. */
export class GarminSource {
  async getHealthRecords(_request) {
    throw new Error("GarminSource.getHealthRecords must be implemented by a server-side source");
  }
}

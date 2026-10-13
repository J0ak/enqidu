import { loadGarminSyncStatus } from "./garminSyncStatus.js";
import { isValidCalendarDate } from "../time/userCalendar.js";
import { shiftHealthCalendarDate } from "./healthEvidence.js";

const families = ["daily_health", "sleep", "hrv", "stress", "body_battery", "spo2", "heart_rate", "respiration"];
/** Import ledger contains successful observations, not failed attempts. Never invent success/error timestamps. */
export async function loadHealthIngestionStatus(db, { userId, date, timezone }) {
  const result = { schema_version: "health_ingestion_status_v1", calendar_date: date, timezone,
    last_success_at: null, latest_calendar_date_seen: null, latest_available_date: null,
    families_present: [], families_missing: [...families], last_error_code: null,
    status_scope: "persisted_observations_last_seven_days", attempt_history_available: false };
  Object.assign(result, await loadGarminSyncStatus(db, userId));
  const response = await db.from("wearable_health_imports").select("user_id,observation_date,provider,provider_mode,ingestion_channel,retrieved_at,canonical_data_type:normalized_payload->>data_type")
    .eq("normalized_payload->>schema_version", "enqidu.wearable.v1").in("normalized_payload->>data_type", families)
    .eq("user_id", userId).eq("provider", "garmin").eq("provider_mode", "aggregator").eq("ingestion_channel", "fitness_ai_connector")
    .gte("observation_date", shiftHealthCalendarDate(date, -6)).lte("observation_date", date).order("observation_date", { ascending: false }).limit(57);
  if (response.error || response.data?.length > 56) { result.last_error_code = "status_read_unavailable"; return result; }
  const rows = (response.data || []).filter((row) => row.user_id === userId && isValidCalendarDate(row.observation_date));
  result.latest_calendar_date_seen = rows.map((row) => row.observation_date).sort().at(-1) || null;
  result.latest_available_date = result.latest_calendar_date_seen;
  // retrieved_at is a successful fetch watermark; RPC unchanged reconciliation advances it.
  result.last_success_at = rows.map((row) => row.retrieved_at).filter((value) => typeof value === "string" && Number.isFinite(Date.parse(value))).sort().at(-1) || null;
  result.families_present = families.filter((family) => rows.some((row) => row.observation_date === date && row.canonical_data_type === family));
  result.families_missing = families.filter((family) => !result.families_present.includes(family));
  return result;
}

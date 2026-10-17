import { calendarDateInTimeZone, isValidCalendarDate } from "../time/userCalendar.js";

export const ACTIVITY_COLUMNS = "id,user_id,title,session_kind,session_status,duration_seconds,distance_meters,started_at,local_date,created_at,source_id,external_reference,tags,session_structure";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bounded period, cursor pages, and a total order; no functional history cap. */
export async function fetchActivityPeriod(db, { userId, start, end, pageSize = 100 }) {
  if (!UUID.test(userId || "") || !isValidCalendarDate(start) || !isValidCalendarDate(end) || start > end) {
    return { data: [], error: new Error("Invalid activity scope") };
  }
  const size = Math.max(1, Math.min(500, pageSize));
  const byId = new Map();
  let cursor = null;
  for (;;) {
    let query = db.from("training_sessions").select(ACTIVITY_COLUMNS)
      .eq("user_id", userId).or("session_status.is.null,session_status.neq.archived")
      .gte("local_date", start).lte("local_date", end)
      .order("local_date", { ascending: false }).order("id", { ascending: false }).limit(size);
    if (cursor) query = query.or(`local_date.lt.${cursor.local_date},and(local_date.eq.${cursor.local_date},id.lt.${cursor.id})`);
    const result = await query;
    if (result.error) return { data: [], error: result.error };
    for (const row of result.data || []) byId.set(row.id, row);
    if (!result.data?.length || result.data.length < size) break;
    const last = result.data.at(-1);
    if (!UUID.test(last.id) || !isValidCalendarDate(last.local_date) || (cursor?.id === last.id)) return { data: [], error: new Error("Invalid history cursor") };
    cursor = last;
  }
  return { data: [...byId.values()], error: null };
}

export function athleteToday(timezone, now = new Date()) {
  const key = calendarDateInTimeZone(now, timezone || "Europe/Madrid") || calendarDateInTimeZone(now, "Europe/Madrid");
  // Date is only a civil-calendar container for the existing period widgets.
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export async function fetchActivityById(db, { id, userId }) {
  if (!UUID.test(id || "") || !UUID.test(userId || "")) return { data: [], error: new Error("Invalid activity scope") };
  return db.from("training_sessions").select(ACTIVITY_COLUMNS).eq("user_id", userId).eq("id", id)
    .or("session_status.is.null,session_status.neq.archived");
}

import { buildHealthEvidence, healthCalendarUtcBounds, healthTimestamp, shiftHealthCalendarDate } from "./healthEvidence.js";
import { calculateReadiness, READINESS_BASELINE_WINDOW_DAYS } from "./readinessV1.js";
import { calendarDateInTimeZone, isValidCalendarDate, isValidTimeZone } from "../time/userCalendar.js";

const identity = "id,user_id,calendar_date,provider,provider_mode,ingestion_channel,foundation_record_key,data_confidence,updated_at";
const selects = {
  daily: `${identity},resting_heart_rate_bpm,min_heart_rate_bpm,max_heart_rate_bpm,average_stress_level,max_stress_level,stress_qualifier,body_battery_current,body_battery_charged,body_battery_drained,spo2_avg_pct,spo2_min_pct,respiration_avg_brpm,respiration_min_brpm`,
  sleep: `${identity},sleep_start_at,sleep_end_at,total_duration_seconds,deep_sleep_seconds,light_sleep_seconds,rem_sleep_seconds,awake_seconds,sleep_score,hrv_last_night_avg_ms,hrv_last_night_5min_high_ms,resting_heart_rate_bpm,spo2_avg_pct,spo2_min_pct,respiration_avg_brpm,respiration_min_brpm`,
  hrv: `${identity},last_night_avg_ms,last_night_5min_high_ms`,
  imports: "id,user_id,observation_date,provider,provider_mode,ingestion_channel,foundation_record_key,data_confidence,updated_at,canonical_schema_version:normalized_payload->>schema_version,canonical_data_type:normalized_payload->>data_type,canonical_calendar_date:normalized_payload->>calendar_date,canonical_metrics:normalized_payload->metrics,canonical_provenance:normalized_payload->provenance",
};
const tables = { daily: "wearable_health_daily", sleep: "wearable_sleep_sessions", hrv: "wearable_hrv_nightly_summaries" };
const importTypes = ["body_battery", "stress", "heart_rate", "respiration", "pulse_ox"];
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

function scoped(db, table, userId, calendarDate, select, dateColumn = "calendar_date") {
  return db.from(table).select(select).eq("user_id", userId).lte(dateColumn, calendarDate);
}

async function boundedHistory(db, { table, userId, calendarDate, select, dateColumn = "calendar_date", type = null }) {
  const start = shiftHealthCalendarDate(calendarDate, -READINESS_BASELINE_WINDOW_DAYS);
  const results = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = scoped(db, table, userId, calendarDate, select, dateColumn).gte(dateColumn, start).order(dateColumn, { ascending: false }).order("id", { ascending: true });
    if (type) query = query.eq("health_record_type", type).eq("normalized_payload->>schema_version", "enqidu.wearable.v1");
    const result = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (result.error) throw new Error("canonical_read_failed");
    const data = Array.isArray(result.data) ? result.data : [];
    results.push(...data);
    if (data.length < PAGE_SIZE) return results;
  }
  // A truncated source could hide conflicting observations; do not calculate from that group.
  throw new Error("canonical_history_limit");
}

async function loadGroup(db, options) {
  const recent = await boundedHistory(db, options);
  if (recent.length) return recent;
  let query = scoped(db, options.table, options.userId, options.calendarDate, options.select, options.dateColumn).order(options.dateColumn || "calendar_date", { ascending: false });
  if (options.type) query = query.eq("health_record_type", options.type).eq("normalized_payload->>schema_version", "enqidu.wearable.v1");
  const result = await query.limit(1);
  if (result.error) throw new Error("canonical_read_failed");
  if (!result.data?.length) return [];
  // Read the whole latest calendar group, not an arbitrary single legacy source.
  const day = result.data[0][options.dateColumn || "calendar_date"];
  let latest = scoped(db, options.table, options.userId, options.calendarDate, options.select, options.dateColumn).eq(options.dateColumn || "calendar_date", day).order("id", { ascending: true });
  if (options.type) latest = latest.eq("health_record_type", options.type).eq("normalized_payload->>schema_version", "enqidu.wearable.v1");
  const grouped = await latest.limit(PAGE_SIZE + 1);
  if (grouped.error || grouped.data?.length > PAGE_SIZE) throw new Error("canonical_read_failed");
  return Array.isArray(grouped.data) ? grouped.data : [];
}

/** Authenticated read model. Every query has owner and time bounds; no mutation or raw envelope. */
export async function loadHealthIntelligence(db, { userId, calendarDate, timezone, generatedAt = null } = {}) {
  if (typeof userId !== "string" || !userId.trim() || userId !== userId.trim()) throw new TypeError("An authenticated userId is required");
  if (!isValidCalendarDate(calendarDate) || !isValidTimeZone(timezone)) throw new TypeError("Valid calendarDate and athlete profile timezone are required");
  if (generatedAt !== null && healthTimestamp(generatedAt) === null) throw new TypeError("generatedAt must be an explicit ISO instant or null");
  if (generatedAt && calendarDate > calendarDateInTimeZone(generatedAt, timezone)) {
    const recovery = buildHealthEvidence({ userId, calendarDate, timezone, generatedAt, readIssues: ["future_calendar_date"] });
    recovery.readiness = calculateReadiness(recovery, [], { userId, generatedAt });
    return recovery;
  }
  const records = { daily: [], sleep: [], hrv: [], imports: [], body_battery_samples: [] };
  const issues = [];
  const jobs = [
    ...Object.entries(tables).map(([family, table]) => ({ family, options: { table, select: selects[family], userId, calendarDate } })),
    ...importTypes.map((type) => ({ family: `import_${type}`, options: { table: "wearable_health_imports", select: selects.imports, dateColumn: "observation_date", type, userId, calendarDate } })),
  ];
  const loaded = await Promise.allSettled(jobs.map((job) => loadGroup(db, job.options)));
  loaded.forEach((result, index) => {
    const family = jobs[index].family;
    if (result.status === "rejected") issues.push(`read_unavailable_${family}`);
    else if (family.startsWith("import_")) records.imports.push(...result.value);
    else records[family] = result.value;
  });
  const bounds = healthCalendarUtcBounds(calendarDate, timezone);
  try {
    let query = db.from("wearable_body_battery_samples").select("id,user_id,provider,provider_mode,ingestion_channel,foundation_record_key,recorded_at,body_battery_value").eq("user_id", userId).lt("recorded_at", bounds.end_utc);
    if (generatedAt) query = query.lte("recorded_at", generatedAt);
    const result = await query.order("recorded_at", { ascending: false }).limit(1);
    if (result.error) throw new Error("canonical_read_failed");
    records.body_battery_samples = Array.isArray(result.data) ? result.data : [];
  } catch {
    issues.push("read_unavailable_body_battery_samples");
  }
  // Exact linked sample count, never a count of unlinked/provider/day guesses.
  const selected = buildHealthEvidence({ userId, calendarDate, timezone, records, generatedAt });
  if (selected.hrv?.source?.table === "wearable_hrv_nightly_summaries" && selected.hrv.source.record_id) {
    try {
      let query = db.from("wearable_hrv_nightly_samples").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("hrv_summary_id", selected.hrv.source.record_id).gte("hrv_ms", 0).lt("recorded_at", bounds.end_utc);
      if (generatedAt) query = query.lte("recorded_at", generatedAt);
      const result = await query;
      if (result.error || !Number.isInteger(result.count) || result.count < 0) throw new Error("canonical_read_failed");
      for (const row of records.hrv) if (row.user_id === userId && row.id === selected.hrv.source.record_id) row.readings_count = result.count;
    } catch {
      issues.push("read_unavailable_hrv_readings_count");
    }
  }
  const recovery = buildHealthEvidence({ userId, calendarDate, timezone, records, generatedAt, readIssues: issues });
  const dates = [...new Set([...records.daily, ...records.sleep, ...records.hrv].filter((row) => row.user_id === userId).map((row) => row.calendar_date).concat(records.imports.filter((row) => row.user_id === userId).map((row) => row.observation_date)))].filter((date) => isValidCalendarDate(date) && date < calendarDate);
  const history = dates.sort().map((date) => {
    const day = buildHealthEvidence({ userId, calendarDate: date, timezone, records });
    const row = { user_id: userId, calendar_date: date, provenance: {}, sources: {} };
    for (const [field, family, key] of [["hrv", "hrv", "last_night_avg_ms"], ["resting_heart_rate", "heart_rate", "resting"], ["sleep_duration", "sleep", "duration_seconds"]]) {
      if (day[family]?.freshness === "current" && day[family][key] !== undefined) {
        row[field] = day[family][key];
        row.provenance[field] = day[family].field_sources?.[key]?.provenance || day[family].provenance;
        row.sources[field] = day[family].field_sources?.[key] || day[family].source;
      }
    }
    return row;
  });
  recovery.readiness = calculateReadiness(recovery, history, { userId, generatedAt });
  return recovery;
}

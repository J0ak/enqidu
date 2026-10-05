import { buildHealthEvidence } from "./healthEvidence.js";
import { calculateReadiness } from "./readinessV1.js";

const selects = {
  daily: "calendar_date,provider,provider_mode,ingestion_channel,foundation_record_key,resting_heart_rate_bpm,min_heart_rate_bpm,max_heart_rate_bpm,average_stress_level,max_stress_level,stress_qualifier,body_battery_current,body_battery_charged,body_battery_drained,spo2_avg_pct,spo2_min_pct,respiration_avg_brpm,respiration_min_brpm",
  sleep: "calendar_date,provider,provider_mode,ingestion_channel,foundation_record_key,sleep_start_at,sleep_end_at,total_duration_seconds,deep_sleep_seconds,light_sleep_seconds,rem_sleep_seconds,awake_seconds,sleep_score",
  hrv: "calendar_date,provider,provider_mode,ingestion_channel,foundation_record_key,last_night_avg_ms,last_night_5min_high_ms",
};

async function rows(db, table, userId, calendarDate, select, limit) {
  const result = await db.from(table).select(select).eq("user_id", userId).lte("calendar_date", calendarDate).order("calendar_date", { ascending: false }).limit(limit);
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

export async function loadHealthIntelligence(db, { userId, calendarDate, timezone, generatedAt = null }) {
  const [daily, sleep, hrv] = await Promise.all([
    rows(db, "wearable_health_daily", userId, calendarDate, selects.daily, 29),
    rows(db, "wearable_sleep_sessions", userId, calendarDate, selects.sleep, 29),
    rows(db, "wearable_hrv_nightly_summaries", userId, calendarDate, selects.hrv, 29),
  ]);
  const evidence = buildHealthEvidence({ calendarDate, timezone, records: { daily, sleep, hrv }, generatedAt });
  const byDate = new Map();
  for (const row of daily) byDate.set(row.calendar_date, { ...(byDate.get(row.calendar_date) || {}), resting_heart_rate: row.resting_heart_rate_bpm });
  for (const row of hrv) byDate.set(row.calendar_date, { ...(byDate.get(row.calendar_date) || {}), hrv: row.last_night_avg_ms });
  const history = [...byDate.entries()].filter(([date]) => date < calendarDate).sort(([a], [b]) => a.localeCompare(b)).map(([calendar_date, value]) => ({ calendar_date, ...value }));
  evidence.readiness = calculateReadiness(evidence, history, { generatedAt });
  return evidence;
}

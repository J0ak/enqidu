import { buildHealthEvidence } from "../../src/health/healthEvidence.js";
import { calculateReadiness } from "../../src/health/readinessV1.js";

export function coachHealthFixture({ date = "2026-09-29", sleepScore = 79, bodyBattery = 76, hrv = 47 } = {}) {
  const source = { calendar_date: date, provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector" };
  const health = buildHealthEvidence({
    calendarDate: date,
    timezone: "Europe/Madrid",
    generatedAt: `${date}T08:00:00Z`,
    records: {
      daily: [{ ...source, body_battery_current: bodyBattery, body_battery_charged: 58, body_battery_drained: 9 }],
      sleep: [{ ...source, sleep_score: sleepScore, total_duration_seconds: 27000 }],
      hrv: [{ ...source, last_night_avg_ms: hrv }],
    },
  });
  health.readiness = calculateReadiness(health, [], { generatedAt: `${date}T08:00:00Z` });
  return health;
}

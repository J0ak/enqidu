import { coachReadiness } from "../coachContext/coachHealthContext.js";
import { buildHealthTrend, dailyHealthState } from "./healthTrend.js";

export function buildDailyOperatingBrief({ morning, health, days, yesterday, postWorkout, recent, history }) {
  const readiness = coachReadiness({ health_recovery: health, request: { date: morning.date } });
  return { schema_version: "daily_coach_operating_brief_v1", date: morning.date, timezone: morning.timezone,
    response_mode: "deterministic", llm_used: false, usage: null, applied: false,
    morning, health_today: { ...dailyHealthState(health, morning.date), evidence: health },
    readiness_score: readiness.score, yesterday, trend: buildHealthTrend({ date: morning.date, days }),
    // NO_CHANGE is the existing policy's no-active-plan case. KEEP means leave that absence intact.
    decision: morning.recommendation === "NO_CHANGE" ? "KEEP" : morning.recommendation,
    post_workout: postWorkout, recent_training: recent, history };
}

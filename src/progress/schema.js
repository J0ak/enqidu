import {
  objectSchema as o,
  listSchema as l,
  textSchema as t,
  nullable as n,
} from "../enqiduTools/schema.js";
const num = { type: "number" },
  str = t(2048),
  nums = n(num),
  text = n(str),
  bool = { type: "boolean" };
const trend = {
  enum: ["improving", "stable", "declining", "insufficient_data"],
};
const summary = {
  sessions: num,
  seconds: nums,
  duration_known: num,
  modalities: l(o({ code: str, sessions: num }), 250),
  session_ids: l(str, 50000),
};
export const weeklyDashboardSchema = o({
  schema_version: { const: "weekly_dashboard_v1" }, response_mode: { const: "deterministic" }, llm_used: { const: false },
  title: str, from: str, to: str, as_of: str, timezone: str, partial_week: bool,
  activity: o({ ...summary, active_days: num, confirmed_rest_days: num }),
  planning: o({ planned: num, linked: num, modified: num, skipped: num, past_unconfirmed: num, upcoming: num, today_unconfirmed: num }),
  days: l(o({ date: str, future: bool, confirmed_rest: bool, ...summary,
    activities: l(o({ id: str, title: str, modality: str, seconds: nums }), 250) }), 7),
  time_distribution: l(o({ code: str, ...summary }), 250),
  highlights: l(o({ name: str, records: num }), 3), observed_records: num, assessment: str,
  quality: o({ status: str, duration_known: num, sessions: num, unknown_modality: num, explanation: str }),
});
export const progressDomainSchema = o({
  schema_version: { const: "progress_performance_v1" },
  status: { enum: ["available", "partial", "insufficient_data", "empty"] },
  calendar_date: str,
  timezone: str,
  period: str,
  from: text,
  to: str,
  modalities: l(str, 250),
  summary: o(summary),
  previous: o(summary),
  session_trend: trend,
  minutes_trend: trend,
  strength: l(
    o({
      key: str,
      name: str,
      unit: text,
      variant: str,
      exposures: num,
      best_load: nums,
      record_count: num,
      records: l(
        o({
          kind: { enum: ["load", "reps_at_load"] },
          value: num,
          previous: num,
          date: str,
          exercise_id: str,
          session_id: str,
        }),
        50000,
      ),
      best_reps: nums,
      best_reps_at_load: nums,
      known_volume: nums,
      best_session_volume: nums,
      volume_known: num,
      observations: num,
      trend,
      last_practice: str,
      skill: bool,
      notes: l(str, 3),
      points: l(
        o({
          exercise_id: str,
          session_id: str,
          date: str,
          load: nums,
          max_reps: nums,
          volume: nums,
        }),
        50000,
      ),
    }),
    50000,
  ),
  cardio: l(
    o({
      code: str,
      ...summary,
      distance: nums,
      distance_known: num,
      elevation: nums,
      pace_seconds_km: nums,
      pace_sessions: num,
      weeks: l(o({ from: str, partial: bool, distance: nums }), 12),
    }),
    4,
  ),
  weeks: l(o({ from: str, to: str, partial: bool, ...summary }), 12),
  active_weeks: num,
  consistency_trend: trend,
  planning: o({
    total: num,
    linked: num,
    modified: num,
    skipped: num,
    unknown: num,
    adherence: nums,
    evidence: l(
      o({
        id: str,
        session_id: text,
        status: { enum: ["linked", "modified", "skipped", "unknown"] },
      }),
      50000,
    ),
  }),
});

const compactSummary = { ...summary, session_ids: l(str, 12) };
const card = progressDomainSchema.properties.strength.items;
const compactCard = o({
  ...card.properties,
  points: l(card.properties.points.items, 12),
  records: l(card.properties.records.items, 12),
});
export const progressSchema = o({
  weekly_dashboard: n(weeklyDashboardSchema),
  ...progressDomainSchema.properties,
  summary: o(compactSummary),
  previous: o(compactSummary),
  strength: l(compactCard, 12),
  weeks: l(
    o({
      ...progressDomainSchema.properties.weeks.items.properties,
      session_ids: l(str, 12),
    }),
    12,
  ),
  cardio: l(
    o({
      ...progressDomainSchema.properties.cardio.items.properties,
      session_ids: l(str, 12),
    }),
    4,
  ),
  planning: o({
    ...progressDomainSchema.properties.planning.properties,
    evidence: l(
      progressDomainSchema.properties.planning.properties.evidence.items,
      12,
    ),
  }),
  exercise_count: num,
  exercise_page: num,
  improving_count: num,
  stable_count: num,
  observed_records: num,
  highlights: l(o({ name: str, records: num }), 3),
  evidence_scope: { const: "recent_sample_metrics_use_all_rows" },
});

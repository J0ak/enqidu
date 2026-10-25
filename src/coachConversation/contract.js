import {
  objectSchema as o,
  nullable as n,
  listSchema as l,
  textSchema as t,
  DATE_SCHEMA,
  ID_SCHEMA,
  matchesSchema,
} from "../enqiduTools/schema.js";

export const CONVERSATION_VERSION = "coach_conversation_v2";
export const CONVERSATION_INTENTS = Object.freeze([
  "training_overview",
  "exercise_progress",
  "exercise_history",
  "exercise_last_practice",
  "exercise_best_observation",
  "exercise_missing_data",
  "session_detail",
  "recent_training",
  "progress_comparison",
  "today_plan",
  "week_plan",
  "health_training",
  "readiness",
  "semantic_correction",
  "unknown",
]);
export const MAX_TOOL_CALLS = 4;
export const MAX_REFERENCE_TURNS = 8;
const code = {
  type: "string",
  pattern: "^[a-z0-9_]+$",
  minLength: 1,
  maxLength: 120,
};
export const PERIOD_SCHEMA = o({ from: DATE_SCHEMA, to: DATE_SCHEMA });
export const FOCUS_SCHEMA = o({
  version: { const: CONVERSATION_VERSION },
  canonical_exercise_code: n(code),
  session_id: n(ID_SCHEMA),
  session_date: n(DATE_SCHEMA),
  period: n(PERIOD_SCHEMA),
  intent: n({ enum: CONVERSATION_INTENTS }),
  comparison_basis: n({ enum: ["previous_equal_period"] }),
});
export const INTENT_SCHEMA = o({
  version: { const: CONVERSATION_VERSION },
  intent: { enum: CONVERSATION_INTENTS },
  subject: o({
    exercise_query: n(t(200)),
    canonical_code: n(code),
    session_id: n(ID_SCHEMA),
    session_selector: n(t(200)),
  }),
  temporal_scope: n(PERIOD_SCHEMA),
  comparison: n({ enum: ["previous_equal_period"] }),
  requested_metrics: l({ enum: ["reps", "load", "frequency", "quality"] }, 4),
  reference_resolution: { enum: ["explicit", "focus", "none"] },
  clarification: n({
    enum: [
      "exercise_required",
      "session_required",
      "period_required",
      "invalid_period",
      "unsupported",
    ],
  }),
  tool_plan: l(
    {
      enum: [
        "resolve_exercise_reference_v1",
        "get_exercise_progress_v1",
        "get_exercise_history_v1",
        "get_training_overview_v1",
        "get_recent_training",
        "get_training_session_detail_v2",
        "get_today_plan",
        "get_week_plan",
        "get_athlete_context",
        "get_health_status",
        "get_readiness",
      ],
    },
    MAX_TOOL_CALLS,
  ),
});
export const validConversationIntent = (value) =>
  matchesSchema(value, INTENT_SCHEMA);
export const emptyFocus = () => ({
  version: CONVERSATION_VERSION,
  canonical_exercise_code: null,
  session_id: null,
  session_date: null,
  period: null,
  intent: null,
  comparison_basis: null,
});

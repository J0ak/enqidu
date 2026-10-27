import { objectSchema as o, textSchema as t, listSchema as l, nullable as n, DATE_SCHEMA as date, ID_SCHEMA as id } from "../enqiduTools/schema.js";
export const ADAPTIVE_INPUT = o({ request: { enum: ["duration", "poor_sleep", "unavailable", "home", "overload", "remaining_week", "ambiguous"] },
  duration_minutes: { type: "integer", minimum: 0, maximum: 999 }, date_reference: { enum: ["today", "tomorrow"] }, session_id: id, planned_session_id: id,
}, ["request"]);
export const adaptiveOutput = (preview) => o({
  schema_version: { const: "adaptive_assessment_v2" }, policy_version: { const: "enqidu.adaptive.v2.0.0" },
  status: { enum: ["safe_proposal", "requires_choice", "insufficient_information", "ambiguous_request", "not_admissible", "no_change"] },
  request: ADAPTIVE_INPUT.properties.request, calendar_date: date, timezone: t(100),
  rule_ids: l(t(100), 20), reason_codes: l(t(100), 50), policy_ids: l(t(100), 20),
  selection_request: n(ADAPTIVE_INPUT),
  candidates: l(o({ id, title: t(), date, kind: { enum: ["plan", "execution"] } }), 50),
  proposal: n(o({ tool: { enum: ["preview_adapt_duration", "preview_adapt_environment", "preview_closed_loop_proposal", "preview_adapt_remaining_week", "preview_set_training_unavailability"] },
    arguments: o({ planned_session_id: id, assessment_context: { const: "morning" }, source_date: date, duration_minutes: { type: "integer", minimum: 10, maximum: 180 }, environment: { const: "home" }, session_id: id, date_reference: { enum: ["today", "tomorrow"] } }, []),
  })), preview: n(preview), change_kind: { enum: ["none", "modification", "replacement", "availability"] }, llm_used: { const: false }, usage: { type: "null" },
});

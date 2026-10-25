import { getEnqiduTool } from "../enqiduTools/registry.js";
import { matchesSchema } from "../enqiduTools/schema.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";
import { MAX_TOOL_CALLS, validConversationIntent } from "./contract.js";
const call = (tool, args = {}) => ({ tool, arguments: args });

export function validateConversationPlan(plan) {
  if (!Array.isArray(plan) || plan.length > MAX_TOOL_CALLS) return false;
  return plan.every(({ tool, arguments: args }) => {
    const definition = getEnqiduTool(tool);
    return (
      definition?.access === "read" &&
      matchesSchema(args, definition.input_schema)
    );
  });
}
/** Each invocation is a dependency stage. No input can select an arbitrary tool. */
export function planConversation(
  intent,
  { resolvedExercise = null, selectedSession = null, todayPlan = null } = {},
) {
  if (!validConversationIntent(intent))
    throw new Error("conversation_contract_violation");
  if (intent.clarification) return [];
  const period = intent.temporal_scope;
  let plan = [];
  if (intent.intent.startsWith("exercise_")) {
    if (!resolvedExercise)
      plan = [
        call("resolve_exercise_reference_v1", {
          query: intent.subject.exercise_query || intent.subject.canonical_code,
        }),
      ];
    else {
      const args = {
        canonical_code: resolvedExercise.canonical_code,
        ...period,
      };
      plan = [
        intent.intent === "exercise_last_practice" ||
        (intent.intent === "exercise_history" &&
          !intent.requested_metrics.includes("frequency"))
          ? call("get_exercise_history_v1", {
              ...args,
              limit: intent.intent === "exercise_last_practice" ? 5 : 20,
              order: "desc",
            })
          : call("get_exercise_progress_v1", args),
      ];
    }
  } else if (intent.intent === "progress_comparison") {
    const days =
      (Date.parse(period.to) - Date.parse(period.from)) / 86400000 + 1;
    plan = [
      call("get_training_overview_v1", period),
      call("get_training_overview_v1", {
        from: shift(period.from, -days),
        to: shift(period.from, -1),
      }),
    ];
  } else if (intent.intent === "training_overview")
    plan = [call("get_training_overview_v1", period)];
  else if (intent.intent === "session_detail")
    plan =
      selectedSession?.id || intent.subject.session_id
        ? [
            call("get_training_session_detail_v2", {
              session_id: selectedSession?.id || intent.subject.session_id,
            }),
          ]
        : [
            call("get_recent_training", {
              ...(period && intent.subject.session_selector !== "previous"
                ? { date: period.to }
                : {}),
              limit: 20,
            }),
          ];
  else if (intent.intent === "recent_training")
    plan = [call("get_recent_training", { limit: 5 })];
  else if (intent.intent === "today_plan")
    plan =
      todayPlan === null
        ? [call("get_today_plan")]
        : todayPlan.sessions.some((s) => s.status !== "cancelled")
          ? []
          : [call("get_athlete_context"), call("get_health_status")];
  else if (intent.intent === "health_training")
    plan = [
      call("get_today_plan"),
      call("get_athlete_context"),
      call("get_health_status"),
    ];
  else if (intent.intent === "readiness") plan = [call("get_health_status")];
  else if (intent.intent === "week_plan") plan = [call("get_week_plan")];
  if (!validateConversationPlan(plan))
    throw new Error("conversation_plan_violation");
  return plan;
}

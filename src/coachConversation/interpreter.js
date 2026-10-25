import { parseConversationLanguage } from "../localLanguage/router.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";
import { monday } from "../progress/domain.js";
import { CONVERSATION_VERSION, validConversationIntent } from "./contract.js";
import { normalizeConversationFocus } from "./referenceContext.js";

export function interpretConversation({ message, requestDate, focus: input }) {
  if (typeof message !== "string" || !message.trim() || message.length > 4000)
    throw new Error("invalid_message");
  const language = parseConversationLanguage(message, requestDate);
  const focus = normalizeConversationFocus(input);
  if (
    focus.intent?.startsWith("exercise_") &&
    !focus.canonical_exercise_code &&
    language.intent === "unknown" &&
    !language.unsafe &&
    language.legacy.intent === "unknown" &&
    /^[\p{L}0-9 _-]{1,120}$/u.test(message.trim()) &&
    !language.period
  ) {
    language.intent = focus.intent;
    language.exercise_query = message.trim();
    language.followup = true;
  }
  const follow = language.followup;
  let intent = language.intent;
  if (follow && intent === "unknown") intent = focus.intent || "unknown";
  if (
    follow &&
    language.exercise_query &&
    focus.intent?.startsWith("exercise_")
  )
    intent = focus.intent;
  // A new exercise following a quality question returns to progress unless explicitly requested.
  if (
    language.exercise_query &&
    intent === "exercise_missing_data" &&
    language.intent !== "exercise_missing_data"
  )
    intent = "exercise_progress";
  let period = language.period || (follow ? focus.period : null);
  let clarification = language.invalid ? "invalid_period" : null;
  if (
    (language.exercise_query?.length || 0) > 200 ||
    (language.session_selector?.length || 0) > 200
  ) {
    language.exercise_query = null;
    language.session_selector = null;
    clarification = "unsupported";
  }
  if (period && period.to > requestDate) {
    period = null;
    clarification = "invalid_period";
  }
  const exerciseIntent = intent.startsWith("exercise_");
  const code =
    exerciseIntent && !language.exercise_query && follow
      ? focus.canonical_exercise_code
      : null;
  if (exerciseIntent && !language.exercise_query && !code)
    clarification ||= "exercise_required";
  if (follow && intent === "unknown") clarification ||= "exercise_required";
  if (!period && !clarification) {
    if (exerciseIntent)
      period = {
        from: shift(
          requestDate,
          ["exercise_best_observation", "exercise_last_practice"].includes(
            intent,
          )
            ? -365
            : -83,
        ),
        to: requestDate,
      };
    else if (["training_overview", "progress_comparison"].includes(intent))
      period = {
        from: shift(monday(requestDate), -28),
        to: shift(monday(requestDate), -1),
      };
  }
  if (
    language.previous &&
    period &&
    intent === "exercise_last_practice" &&
    focus.session_date
  ) {
    period = { from: period.from, to: shift(focus.session_date, -1) };
    if (period.to < period.from) clarification ||= "period_required";
  } else if (language.previous && period && intent !== "session_detail") {
    const days =
      (Date.parse(period.to) - Date.parse(period.from)) / 86400000 + 1;
    period = { from: shift(period.from, -days), to: shift(period.from, -1) };
  }
  const sessionId =
    intent === "session_detail" &&
    follow &&
    !language.session_selector &&
    !language.previous
      ? focus.session_id
      : null;
  if (
    intent === "session_detail" &&
    follow &&
    !sessionId &&
    !focus.session_date
  )
    clarification ||= "session_required";
  if (
    intent === "session_detail" &&
    follow &&
    focus.session_date &&
    !language.period
  )
    period = { from: focus.session_date, to: focus.session_date };
  const result = {
    version: CONVERSATION_VERSION,
    intent,
    subject: {
      exercise_query: language.exercise_query,
      canonical_code: code,
      session_id: sessionId,
      session_selector:
        language.previous && intent === "session_detail"
          ? "previous"
          : language.session_selector,
    },
    temporal_scope: period,
    comparison: language.comparison ? "previous_equal_period" : null,
    requested_metrics: language.requested_metrics,
    reference_resolution: follow
      ? "focus"
      : language.exercise_query || language.period
        ? "explicit"
        : "none",
    clarification,
    tool_plan: [],
  };
  if (!validConversationIntent(result))
    throw new Error("conversation_contract_violation");
  return { intent: result, language, focus };
}

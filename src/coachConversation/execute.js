import { interpretConversation } from "./interpreter.js";
import { planConversation, validateConversationPlan } from "./planner.js";
import {
  CONVERSATION_VERSION,
  MAX_TOOL_CALLS,
  emptyFocus,
} from "./contract.js";
import {
  renderExercise,
  renderSession,
  renderSessions,
  renderOverview,
  visibleLabel,
} from "./renderer.js";
import { normalizeConversationText } from "../localLanguage/conversationParser.js";
import { detectCoachIntents } from "../coachContext/coachCards.js";
import { buildDeterministicCoachReply } from "../coachContext/coachDeterministicReply.js";
import { applyToolResultsToCoachContext } from "../enqiduTools/coachAdapter.js";
import { isMorningCoachRequest } from "../health/morningCoachV1.js";
import { detectPreviewConversationAction } from "../coachTools/actionPreviewView.js";
import { detectEnqiduFastPathCommand } from "../coachTools/fastPath.js";

const clarificationText = {
  exercise_required: "¿De qué ejercicio quieres que revisemos los registros?",
  session_required:
    "¿Qué actividad quieres revisar? Dime el día y, si hubo varias, cuál de ellas.",
  period_required: "¿Qué periodo quieres revisar?",
  invalid_period:
    "Necesito un periodo válido de hasta 366 días, sin fechas futuras. ¿Desde qué fecha lo revisamos?",
  unsupported:
    "Puedo revisar tus registros, pero no afirmar datos que no aparecen en ENQIDU.",
};

/** Consumer of the shared runtime only. No database, model or write capability. */
export async function executeCoachConversation({
  runtime,
  message,
  focus: input,
  observe = () => {},
}) {
  const started = performance.now();
  const requestDate = runtime.context.request_calendar_date;
  const { intent, language, focus } = interpretConversation({
    message,
    requestDate,
    focus: input,
  });
  // Existing corrections and explicit action confirmation retain authority.
  if (
    intent.intent === "semantic_correction" ||
    detectPreviewConversationAction(message) ||
    detectEnqiduFastPathCommand(message)
  )
    return null;
  const old = detectCoachIntents(message);
  if (
    isMorningCoachRequest(message) ||
    old.closedLoop ||
    (old.weeklyDashboard && !intent.intent.startsWith("exercise_"))
  )
    return null;
  if (
    intent.intent === "unknown" &&
    !intent.clarification &&
    !language.unsafe &&
    language.legacy.intent !== "unknown"
  )
    return null;
  const tools = [];
  let nextFocus = emptyFocus();
  let status = "answered";
  const execute = async (plan) => {
    if (
      !validateConversationPlan(plan) ||
      tools.length + plan.length > MAX_TOOL_CALLS
    )
      throw new Error("conversation_plan_violation");
    if (!plan.length) return [];
    tools.push(...plan.map((r) => r.tool));
    const results = await runtime.executeMany(plan);
    if (results.some((r) => !r.ok)) {
      const error = new Error("canonical_tool_unavailable");
      error.code = results.find((r) => !r.ok).error?.code;
      throw error;
    }
    return results;
  };
  let rendered;
  try {
    if (intent.clarification) {
      status = "needs_clarification";
      rendered = { answer: clarificationText[intent.clarification], cards: [] };
    } else if (intent.intent === "unknown") {
      rendered = {
        answer: language.unsafe
          ? clarificationText.unsupported
          : "Puedo revisar un ejercicio, una actividad o tu plan. Por ejemplo: «¿Cómo voy con HSPU?» o «¿Qué hice ayer?».",
        cards: [],
      };
    } else {
      let results = await execute(planConversation(intent));
      if (intent.intent.startsWith("exercise_")) {
        const resolution = results[0].data;
        if (resolution.status !== "resolved" || !resolution.exercise) {
          status = "needs_clarification";
          nextFocus = {
            ...emptyFocus(),
            intent: intent.intent,
            period: intent.temporal_scope,
          };
          rendered = {
            answer: resolution.candidates.length
              ? `¿Te refieres a ${resolution.candidates.map((e) => visibleLabel(e.display_name, "una variante del catálogo")).join(", ")}?${resolution.has_more_candidates ? " Hay más variantes; concreta el nombre." : ""}`
              : "Ese nombre no está asociado de forma inequívoca a un ejercicio del catálogo. Dime el nombre completo que aparece en tu actividad.",
            cards: [],
          };
        } else {
          results = await execute(
            planConversation(intent, { resolvedExercise: resolution.exercise }),
          );
          const data = results[0].data;
          rendered = renderExercise(intent, data);
          nextFocus = {
            ...emptyFocus(),
            canonical_exercise_code: resolution.exercise.canonical_code,
            period: intent.temporal_scope,
            intent: intent.intent,
          };
          const observations = Array.isArray(data.observations)
            ? data.observations
            : data.evidence;
          const latestDate = Array.isArray(data.observations)
            ? data.observations[0]?.date
            : data.last_practice;
          const sessionIds = [
            ...new Set(
              (observations || [])
                .filter((e) => e.date === latestDate)
                .map((e) => e.session_id),
            ),
          ];
          if (latestDate) {
            nextFocus.session_id =
              sessionIds.length === 1 ? sessionIds[0] : null;
            nextFocus.session_date = latestDate;
          }
        }
      } else if (
        ["session_detail", "recent_training"].includes(intent.intent)
      ) {
        let data = results[0].data;
        if (results[0].tool === "get_recent_training") {
          let selected =
            data.sessions.length === 1 && !data.has_more
              ? data.sessions[0]
              : null;
          const selector = intent.subject.session_selector;
          if (selector === "previous") {
            const index = data.sessions.findIndex(
              (s) => s.id === focus.session_id,
            );
            selected = index >= 0 ? data.sessions[index + 1] || null : null;
          } else if (selector) {
            const matches = data.sessions.filter(
              (s) => normalizeConversationText(s.title) === selector,
            );
            selected =
              matches.length === 1 && !data.has_more ? matches[0] : null;
          }
          if (selected && intent.intent === "session_detail") {
            results = await execute(
              planConversation(intent, { selectedSession: selected }),
            );
            data = results[0].data;
          } else {
            rendered = renderSessions(data);
            if (selector && !selected)
              rendered.answer = `No encuentro una única actividad que corresponda a esa referencia. ${rendered.answer}`;
            status = data.sessions.length ? "needs_clarification" : "answered";
            nextFocus = {
              ...emptyFocus(),
              session_date: data.date,
              intent: "session_detail",
            };
          }
        }
        if (!rendered) {
          rendered = renderSession(data);
          nextFocus = {
            ...emptyFocus(),
            session_id: data.session.id,
            session_date: data.session.date,
            intent: "session_detail",
          };
        }
      } else if (
        ["training_overview", "progress_comparison"].includes(intent.intent)
      ) {
        rendered = renderOverview(results[0].data, results[1]?.data);
        nextFocus = {
          ...emptyFocus(),
          period: intent.temporal_scope,
          intent: intent.intent,
          comparison_basis: intent.comparison,
        };
      } else {
        const todayPlan = results.find(
          (r) => r.tool === "get_today_plan",
        )?.data;
        if (intent.intent === "today_plan")
          results.push(
            ...(await execute(planConversation(intent, { todayPlan }))),
          );
        const needsRecommendation =
          ["today_plan", "health_training"].includes(intent.intent) &&
          !todayPlan.sessions.some((s) => s.status !== "cancelled");
        const context = needsRecommendation
          ? await runtime.canonicalCoachContext()
          : {};
        context.request = {
          ...(context.request || {}),
          date: requestDate,
          reference_date: requestDate,
          calendar_timezone: runtime.context.profile_timezone,
          date_source: "profile_timezone",
        };
        applyToolResultsToCoachContext(context, results);
        const prompt = {
          today_plan: old.planToday ? message : "Qué entreno hoy",
          health_training: "Cómo estoy hoy para entrenar",
          readiness: message,
          week_plan: "Qué tengo esta semana",
        }[intent.intent];
        rendered = buildDeterministicCoachReply({ message: prompt, context });
      }
    }
  } catch (error) {
    status = "unavailable";
    rendered = {
      answer:
        error.code === "output_limit_exceeded"
          ? "Hay demasiados registros para revisar ese periodo con seguridad. Prueba con un rango más corto."
          : "Ahora no puedo consultar los registros canónicos. No tengo datos verificados para responder; vuelve a intentarlo.",
      cards: [],
    };
    nextFocus =
      intent.reference_resolution === "focus" && !intent.subject.exercise_query
        ? focus
        : emptyFocus();
  }
  intent.tool_plan = tools;
  const telemetry = {
    conversation_version: CONVERSATION_VERSION,
    intent_id: intent.intent,
    tool_plan_ids: tools,
    tool_count: tools.length,
    clarification_required: status === "needs_clarification",
    response_mode: "deterministic",
    duration_ms: Math.round(performance.now() - started),
    status,
  };
  try {
    await observe(Object.freeze(telemetry));
  } catch {
    /* Telemetry cannot affect the response. */
  }
  return {
    ok: true,
    answer: rendered.answer,
    cards: rendered.cards || [],
    response_mode: "deterministic",
    llm_used: false,
    usage: null,
    request_date: requestDate,
    calendar_timezone: runtime.context.profile_timezone,
    date_source: "profile_timezone",
    conversation_version: CONVERSATION_VERSION,
    conversation_focus: nextFocus,
    conversation_status: status,
    intent_id: intent.intent,
  };
}

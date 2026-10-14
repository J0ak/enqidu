import { coachHealthFamily, coachReadiness, coachReadinessFactorReasons } from "../coachContext/coachHealthContext.js";

export const MORNING_COACH_VERSION = "morning_coach_brief_v1";
export const MORNING_POLICY_VERSION = "enqidu.morning-coach.v1.0.0";
const families = ["sleep", "hrv", "stress", "body_battery", "heart_rate", "spo2", "respiration"];

/** Pure policy over canonical reads. The returned review action is a preview request, never a write. */
export function buildMorningCoachBrief({ date, timezone, health, today, upcoming, yesterday, closedLoop = [] }) {
  const context = { request: { date }, health_recovery: health, readiness: health?.readiness };
  const current = (name) => { const value = coachHealthFamily(context, name); return value?.freshness === "current" ? value : null; };
  const present = families.filter((name) => current(name));
  const relevant = ["sleep", "hrv", "stress"];
  const healthStatus = !present.length ? health?.evidence_dates?.length ? "stale" : "absent"
    : relevant.every((name) => current(name)) && !health?.issues?.length ? "fresh" : "partial";
  const { score, readiness } = coachReadiness(context);
  const plans = (today?.sessions || []).filter((session) => session.status === "planned" && session.session_type !== "rest" && !session.linked_completed_session_id);
  const unavailable = today?.availability?.some((entry) => entry.calendar_date === date && entry.availability_status === "unavailable");
  const sleep = current("sleep");
  const stress = current("stress");
  const shortSleep = typeof sleep?.duration_seconds === "number" && sleep.duration_seconds < 21600;
  const poorSleep = typeof sleep?.sleep_score === "number" && sleep.sleep_score < 50;
  const highStress = typeof stress?.average === "number" && stress.average >= 60;
  const lowReadiness = score !== null && score < 40;
  const adverse = shortSleep || poorSleep || highStress || lowReadiness;
  const reasons = [];
  if (shortSleep) reasons.push("current_sleep_under_six_hours");
  if (poorSleep) reasons.push("current_sleep_score_under_50");
  if (highStress) reasons.push("current_stress_at_least_60");
  if (lowReadiness) reasons.push("current_readiness_under_40");
  if (healthStatus !== "fresh") reasons.push(`health_${healthStatus}`);
  const proposals = closedLoop.filter((entry) => entry.identity_match === "exact_persisted_link" &&
    ["reduce", "recovery_bias"].includes(entry.adaptation_proposal?.action) &&
    entry.adaptation_proposal.applied === false && entry.adaptation_proposal.requires_explicit_action === true);
  const candidate = proposals.length === 1 ? proposals[0] : null;
  let recommendation = "NO_CHANGE", reviewAction = null, adaptation = null;
  if (plans.length) {
    recommendation = healthStatus === "fresh" && score !== null && !adverse ? "KEEP" : "REVIEW_REQUIRED";
    if (unavailable) reasons.push("today_unavailable");
    else if (candidate) {
      adaptation = candidate.adaptation_proposal;
      recommendation = adaptation.action === "reduce" ? "REDUCE" : "RECOVERY_BIAS";
      reasons.push("existing_closed_loop_proposal", ...adaptation.reasons);
      const targets = adaptation.affected_future_sessions || [];
      const knownTarget = [...plans, ...(upcoming?.sessions || [])].find((session) => session.id === targets[0]?.id && session.planned_date === targets[0]?.planned_date && session.status === "planned");
      const targetUnavailable = [...(today?.availability || []), ...(upcoming?.availability || [])].some((entry) => entry.calendar_date === knownTarget?.planned_date && entry.availability_status === "unavailable");
      if (targetUnavailable) reasons.push("proposal_target_unavailable");
      if (targets.length === 1 && knownTarget && !targetUnavailable && candidate.executed_session?.id && !adaptation.reasons.includes("user_reported_discomfort")) {
        reviewAction = { tool: "preview_closed_loop_proposal", arguments: { session_id: candidate.executed_session.id } };
      } else recommendation = "REVIEW_REQUIRED";
    } else if (adverse && plans.length === 1 && proposals.length === 0) {
      const duration = plans[0].planned_duration_min ?? plans[0].planned_duration_max;
      if (typeof duration === "number" && duration > 10 && duration <= 180) {
        recommendation = "REDUCE";
        reviewAction = { tool: "preview_adapt_duration", arguments: { source_date: date, duration_minutes: Math.max(10, Math.floor(duration * 0.8 / 5) * 5) } };
      }
    }
    if (proposals.length > 1 || yesterday?.has_more) {
      recommendation = "REVIEW_REQUIRED"; reviewAction = null;
      reasons.push(proposals.length > 1 ? "ambiguous_closed_loop_proposals" : "yesterday_execution_truncated");
    }
    if (unavailable) recommendation = "REVIEW_REQUIRED";
  } else reasons.push("no_active_persisted_plan");
  let explanation = healthStatus === "absent" ? "No hay datos de salud disponibles."
    : healthStatus === "stale" ? "No ha llegado la salud de hoy; los datos anteriores son sólo contexto limitado."
    : healthStatus === "partial" ? "La salud de hoy está incompleta; no permite afirmar que estés recuperado."
    : "Hay datos actuales de sueño, HRV y estrés.";
  if (shortSleep || poorSleep) explanation += " El sueño registrado ha sido corto o de baja puntuación.";
  if (highStress) explanation += " El estrés registrado es alto.";
  if (recommendation === "KEEP") explanation += " Mantendría tu plan guardado.";
  else if (reviewAction?.tool === "preview_adapt_duration") explanation += ` Te propongo revisar una reducción de la sesión a ${reviewAction.arguments.duration_minutes} min.`;
  else if (reviewAction) explanation += " Hay una propuesta de reducción para revisar.";
  else if (recommendation === "REVIEW_REQUIRED") explanation += " Conviene revisar el contexto antes de adaptar la sesión.";
  else explanation += " No propongo cambios en el plan.";
  return { schema_version: MORNING_COACH_VERSION, policy_version: MORNING_POLICY_VERSION, date, timezone,
    health_status: healthStatus, readiness: readiness || null, yesterday_execution: yesterday,
    today_plan: today, upcoming_plan: upcoming, recommendation, adaptation_proposal: adaptation,
    reasons, readiness_reasons: score === null ? [] : coachReadinessFactorReasons(readiness),
    evidence_freshness: { current_families: present, missing_families: families.filter((name) => !present.includes(name)),
      evidence_dates: health?.evidence_dates || [], limited_prior_context: healthStatus === "stale" },
    action_required: reviewAction ? "REVIEW_CHANGE" : recommendation === "REVIEW_REQUIRED" ? "REVIEW_CONTEXT" : "NONE",
    review_action: reviewAction, explanation, applied: false };
}

export function morningCoachCard(brief) {
  if (!brief?.review_action) return null;
  return { id: "morning_coach_proposal", type: "adaptation_proposal", badge: "Propuesta", title: "Revisa tu sesión",
    subtitle: brief.date, summary: brief.explanation, status_label: "Pendiente de revisión", metrics: [],
    actions: [{ type: "review_morning_proposal", label: "REVISAR CAMBIO", ...brief.review_action }] };
}

export const isMorningCoachRequest = (message = "") => /(?:buenos días|buenos dias|resumen de (?:esta mañana|hoy)|morning brief|morning coach)/i.test(message);

import { RECOMMENDATION_RULES } from "../coachContext/trainingRecommendation.js";
import { DURATION_POLICY_VERSION, isPendingPlannedSession } from "../coachTools/planActions.js";
import { MORNING_POLICY_VERSION } from "../health/morningCoachV1.js";
import { READINESS_ALGORITHM_VERSION } from "../health/readinessV1.js";
import { CLOSED_LOOP_ALGORITHM_VERSION } from "../closedLoop/closedLoopAssessment.js";
import { CLOSED_LOOP_ACTION_POLICY_VERSION } from "../enqiduTools/readTools.js";

export const ADAPTIVE_VERSION = "adaptive_assessment_v2";
export const ADAPTIVE_POLICY = "enqidu.adaptive.v2.0.0";
/** Orchestration only. Existing read policies and action preparation decide
 * eligibility/prescription; this layer cannot write or manufacture evidence. */
export async function assessAdaptivePlanning({ args, domain, calendar, preview }) {
  const result = {
    schema_version: ADAPTIVE_VERSION, policy_version: ADAPTIVE_POLICY,
    status: "insufficient_information", request: args.request, calendar_date: calendar.date, timezone: calendar.timezone,
    rule_ids: [], reason_codes: [], policy_ids: [ADAPTIVE_POLICY], selection_request: null, candidates: [],
    proposal: null, preview: null, change_kind: "none", llm_used: false, usage: null,
  };
  const finish = (status, rule, reasons) => Object.assign(result, { status, rule_ids: [rule], reason_codes: reasons });
  const propose = async (tool, arguments_, policyIds = []) => {
    result.policy_ids.push(...policyIds);
    const response = await preview(tool, arguments_);
    if (!response.ok) {
      const code = response.error?.code || "canonical_read_unavailable";
      const status = ["source_plan_ambiguous", "ambiguous_proposal", "remaining_week_plan_ambiguous"].includes(code) ? "requires_choice"
        : ["duration_adaptation_unavailable", "recommendation_unavailable", "proposal_not_actionable", "proposal_not_found"].includes(code) ? "insufficient_information" : "not_admissible";
      return finish(status, "AP2.ACTION_PREFLIGHT", [code]);
    }
    result.proposal = { tool, arguments: arguments_ };
    result.preview = response.data;
    result.change_kind = tool === "preview_adapt_environment" ? "replacement" : tool === "preview_set_training_unavailability" ? "availability" : "modification";
    return finish(response.data.requires_confirmation ? "safe_proposal" : "no_change", "AP2.ACTION_PREFLIGHT", response.data.reasons);
  };
  if (args.request === "ambiguous") return finish("ambiguous_request", "AP2.BOUNDED_LANGUAGE", ["request_requires_clarification"]);
  if (args.request === "unavailable") return propose("preview_set_training_unavailability", { date_reference: args.date_reference || "today" });
  if (args.request === "remaining_week") return propose("preview_adapt_remaining_week", {});
  if (args.request === "overload") {
    // A recent list is only a selector, never evidence of execution identity.
    const recent = await domain.read("get_recent_training", { limit: 20 });
    const selected = args.session_id || (!recent.has_more && recent.sessions.length === 1 ? recent.sessions[0].id : null);
    if (!selected) {
      result.selection_request = { request: "overload" };
      result.candidates = recent.sessions.map((s) => ({ id: s.id, title: s.title || "Actividad", date: s.local_date, kind: "execution" }));
      return finish(recent.sessions.length ? "requires_choice" : "insufficient_information", "AP2.EXACT_EXECUTION", ["execution_selection_required"]);
    }
    await domain.read("get_training_session", { session_id: selected }); // fresh ownership/status check
    const { assessments } = await domain.read("get_closed_loop_assessment", { session_id: selected });
    result.policy_ids.push(CLOSED_LOOP_ALGORITHM_VERSION);
    if (assessments.length !== 1 || assessments[0].identity_match !== "exact_persisted_link"
      || assessments[0].executed_session?.id !== selected) return finish("insufficient_information", "AP2.EXACT_EXECUTION", ["exact_execution_link_required"]);
    const assessment = assessments[0];
    if (!assessment.duration_delta && !assessment.intensity_delta && !assessment.volume_delta)
      return finish("insufficient_information", "AP2.COMPARABLE_EVIDENCE", ["comparable_evidence_required"]);
    if (!["reduce", "recovery_bias"].includes(assessment.adaptation_proposal?.action))
      return finish("insufficient_information", "AP2.EXISTING_PROPOSAL", ["no_existing_reduction_policy"]);
    return propose("preview_closed_loop_proposal", { session_id: selected }, [CLOSED_LOOP_ACTION_POLICY_VERSION, DURATION_POLICY_VERSION]);
  }
  const today = await domain.read("get_today_plan", {});
  const active = today.sessions.filter((s) => !["cancelled", "canceled"].includes(s.status));
  const sessions = active.filter(isPendingPlannedSession);
  if (!active.length) return finish("insufficient_information", "AP2.PERSISTED_PLAN", ["no_persisted_plan"]);
  if (!sessions.length) return finish("not_admissible", "AP2.PENDING_PLAN", ["source_plan_not_adaptable"]);
  result.candidates = sessions.map((s) => ({ id: s.id, title: s.title || "Entrenamiento", date: s.planned_date, kind: "plan" }));
  const selected = args.planned_session_id ? sessions.find((s) => s.id === args.planned_session_id) : sessions.length === 1 ? sessions[0] : null;
  if (args.planned_session_id && !selected) return finish("not_admissible", "AP2.OWNED_SELECTION", ["source_plan_not_found"]);
  if (!selected) {
    result.selection_request = { request: args.request, ...(args.duration_minutes != null ? { duration_minutes: args.duration_minutes } : {}) };
    return finish("requires_choice", "AP2.UNIQUE_PLAN", ["source_plan_ambiguous"]);
  }
  if (selected.session_type === "rest") return finish("no_change", "AP2.PERSISTED_REST", ["persisted_rest"]);
  if (args.request === "duration") {
    if (!Number.isInteger(args.duration_minutes) || args.duration_minutes < 10 || args.duration_minutes > 180)
      return finish("not_admissible", "AP2.DURATION_BOUNDS", ["invalid_duration"]);
    return propose("preview_adapt_duration", { source_date: calendar.date, duration_minutes: args.duration_minutes, planned_session_id: selected.id }, [DURATION_POLICY_VERSION]);
  }
  if (args.request === "home") {
    if (selected.location_type === "home") return finish("no_change", "AP2.ENVIRONMENT_UNCHANGED", ["environment_unchanged"]);
    return propose("preview_adapt_environment", { source_date: calendar.date, environment: "home", planned_session_id: selected.id }, [RECOMMENDATION_RULES.algorithmVersion]);
  }
  // Self-report is a request for review, not a persisted Health measurement.
  // Reuse all authoritative Health/Daily views; never recompute readiness here.
  await domain.read("get_health_status", {});
  await domain.read("get_readiness", {});
  const morning = await domain.read("get_morning_coach_brief", {});
  await domain.read("get_daily_coach_operating_brief", {});
  result.policy_ids.push(MORNING_POLICY_VERSION, READINESS_ALGORITHM_VERSION);
  if (morning.review_action) return propose(morning.review_action.tool, { ...morning.review_action.arguments, ...(morning.review_action.tool === "preview_adapt_duration" ? { assessment_context: "morning" } : {}) }, [DURATION_POLICY_VERSION]);
  return finish("insufficient_information", "AP2.HEALTH_REVIEW", ["self_report_requires_review", ...morning.reasons]);
}

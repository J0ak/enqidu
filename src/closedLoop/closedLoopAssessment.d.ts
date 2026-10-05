export const CLOSED_LOOP_SCHEMA_VERSION: "closed_loop_assessment_v1";
export const CLOSED_LOOP_ALGORITHM_VERSION: "enqidu.closed-loop.v1.0.0";
export const ADAPTATION_PROPOSAL_SCHEMA_VERSION: "adaptation_proposal_v1";
export type Completion = "completed" | "partial" | "unknown" | "not_executed";
export type AdaptationAction = "keep" | "reduce" | "increase" | "move" | "recovery_bias" | "no_change";
export interface PlannedExercise {
  id?: string; name: string; target_sets?: number | null; target_reps?: string | null; load?: string | null;
}
export interface PlannedBlock {
  id?: string; title: string; planned_exercises?: PlannedExercise[]; planned_duration_seconds?: number | null;
}
export interface CanonicalPlannedSession {
  id: string; user_id?: string; title?: string; planned_date?: string; status?: string;
  planned_duration_min?: number | null; planned_duration_max?: number | null; planned_intensity?: string | null;
  linked_completed_session_id?: string | null; planned_session_blocks?: PlannedBlock[];
}
export interface CanonicalExecution {
  id: string; user_id?: string; title?: string; local_date?: string; duration_seconds?: number | null;
  started_at?: string | null; ended_at?: string | null; session_status?: string;
  source_type?: string | null; session_blocks?: Array<Record<string, unknown>>;
}
export interface ConfirmedFeedback {
  confirmed: true; user_id?: string | null; session_id: string;
  source: "user_confirmed" | "manual_entry" | "user_feedback" | "chatgpt_manual_pilot" | "chatgpt_session_correction";
  rpe?: number; discomfort?: boolean; completion?: "completed" | "partial" | "not_executed";
  structure_complete?: true; omitted_blocks?: string[]; evidence?: Array<Record<string, unknown>>;
}
export interface ClosedLoopFact { code: string; reason: string; [observedDetail: string]: unknown; }
export interface AdaptationProposalV1 {
  schema_version: "adaptation_proposal_v1"; algorithm_version: string; action: AdaptationAction;
  confidence: "low" | "medium" | "high"; reasons: string[];
  affected_future_sessions: Array<{ id: string | null; title: string | null; planned_date: string }>;
  requires_explicit_action: true; applied: false;
}
export interface ClosedLoopAssessmentV1 {
  schema_version: "closed_loop_assessment_v1"; algorithm_version: string; generated_at: string | null;
  calendar_date: string | null; timezone: string | null;
  planned_session: Record<string, unknown> | null; executed_session: Record<string, unknown> | null;
  identity_match: "exact_persisted_link" | "unlinked"; completion: Completion;
  duration_delta: { planned_min_seconds: number | null; planned_max_seconds: number | null; executed_seconds: number; comparison: "shorter" | "longer" | "within_range"; seconds: number; exact_target_delta_seconds: number | null; ratio: number | null } | null;
  volume_delta: Record<string, unknown> | null; block_exercise_matching: Array<Record<string, unknown>>;
  omitted_blocks: string[]; intensity_delta: Record<string, unknown> | null;
  user_feedback: Record<string, unknown> | null; health_before: Record<string, unknown> | null; health_after: Record<string, unknown> | null;
  recovery_comparison: Array<Record<string, unknown>>; evidence_used: Array<Record<string, unknown>>; missing_evidence: string[];
  assessment: { status: "available" | "insufficient_evidence"; facts: ClosedLoopFact[] };
  adaptation_proposal: AdaptationProposalV1; applied: false;
  scope_coverage?: { from_date: string; to_date: string; limit: number; truncated: boolean };
}
export interface ClosedLoopOptions {
  userId?: string | null; plannedSession?: CanonicalPlannedSession | null; executedSession?: CanonicalExecution | null;
  userFeedback?: ConfirmedFeedback | null; healthBefore?: Record<string, unknown> | null; healthAfter?: Record<string, unknown> | null;
  beforeDate?: string | null; afterDate?: string | null; futureSessions?: CanonicalPlannedSession[];
  calendarDate?: string | null; timezone?: string | null; generatedAt?: string | null; missingEvidence?: string[];
}
export function assessClosedLoop(options?: ClosedLoopOptions): ClosedLoopAssessmentV1;
export function isClosedLoopExecutionUsable(execution: CanonicalExecution | null, options?: { calendarDate?: string | null; timezone?: string | null; generatedAt?: string | null }): boolean;
export function feedbackFromSessionMetrics(metrics?: Array<Record<string, unknown>>, scope?: { sessionId?: string; userId?: string | null }): ConfirmedFeedback | null;

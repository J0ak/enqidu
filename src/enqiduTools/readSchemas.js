// Public output schemas describe the existing canonical contracts, with finite transport bounds.
// No unrestricted object or provider payload is part of the tool surface.
const str = { type: "string", maxLength: 2048 };
const num = { type: "number" };
const bool = { type: "boolean" };
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const text = nullable(str);
const number = nullable(num);
const date = { type: "string", format: "date", maxLength: 10 };
const dateOrNull = nullable(date);
const list = (items, maxItems = 100) => ({ type: "array", items, maxItems });
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const literal = (value) => ({ const: value });
const scope = { calendar_date: date, timezone: str };
const properties = (keys, type = text) => Object.fromEntries(keys.split(",").map((key) => [key, type]));

const provenance = object(properties("provider,provider_mode,ingestion_channel,data_confidence", str));
const source = object({ table: str, record_id: { anyOf: [str, num] }, foundation_record_key: str });
const lineage = object({ ...source.properties, calendar_date: date, provenance, observed_at: str, linked_summary_id: { anyOf: [str, num] }, as_of: text });
const baseline = object({ value: num, observations: number, method: str, window_days: number, minimum_observations: number, start_date: dateOrNull, end_date: dateOrNull, evidence_dates: list(date, 28), evidence: list(object({ calendar_date: date, value: num, provenance, source }, ["calendar_date", "value"]), 28) });
const factor = object({ metric: str, observed_value: num, baseline: nullable(baseline), factor_score: num, weight: num, contribution: number, evidence_date: date, provenance: nullable(provenance), source: nullable(source), reason: str, reason_code: str }, ["metric", "observed_value", "baseline", "evidence_date"]);
export const READINESS_OUTPUT_SCHEMA = object({ schema_version: literal("readiness_v1"), algorithm_version: literal("enqidu.readiness.v1.0.0"), calendar_date: dateOrNull, timezone: text, status: { enum: ["available", "partial", "unavailable"] }, score: nullable({ type: "number", minimum: 0, maximum: 100 }), confidence: { enum: ["none", "low", "medium"] }, factors: list(factor, 5), evidence_dates: list(date, 29), provenance: list(provenance, 10), generated_at: text, missing_relevant_data: list(str, 20), minimum_usable_factors: literal(2) }, ["schema_version", "algorithm_version", "status", "score", "confidence", "factors"]);

const healthMetrics = {
  sleep: { ...properties("duration_seconds,sleep_score,deep_seconds,light_seconds,rem_seconds,awake_seconds", num), ...properties("sleep_start_utc,sleep_end_utc", str) },
  hrv: { ...properties("last_night_avg_ms,last_night_5min_high_ms,readings_count", num), readings_count_method: str },
  body_battery: { ...properties("current,charged,drained", num), current_observed_at: str },
  stress: { average: num, max: num, qualifier: str },
  heart_rate: { resting: num, min: num, max: num },
  spo2: { average: num, min: num },
  respiration: { average: num, min: num },
};
const healthFamilies = Object.fromEntries(Object.entries(healthMetrics).map(([name, metrics]) => [name, object({ ...metrics, calendar_date: date, observed_date: date, freshness: { enum: ["current", "recent", "stale", "unavailable"] }, temporal_scope: { enum: ["calendar_day", "instant"] }, provenance: nullable(provenance), source, field_sources: object(Object.fromEntries(Object.keys(metrics).map((key) => [key, lineage]))), scope: { const: "sleep" } }, ["calendar_date", "source", "provenance", "temporal_scope", "field_sources"])]));
export const HEALTH_OUTPUT_SCHEMA = object({ schema_version: literal("health_recovery_v1"), ...scope, temporal_scope: literal("calendar_day"), status: { enum: ["available", "partial", "unavailable"] }, freshness: { enum: ["current", "recent", "stale", "unavailable"] }, generated_at: text, evidence_dates: list(date, 7), provenance: list(provenance, 20), missing: list({ enum: Object.keys(healthMetrics) }, 7), evidence_quality: { enum: ["complete", "partial", "unavailable"] }, issues: list(str, 40), ...healthFamilies, readiness: READINESS_OUTPUT_SCHEMA }, ["schema_version", "calendar_date", "timezone", "temporal_scope", "freshness", "provenance"]);

const volumeObservation = object({ record_id: text, target_sets: num, target_reps: num, load_kg: num, reps: num, reps_per_set: list(num, 100), sets: num, completed: bool });
const volumeProps = { planned: num, executed: num, delta: num, unit: str, scope: str, sources: list(str, 2), evidence: object({ planned: list(volumeObservation, 100), executed: list(volumeObservation, 100) }), comparison: { enum: ["lower", "higher", "equal"] } };
const volume = object(volumeProps);
const intensityProps = { planned_min_rpe: num, planned_max_rpe: num, reported_rpe: num, comparison: { enum: ["lower", "higher", "within_range"] } };
const evidence = object({ source: text, record_id: text, calendar_date: dateOrNull, provider_source: text, planned_record_id: text, metric: text, confirmation_source: text, provenance: list(provenance, 20), readiness_algorithm_version: text });
const proposal = object({ schema_version: literal("adaptation_proposal_v1"), algorithm_version: literal("enqidu.closed-loop.v1.0.0"), action: { enum: ["keep", "reduce", "increase", "move", "recovery_bias", "no_change"] }, confidence: { enum: ["low", "medium", "high"] }, reasons: list(str, 20), affected_future_sessions: list(object({ id: text, title: text, planned_date: date }, ["id", "title", "planned_date"]), 1), requires_explicit_action: literal(true), applied: literal(false) }, ["schema_version", "algorithm_version", "action", "confidence", "reasons", "affected_future_sessions", "requires_explicit_action", "applied"]);
const assessment = object({
  schema_version: literal("closed_loop_assessment_v1"), algorithm_version: literal("enqidu.closed-loop.v1.0.0"), generated_at: text, calendar_date: dateOrNull, timezone: text,
  planned_session: nullable(object({ id: text, title: text, calendar_date: dateOrNull, status: text, duration_range: nullable(object({ min_seconds: number, max_seconds: number })) })),
  executed_session: nullable(object({ id: text, title: text, linked_planned_session_id: text, calendar_date: dateOrNull, source: text, duration_seconds: number, evidence_kind: str })),
  identity_match: { enum: ["exact_persisted_link", "unlinked"] }, completion: { enum: ["completed", "partial", "unknown", "not_executed"] },
  duration_delta: nullable(object({ planned_min_seconds: number, planned_max_seconds: number, executed_seconds: num, comparison: { enum: ["shorter", "longer", "within_range"] }, seconds: num, exact_target_delta_seconds: number, ratio: number })),
  volume_delta: nullable(volume), block_exercise_matching: list(object({ planned_id: text, planned_name: text, executed_id: text, executed_name: text, status: str, exercises: list(object({ planned_name: text, executed_name: text, executed_id: text, status: str, volume_delta: nullable(volume) }), 100) }), 100),
  omitted_blocks: list(str, 100), intensity_delta: nullable(object(intensityProps)),
  user_feedback: nullable(object({ confirmed: literal(true), source: str, session_id: str, evidence: list(evidence, 100), rpe: num, discomfort: bool, completion: str, structure_complete: literal(true), omitted_blocks: list(str, 40) })),
  health_before: nullable(HEALTH_OUTPUT_SCHEMA), health_after: nullable(HEALTH_OUTPUT_SCHEMA),
  recovery_comparison: list(object({ metric: str, observed_value: num, baseline, evidence_date: date, comparison: str, causal_claim: literal(false) }), 2),
  evidence_used: list(evidence, 500), missing_evidence: list(str, 100),
  assessment: object({ status: { enum: ["available", "insufficient_evidence"] }, facts: list(object({ code: str, reason: str, observed_value: number, planned_value: number, unit: str, block: text, exercise: text, ...volumeProps, ...intensityProps, baseline_value: number, evidence_date: date }), 500) }, ["status", "facts"]),
  adaptation_proposal: proposal, applied: literal(false), scope_coverage: object({ from_date: date, to_date: date, limit: num, truncated: bool }),
}, ["schema_version", "algorithm_version", "calendar_date", "timezone", "planned_session", "executed_session", "identity_match", "completion", "assessment", "adaptation_proposal", "applied"]);

const exercise = object({ ...properties("id,name,target_reps,load,notes"), target_sets: number });
const plannedBlock = object({ ...properties("id,block_type,title,objective"), ...properties("block_order,planned_duration_seconds,planned_rounds", number), planned_exercises: list(exercise, 50) });
const plan = object({ ...properties("id,planned_date,planned_time,title,session_type,status,location_type,planned_intensity,objective,source,linked_completed_session_id"), planned_duration_min: number, planned_duration_max: number, blocks: list(plannedBlock, 250) }, ["id", "planned_date", "status", "blocks"]);
const execution = object({ ...properties("id,title,local_date,started_at,ended_at,session_status,sport,activity_type"), ...properties("duration_seconds,moving_duration_seconds,distance_meters,elevation_gain_meters,calories_total,average_heart_rate,max_heart_rate,training_load", number) }, ["id", "local_date", "session_status"]);
const availability = list(object({ calendar_date: date, availability_status: text, source: text }, ["calendar_date", "availability_status"]), 31);
const progress = object({ kind: literal("weekly_plan_progress"), from: dateOrNull, to: dateOrNull, reference_date: dateOrNull, weekly_focus: text, planned_count: num, completed_linked_count: num, upcoming_count: num, past_unlinked_count: num, executed_week_count: number, completed: list(plan, 50), upcoming: list(plan, 50), past_unlinked: list(plan, 50), has_plan: bool });

export const READ_OUTPUT_SCHEMAS = Object.freeze({
  get_athlete_context: object({ schema_version: literal("enqidu_athlete_context_v1"), ...scope, profile: object(properties("display_name,experience_level,primary_goal")), goals: list(object({ ...properties("name,description,goal_type,target_unit,target_date,status"), priority: { anyOf: [str, num, { type: "null" }] }, target_value: number }), 30), constraints: list(object({ ...properties("constraint_type,severity,description"), active: nullable(bool) }), 50), locations: list(object({ ...properties("display_name,location_type,access_mode,prescription_scope"), coached_sessions_available: nullable(bool), is_active: nullable(bool) }), 30), equipment: list(object({ ...properties("name,category,location,unit"), quantity: number, available: { anyOf: [bool, str] } }), 100) }, ["schema_version", "calendar_date", "timezone", "profile", "goals", "constraints", "locations", "equipment"]),
  get_today_plan: object({ schema_version: literal("enqidu_today_plan_v1"), ...scope, status: { enum: ["persisted", "no_persisted_plan"] }, sessions: list(plan, 50), availability }, ["schema_version", "calendar_date", "timezone", "status", "sessions", "availability"]),
  get_week_plan: object({ schema_version: literal("enqidu_week_plan_v1"), ...scope, from: date, to: date, weekly_focus: text, sessions: list(plan, 50), availability, progress }, ["schema_version", "calendar_date", "timezone", "from", "to", "sessions", "availability", "progress"]),
  get_recent_training: object({ schema_version: literal("enqidu_recent_training_v1"), ...scope, date: dateOrNull, sessions: list(execution, 20), has_more: bool }, ["schema_version", "calendar_date", "timezone", "date", "sessions", "has_more"]),
  get_training_session: object({ schema_version: literal("enqidu_training_session_v1"), ...scope, session: execution, blocks: list(object({ ...properties("id,name,block_type"), ...properties("block_order,duration_seconds,rounds_completed", number) }), 100), metrics: list(object({ ...properties("metric_code,unit,confidence"), value_numeric: number }), 100) }, ["schema_version", "calendar_date", "timezone", "session", "blocks", "metrics"]),
  get_health_status: HEALTH_OUTPUT_SCHEMA,
  get_readiness: READINESS_OUTPUT_SCHEMA,
  get_closed_loop_assessment: object({ schema_version: literal("enqidu_closed_loop_result_v1"), ...scope, assessments: list(assessment, 5) }, ["schema_version", "calendar_date", "timezone", "assessments"]),
  get_adaptation_proposal: object({ schema_version: literal("enqidu_adaptation_proposals_v1"), ...scope, proposals: list(object({ planned_session_id: text, executed_session_id: text, proposal }, ["planned_session_id", "executed_session_id", "proposal"]), 5) }, ["schema_version", "calendar_date", "timezone", "proposals"]),
});

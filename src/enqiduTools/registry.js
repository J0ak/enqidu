import { READ_OUTPUT_SCHEMAS } from "./readSchemas.js";
import { objectSchema as object, textSchema as text, nullable, listSchema as list, DATE_SCHEMA as date, ID_SCHEMA as id } from "./schema.js";

export const ENQIDU_TOOLS_VERSION = "enqidu_tools_v1";
export const TOOL_VERSION = "1.0.0";
const timestamp = { type: "string", format: "date-time", maxLength: 40 };
const bool = { type: "boolean" };
const number = { type: "number" };
const fingerprint = { type: "string", pattern: "^sha256:[0-9a-f]{64}$", minLength: 71, maxLength: 71 };
const strings = list(text(), 50);
const noArgs = object({});
const sessionQuery = object({ session_id: id, date }, []);
const environment = { type: "string", enum: ["home", "pool", "trail", "outdoor", "functional_training_center"] };
const block = object({ id: nullable(id), block_order: number, title: nullable(text()), duration_seconds: nullable(number), duration_minutes: nullable(number),
  block_type: nullable(text()), objective: nullable(text()), planned_rounds: nullable(number), exercises_text: text(4000), constraints_text: text(4000), notes: nullable(text(2000)),
});
const session = object({ id: nullable(id), date, title: text(), status: text(40), session_type: text(60), environment: nullable(text(80)), duration_minutes: nullable(number), duration_min: nullable(number), duration_max: nullable(number), intensity: nullable(text(100)), objective: nullable(text()), completed: bool, blocks: list(block, 120) });

export const ACTION_PREVIEW_OUTPUT_SCHEMA = object({
  schema_version: { const: "enqidu_action_preview_v1" }, action: text(80),
  target: object({ session_ids: list(nullable(id), 100), dates: list(date, 100) }),
  before: list(session, 100), after: list(session, 100), consequences: strings, warnings: strings, reasons: strings,
  affected_entities: list(object({ type: { const: "planned_session" }, id: nullable(id), date }), 100),
  fingerprint, expires_at: timestamp, calendar_date: date, timezone: text(100), requires_confirmation: bool,
});
const persistedSession = object({ date, title: text(), session_type: text(60), duration_minutes: nullable(number), intensity: nullable(text(100)), environment: nullable(text(80)), blocks: list(object({ title: nullable(text()), duration_minutes: nullable(number) }), 120), blocks_count: number });
export const ACTION_RESULT_OUTPUT_SCHEMA = object({
  ok: { const: true }, action: text(80), source_date: date, target_date: date, from_date: date, to_date: date,
  planned_session_id: id, title: nullable(text()), moved: bool, cancelled: bool, adapted: bool, moved_count: number,
  moves: list(object({ planned_session_id: id, title: nullable(text()), source_date: date, target_date: date }), 7), message: text(),
  response_mode: { const: "deterministic_action" }, llm_used: { const: false }, usage: { type: "null" }, request_date: date, calendar_timezone: text(100),
  planned_session: persistedSession,
  // Reloaded after the existing action commits, with the same projection as get_week_plan.
  persisted_plan: READ_OUTPUT_SCHEMAS.get_week_plan,
  persistence_verified: bool,
}, ["ok", "action", "response_mode", "llm_used", "usage", "request_date", "calendar_timezone"]);

function resultSchema(data) {
  return object({
    tool: text(100), tool_version: { const: TOOL_VERSION }, ok: bool, data: nullable(data),
    error: object({ code: text(80), safe_message: text() }), warnings: strings,
    evidence: list(object({ kind: text(80), schema_version: text(100) }), 10),
    traceability: object({ request_id: text(80), source: { enum: ["app", "coach", "mcp", "agent"] }, registry_version: { const: ENQIDU_TOOLS_VERSION }, domain_handler: text(100) }),
    generated_at: timestamp, calendar_date: date, timezone: text(100),
  }, ["tool", "tool_version", "ok", "data", "warnings", "evidence", "traceability", "generated_at", "calendar_date", "timezone"]);
}
const reads = [
  ["get_athlete_context", "Read the authenticated athlete's profile, goals, constraints and location-scoped equipment.", noArgs],
  ["get_today_plan", "Read persisted sessions and blocks for today in the athlete profile timezone.", noArgs],
  ["get_week_plan", "Read the canonical Monday–Sunday plan, availability and progress in the profile timezone.", noArgs],
  ["get_recent_training", "Read at most 20 canonical executed sessions and permitted summary metrics.", object({ limit: { type: "integer", minimum: 1, maximum: 20 }, date }, [])],
  ["get_training_session", "Read one owned executed session, bounded blocks and permitted metrics.", object({ session_id: id })],
  ["get_health_status", "Read canonical health_recovery_v1 evidence for today or an explicit past date; never provider payloads.", object({ date }, [])],
  ["get_readiness", "Read existing deterministic readiness_v1, evidence and missing data for today or an explicit past date.", object({ date }, [])],
  ["get_closed_loop_assessment", "Read canonical closed_loop_assessment_v1 for an owned execution or calendar date.", sessionQuery],
  ["get_adaptation_proposal", "Read adaptation_proposal_v1 without changing the plan.", sessionQuery],
];
const actions = [
  ["move_session", "move a planned session to a later available date", object({ source_date: date, target_date: date })],
  ["adapt_duration", "rescale a planned session and its timed blocks", object({ source_date: date, duration_minutes: { type: "integer", minimum: 10, maximum: 180 } })],
  ["adapt_environment", "recalculate a planned session for an explicit environment", object({ source_date: date, environment })],
  ["cancel_session", "cancel a planned session while preserving plan history", object({ source_date: date })],
  ["adapt_remaining_week", "reschedule unavailable sessions within the remaining current week", noArgs],
  ["closed_loop_proposal", "translate an actionable canonical proposal into a bounded duration adaptation", object({ session_id: id, date }, ["session_id"])],
];
function definition(id, description, access, input, data) {
  return {
    id, version: TOOL_VERSION, description, access,
    classification: access === "write" ? "write" : "read",
    input_schema: input, output_schema: resultSchema(data), data_schema: data,
    authentication: "required", side_effects: access === "write" ? "persist_plan_via_existing_action" : "none",
    domain_handler: access === "read" ? `read.${id}` : `action.${id.replace(/^(preview|apply)_/, "")}`,
    traceability: { registry_version: ENQIDU_TOOLS_VERSION, deterministic: true, requires_confirmation: access === "write", uses_llm: false },
  };
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const ENQIDU_TOOLS = freeze([
  ...reads.map(([id, description, input]) => definition(id, description, "read", input, READ_OUTPUT_SCHEMAS[id])),
  ...actions.map(([name, description, input]) => definition(`preview_${name}`, `Preview exactly how to ${description}. No writes.`, "preview", input, ACTION_PREVIEW_OUTPUT_SCHEMA)),
  ...actions.map(([name, description, input]) => definition(`apply_${name}`, `Explicitly accept a reviewed preview to ${description}. Reloads and revalidates state before the existing action.`, "write", object({ ...input.properties, fingerprint, expires_at: timestamp, confirmation: { const: true } }, [...input.required, "fingerprint", "expires_at", "confirmation"]), ACTION_RESULT_OUTPUT_SCHEMA)),
]);
const byId = new Map(ENQIDU_TOOLS.map((tool) => [tool.id, tool]));
export function getEnqiduTool(id) { return byId.get(id) || null; }
export function listEnqiduTools({ includeWrites = true } = {}) {
  return ENQIDU_TOOLS.filter((tool) => includeWrites || tool.access !== "write").map(({ data_schema, ...metadata }) => metadata);
}

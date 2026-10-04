export const ENQIDU_TOOL_CONTRACT_VERSION = "enqidu_tools_v1";

const noArgs = Object.freeze({
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
});

const tool = ({
  name,
  description,
  access = "read",
  parameters = noArgs,
  implementation,
  enabled = true,
  explicitUserCommand = false,
}) => Object.freeze({
  version: ENQIDU_TOOL_CONTRACT_VERSION,
  name,
  description,
  access,
  parameters,
  implementation,
  enabled,
  explicit_user_command: explicitUserCommand,
  server_validated: true,
});

export const ENQIDU_TOOL_CATALOG = Object.freeze([
  tool({
    name: "get_today_plan",
    description: "Read the athlete's canonical plan or calculated recommendation for today. A persisted plan is authoritative.",
    implementation: "coach_context.today_plan",
  }),
  tool({
    name: "get_week_plan",
    description: "Read the athlete's canonical plan progress for the current profile-timezone week.",
    implementation: "coach_context.week_plan",
  }),
  tool({
    name: "get_training_trend",
    description: "Read ENQIDU's deterministic current-versus-previous training trend comparison.",
    implementation: "coach_context.training_trend",
  }),
  tool({
    name: "get_recovery_status",
    description: "Read recovery fields that are actually present in ENQIDU. Missing sleep, HRV, Body Battery or readiness must remain missing.",
    implementation: "coach_context.recovery",
  }),
  tool({
    name: "get_equipment",
    description: "Read available equipment, optionally scoped to one explicit training environment. Never mix equipment across unresolved locations.",
    implementation: "coach_context.equipment",
    parameters: Object.freeze({
      type: "object",
      properties: {
        environment: {
          anyOf: [
            { type: "null" },
            {
              type: "string",
              enum: ["home", "pool", "trail", "outdoor", "functional_training_center"],
            },
          ],
        },
      },
      required: ["environment"],
      additionalProperties: false,
    }),
  }),
  tool({
    name: "get_recent_session",
    description: "Read a recent executed training session from ENQIDU without inferring missing Garmin/FIT fields.",
    implementation: "coach_context.recent_session",
    parameters: Object.freeze({
      type: "object",
      properties: {
        date_reference: {
          anyOf: [
            { type: "null" },
            { type: "string", enum: ["today", "yesterday"] },
          ],
        },
      },
      required: ["date_reference"],
      additionalProperties: false,
    }),
  }),
  tool({
    name: "move_planned_session",
    description: "Move one explicitly referenced planned session to the next occurrence of an explicit weekday. ENQIDU validates source ownership, ambiguity, date freshness and target conflicts before writing.",
    access: "write",
    implementation: "coach_plan_action.move_planned_session",
    explicitUserCommand: true,
    parameters: Object.freeze({
      type: "object",
      properties: {
        source_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        target_weekday: {
          type: "string",
          enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        },
      },
      required: ["source_date", "target_weekday"],
      additionalProperties: false,
    }),
  }),
  tool({
    name: "set_training_unavailability",
    description: "Persist an explicit athlete statement that training is unavailable on today or tomorrow. This does not silently move, cancel or delete an existing plan.",
    access: "write",
    implementation: "coach_plan_action.set_training_unavailability",
    explicitUserCommand: true,
    parameters: Object.freeze({
      type: "object",
      properties: {
        date_reference: {
          type: "string",
          enum: ["today", "tomorrow"],
        },
      },
      required: ["date_reference"],
      additionalProperties: false,
    }),
  }),
  tool({
    name: "adapt_session_environment",
    description: "Adapt one explicitly referenced ENQIDU-generated planned session to an explicit training environment. ENQIDU recalculates the session from canonical context and server-validates the replacement before writing.",
    access: "write",
    implementation: "coach_plan_action.adapt_session_environment",
    explicitUserCommand: true,
    parameters: Object.freeze({
      type: "object",
      properties: {
        source_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        environment: {
          type: "string",
          enum: ["home", "pool", "trail", "outdoor", "functional_training_center"],
        },
      },
      required: ["source_date", "environment"],
      additionalProperties: false,
    }),
  }),
  tool({
    name: "adapt_session_duration",
    description: "Adapt one explicitly referenced ENQIDU-generated planned session to an explicit duration. ENQIDU preserves the session structure while deterministically rescaling timed blocks and validating the write server-side.",
    access: "write",
    implementation: "coach_plan_action.adapt_session_duration",
    explicitUserCommand: true,
    parameters: Object.freeze({
      type: "object",
      properties: {
        source_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        duration_minutes: { type: "integer", minimum: 10, maximum: 180 },
      },
      required: ["source_date", "duration_minutes"],
      additionalProperties: false,
    }),
  }),
  tool({
    name: "cancel_planned_session",
    description: "Cancel one explicitly referenced planned session while preserving it as auditable plan history. ENQIDU validates ownership, date and completion state before writing.",
    access: "write",
    implementation: "coach_plan_action.cancel_planned_session",
    explicitUserCommand: true,
    parameters: Object.freeze({
      type: "object",
      properties: {
        source_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
      required: ["source_date"],
      additionalProperties: false,
    }),
  }),
  tool({
    name: "adapt_remaining_week",
    description: "Safely reorganize the athlete's remaining current week after explicit availability changes. ENQIDU only moves its own uncompleted plans from unavailable dates to later free dates in the same week and fails closed if the week cannot be resolved safely.",
    access: "write",
    implementation: "coach_plan_action.adapt_remaining_week",
    explicitUserCommand: true,
  }),
  tool({
    name: "save_recommendation_today",
    description: "Persist today's currently valid ENQIDU recommendation after an explicit user request. The server recalculates and revalidates it before writing.",
    access: "write",
    implementation: "coach_plan_action.save_recommendation_today",
    explicitUserCommand: true,
    parameters: Object.freeze({
      type: "object",
      properties: {
        date: { anyOf: [{ type: "null" }, { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }] },
        environment: {
          anyOf: [
            { type: "null" },
            {
              type: "string",
              enum: ["home", "pool", "trail", "outdoor", "functional_training_center"],
            },
          ],
        },
      },
      required: ["date", "environment"],
      additionalProperties: false,
    }),
  }),
]);

export const ENQIDU_PLANNED_TOOL_NAMES = Object.freeze([
  "get_exercise_history",
  "record_training_feedback",
  "build_garmin_workout",
  "send_workout_to_garmin",
]);

const CATALOG_BY_NAME = new Map(ENQIDU_TOOL_CATALOG.map((item) => [item.name, item]));

export function getEnqiduTool(name) {
  return CATALOG_BY_NAME.get(String(name || "")) || null;
}

export function listEnqiduTools({ includeWrites = true } = {}) {
  return ENQIDU_TOOL_CATALOG.filter((item) => item.enabled && (includeWrites || item.access !== "write"));
}

export function toOpenAIResponsesTools(options = {}) {
  return listEnqiduTools(options).map((item) => ({
    type: "function",
    name: item.name,
    description: item.description,
    parameters: item.parameters,
    strict: true,
  }));
}

export function toMcpToolDescriptors(options = {}) {
  return listEnqiduTools(options).map((item) => ({
    name: item.name,
    description: item.description,
    inputSchema: item.parameters,
  }));
}

export function validateEnqiduToolRequest({ name, arguments: args = {}, explicitUserCommand = false } = {}) {
  const definition = getEnqiduTool(name);
  if (!definition?.enabled) {
    return { ok: false, error: "unsupported_tool" };
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "invalid_arguments" };
  }

  const allowedKeys = new Set(Object.keys(definition.parameters?.properties || {}));
  if (Object.keys(args).some((key) => !allowedKeys.has(key))) {
    return { ok: false, error: "unexpected_argument" };
  }
  const required = Array.isArray(definition.parameters?.required)
    ? definition.parameters.required
    : [];
  if (required.some((key) => !(key in args))) {
    return { ok: false, error: "missing_argument" };
  }
  if (definition.access === "write" && definition.explicit_user_command && !explicitUserCommand) {
    return { ok: false, error: "explicit_user_command_required" };
  }

  return {
    ok: true,
    tool: definition,
    arguments: { ...args },
  };
}

export const enqiduToolPolicy = Object.freeze({
  llm_role: "understand_select_explain",
  engine_role: "validate_decide_execute_persist",
  writes: "server_validated_explicit_only",
  source_of_truth: "enqidu_canonical_state",
});

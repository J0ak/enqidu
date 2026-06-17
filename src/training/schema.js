export const SESSION_TYPES = [
  "strength",
  "hypertrophy",
  "powerlifting",
  "weightlifting",
  "bodybuilding",
  "calisthenics",
  "gymnastics_skill",
  "functional_fitness",
  "crossfit_style",
  "hiit",
  "hybrid",
  "running",
  "trail_running",
  "cycling",
  "swimming",
  "triathlon",
  "mobility",
  "yoga",
  "pilates",
  "rehab",
  "prehab",
  "recovery",
  "walking",
  "hiking",
  "sport_specific",
  "mixed",
  "test",
  "race",
  "competition",
];

export const BLOCK_TYPES = [
  "warmup",
  "activation",
  "mobility",
  "technique",
  "skill",
  "strength_main",
  "strength_accessory",
  "hypertrophy",
  "power",
  "olympic_lifting",
  "gymnastics",
  "conditioning",
  "metcon",
  "emom",
  "amrap",
  "for_time",
  "intervals",
  "endurance",
  "tempo",
  "threshold",
  "z2",
  "sprint",
  "trail_climb",
  "trail_descent",
  "swim_drill",
  "swim_main_set",
  "bike_interval",
  "brick",
  "core",
  "rehab",
  "prehab",
  "breathing",
  "cooldown",
  "test",
  "competition",
  "mixed",
];

export const BLOCK_FORMATS = [
  "straight_sets",
  "superset",
  "giant_set",
  "circuit",
  "rounds",
  "rounds_for_quality",
  "amrap",
  "emom",
  "tabata",
  "for_time",
  "interval",
  "continuous",
  "laps",
  "segments",
  "ladder",
  "pyramid",
  "complex",
  "density",
  "skill_practice",
  "mobility_flow",
  "breathing_flow",
  "mixed",
];

export const BLOCK_ITEM_TYPES = [
  "exercise_direct",
  "station",
  "round_task",
  "interval_task",
  "emom_minute",
  "amrap_task",
  "for_time_task",
  "segment",
  "lap",
  "rest",
  "transition",
  "breathing_task",
  "mobility_task",
  "skill_task",
];

export const MEASUREMENT_TYPES = [
  "sets_reps_load",
  "reps_only",
  "reps_per_side",
  "duration",
  "distance",
  "rounds",
  "rounds_for_time",
  "amrap_score",
  "emom",
  "intervals",
  "swim_set",
  "skill_attempts",
  "breathing",
  "mobility_hold",
  "cardio_duration_distance",
  "calories",
  "power",
  "pace",
  "heart_rate_zone",
  "mixed",
];

export const REQUIRED_SESSION_KEYS = ["schema_version", "session", "blocks", "missing_fields", "summary_metrics"];

export const EnqiduTrainingSessionV1Schema = {
  $id: "https://enqidu.app/schemas/enqidu-training-session-v1.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "EnqiduTrainingSessionV1",
  type: "object",
  required: REQUIRED_SESSION_KEYS,
  additionalProperties: false,
  properties: {
    schema_version: { const: "enqidu_training_session_v1" },
    session: {
      type: "object",
      required: ["title", "session_type"],
      additionalProperties: true,
      properties: {
        id: { type: "string" },
        title: { type: "string", minLength: 1 },
        session_type: { enum: SESSION_TYPES },
        status: { enum: ["planned", "performed", "interpreted", "draft", "completed", "imported"] },
        total_duration_s: { type: "number", minimum: 0 },
        summary_metrics: { type: "object", additionalProperties: true },
        missing_fields: { type: "array", items: { type: "string" } },
      },
    },
    planned: { type: "object", additionalProperties: true },
    performed: { type: "object", additionalProperties: true },
    interpreted: { type: "object", additionalProperties: true },
    blocks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["order_index", "block_type", "block_format", "primary_measurement_type", "items"],
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          order_index: { type: "integer", minimum: 1 },
          block_type: { enum: BLOCK_TYPES },
          block_format: { enum: BLOCK_FORMATS },
          primary_measurement_type: { enum: MEASUREMENT_TYPES },
          duration_s: { type: "number", minimum: 0 },
          rounds: { type: "number", minimum: 0 },
          time_cap_s: { type: "number", minimum: 0 },
          score: { type: "string" },
          summary_metrics: { type: "object", additionalProperties: true },
          missing_fields: { type: "array", items: { type: "string" } },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["order_index", "item_type", "exercises"],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                order_index: { type: "integer", minimum: 1 },
                item_type: { enum: BLOCK_ITEM_TYPES },
                item_name: { type: "string" },
                station_label: { type: "string" },
                round_index: { type: "integer", minimum: 1 },
                minute_slot: { type: "integer", minimum: 1 },
                duration_s: { type: "number", minimum: 0 },
                rest_s: { type: "number", minimum: 0 },
                summary_metrics: { type: "object", additionalProperties: true },
                exercises: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["exercise_id", "display_name", "measurement_type"],
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" },
                      exercise_id: { type: "string", minLength: 1 },
                      canonical_slug: { type: "string" },
                      display_name: { type: "string", minLength: 1 },
                      measurement_type: { enum: MEASUREMENT_TYPES },
                      target_reps: { type: "number", minimum: 0 },
                      target_reps_per_side: { type: "number", minimum: 0 },
                      target_load_kg: { type: "number", minimum: 0 },
                      target_duration_s: { type: "number", minimum: 0 },
                      target_distance_m: { type: "number", minimum: 0 },
                      missing_fields: { type: "array", items: { type: "string" } },
                      performed_sets: { type: "array", items: { type: "object", additionalProperties: true } },
                      performed_metrics: { type: "array", items: { type: "object", additionalProperties: true } },
                      summary_metrics: { type: "object", additionalProperties: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    missing_fields: { type: "array", items: { type: "string" } },
    summary_metrics: { type: "object", additionalProperties: true },
    source_links: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

export function validateTrainingSessionContract(value) {
  const errors = [];
  if (!isPlainObject(value)) return { ok: false, errors: ["session payload must be an object"] };
  REQUIRED_SESSION_KEYS.forEach((key) => {
    if (!(key in value)) errors.push(`missing ${key}`);
  });
  if (value.schema_version !== "enqidu_training_session_v1") errors.push("schema_version must be enqidu_training_session_v1");
  if (!isPlainObject(value.session)) errors.push("session must be an object");
  if (!Array.isArray(value.blocks) || value.blocks.length === 0) errors.push("blocks must contain at least one block");

  if (isPlainObject(value.session)) {
    if (!value.session.title) errors.push("session.title is required");
    if (!SESSION_TYPES.includes(value.session.session_type)) errors.push(`unsupported session_type: ${value.session.session_type}`);
  }

  (value.blocks || []).forEach((block, blockIndex) => {
    const path = `blocks[${blockIndex}]`;
    if (!BLOCK_TYPES.includes(block.block_type)) errors.push(`${path}.block_type is unsupported`);
    if (!BLOCK_FORMATS.includes(block.block_format)) errors.push(`${path}.block_format is unsupported`);
    if (!MEASUREMENT_TYPES.includes(block.primary_measurement_type)) errors.push(`${path}.primary_measurement_type is unsupported`);
    if (!Array.isArray(block.items)) errors.push(`${path}.items must be an array`);
    (block.items || []).forEach((item, itemIndex) => {
      const itemPath = `${path}.items[${itemIndex}]`;
      if (!BLOCK_ITEM_TYPES.includes(item.item_type)) errors.push(`${itemPath}.item_type is unsupported`);
      if (!Array.isArray(item.exercises)) errors.push(`${itemPath}.exercises must be an array`);
      (item.exercises || []).forEach((exercise, exerciseIndex) => {
        const exercisePath = `${itemPath}.exercises[${exerciseIndex}]`;
        if (!exercise.exercise_id) errors.push(`${exercisePath}.exercise_id is required`);
        if (!exercise.display_name) errors.push(`${exercisePath}.display_name is required`);
        if (!MEASUREMENT_TYPES.includes(exercise.measurement_type)) errors.push(`${exercisePath}.measurement_type is unsupported`);
      });
    });
  });

  return { ok: errors.length === 0, errors };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

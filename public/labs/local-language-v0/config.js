const WEBLLM = "https://esm.run/@mlc-ai/web-llm@0.2.85";
const VERSION = "local_language_v0";
const DATASET_URL = "./dataset.json";

const MODELS = [
  ["Llama-3.2-1B-Instruct-q4f16_1-MLC", "1B", 879.04, "Llama 3.2 Community", "Spanish supported"],
  ["Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "1.5B", 1629.75, "Apache-2.0", "multilingual / Spanish"],
  ["SmolLM2-1.7B-Instruct-q4f16_1-MLC", "1.7B", 1774.19, "Apache-2.0", "English stress baseline"],
  ["Qwen2.5-3B-Instruct-q4f16_1-MLC", "3B", 2504.76, "Apache-2.0", "upper device tier"],
  ["Qwen2.5-0.5B-Instruct-q4f16_1-MLC", "0.5B", 944.62, "Apache-2.0", "lower-bound baseline"],
].map(([id, params, vramMb, license, note]) => ({ id, params, vramMb, license, note }));

const INTENTS = [
  "greeting",
  "recommend_today",
  "plan_week",
  "training_trend",
  "recovery_status",
  "equipment_query",
  "session_lookup",
  "save_recommendation",
  "move_plan",
  "unavailability",
  "adapt_environment",
  "adapt_duration",
  "cancel_plan",
  "adapt_week",
  "unknown",
];

const ACTION_INTENTS = [
  "save_recommendation",
  "move_plan",
  "unavailability",
  "adapt_environment",
  "adapt_duration",
  "cancel_plan",
  "adapt_week",
];

const ENVS = ["home", "pool", "trail", "outdoor", "functional_training_center"];
const DATES = ["today", "tomorrow", "yesterday", "this_week", "next_week", "weekday"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const QUALITY_GATES = Object.freeze({
  structured_valid_rate: 0.99,
  intent_accuracy: 0.95,
  action_intent_accuracy: 0.99,
  slot_exact_accuracy: 0.92,
  android_warm_p50_ms: 1500,
  android_warm_p95_ms: 3000,
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "intent", "slots", "language", "confidence"],
  properties: {
    version: { const: VERSION },
    intent: { enum: INTENTS },
    language: { enum: ["es", "en", "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    slots: {
      type: "object",
      additionalProperties: false,
      required: ["environment", "duration_max_minutes", "intensity_preference", "date_reference", "weekday"],
      properties: {
        environment: { anyOf: [{ type: "null" }, { enum: ENVS }] },
        duration_max_minutes: { anyOf: [{ type: "null" }, { type: "integer", minimum: 5, maximum: 300 }] },
        intensity_preference: { anyOf: [{ type: "null" }, { enum: ["easy", "moderate", "hard"] }] },
        date_reference: { anyOf: [{ type: "null" }, { enum: DATES }] },
        weekday: { anyOf: [{ type: "null" }, { enum: DAYS }] },
      },
    },
  },
};

const prompt = "You are ENQIDU's language parser, not a sports coach. Return only JSON matching the schema. Classify intent and extract only explicit slots. Never recommend training, infer health data, or execute actions. Use unknown when semantics are outside the intent list.";

export {
  WEBLLM,
  VERSION,
  DATASET_URL,
  MODELS,
  INTENTS,
  ACTION_INTENTS,
  ENVS,
  DATES,
  DAYS,
  QUALITY_GATES,
  schema,
  prompt,
};

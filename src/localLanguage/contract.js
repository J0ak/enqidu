export const LOCAL_LANGUAGE_VERSION = "local_language_v0";

export const LOCAL_LANGUAGE_INTENTS = Object.freeze([
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
]);

export const LOCAL_LANGUAGE_ENVIRONMENTS = Object.freeze([
  "home",
  "pool",
  "trail",
  "outdoor",
  "functional_training_center",
]);

export const LOCAL_LANGUAGE_INTENSITIES = Object.freeze(["easy", "moderate", "hard"]);
export const LOCAL_LANGUAGE_DATE_REFERENCES = Object.freeze([
  "today",
  "tomorrow",
  "yesterday",
  "this_week",
  "next_week",
  "weekday",
]);
export const LOCAL_LANGUAGE_WEEKDAYS = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const INTENT_SET = new Set(LOCAL_LANGUAGE_INTENTS);
const ENVIRONMENT_SET = new Set(LOCAL_LANGUAGE_ENVIRONMENTS);
const INTENSITY_SET = new Set(LOCAL_LANGUAGE_INTENSITIES);
const DATE_REFERENCE_SET = new Set(LOCAL_LANGUAGE_DATE_REFERENCES);
const WEEKDAY_SET = new Set(LOCAL_LANGUAGE_WEEKDAYS);
const LANGUAGE_SET = new Set(["es", "en", "unknown"]);

const enumOrNull = (value, allowed) => value == null || value === "" ? null : (allowed.has(value) ? value : undefined);
const boundedIntegerOrNull = (value, min, max) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return undefined;
  return number;
};

export const localLanguageJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["version", "intent", "slots", "language", "confidence"],
  properties: {
    version: { const: LOCAL_LANGUAGE_VERSION },
    intent: { enum: LOCAL_LANGUAGE_INTENTS },
    language: { enum: ["es", "en", "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    slots: {
      type: "object",
      additionalProperties: false,
      required: [
        "environment",
        "duration_max_minutes",
        "intensity_preference",
        "date_reference",
        "weekday",
      ],
      properties: {
        environment: { anyOf: [{ type: "null" }, { enum: LOCAL_LANGUAGE_ENVIRONMENTS }] },
        duration_max_minutes: { anyOf: [{ type: "null" }, { type: "integer", minimum: 5, maximum: 300 }] },
        intensity_preference: { anyOf: [{ type: "null" }, { enum: LOCAL_LANGUAGE_INTENSITIES }] },
        date_reference: { anyOf: [{ type: "null" }, { enum: LOCAL_LANGUAGE_DATE_REFERENCES }] },
        weekday: { anyOf: [{ type: "null" }, { enum: LOCAL_LANGUAGE_WEEKDAYS }] },
      },
    },
  },
});

export function emptyLocalLanguageSlots() {
  return {
    environment: null,
    duration_max_minutes: null,
    intensity_preference: null,
    date_reference: null,
    weekday: null,
  };
}

export function normalizeLocalLanguageParse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== LOCAL_LANGUAGE_VERSION || !INTENT_SET.has(value.intent)) return null;
  if (!LANGUAGE_SET.has(value.language)) return null;

  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  const slots = value.slots;
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return null;

  const environment = enumOrNull(slots.environment, ENVIRONMENT_SET);
  const durationMaxMinutes = boundedIntegerOrNull(slots.duration_max_minutes, 5, 300);
  const intensityPreference = enumOrNull(slots.intensity_preference, INTENSITY_SET);
  const dateReference = enumOrNull(slots.date_reference, DATE_REFERENCE_SET);
  const weekday = enumOrNull(slots.weekday, WEEKDAY_SET);

  if ([environment, durationMaxMinutes, intensityPreference, dateReference, weekday].some((item) => item === undefined)) {
    return null;
  }
  if (dateReference === "weekday" && !weekday) return null;
  if (dateReference !== "weekday" && weekday) return null;

  return {
    version: LOCAL_LANGUAGE_VERSION,
    intent: value.intent,
    slots: {
      environment,
      duration_max_minutes: durationMaxMinutes,
      intensity_preference: intensityPreference,
      date_reference: dateReference,
      weekday,
    },
    language: value.language,
    confidence,
  };
}

import {
  LOCAL_LANGUAGE_DATE_REFERENCES,
  LOCAL_LANGUAGE_ENVIRONMENTS,
  LOCAL_LANGUAGE_INTENSITIES,
  LOCAL_LANGUAGE_INTENTS,
  LOCAL_LANGUAGE_VERSION,
  LOCAL_LANGUAGE_WEEKDAYS,
  localLanguageJsonSchema,
  normalizeLocalLanguageParse,
} from "./contract.js";

export const CLOUD_BENCHMARK_MODEL = "amazon/nova-micro";
export const CLOUD_BENCHMARK_PRICING_USD_PER_MILLION = Object.freeze({
  input: 0.04,
  output: 0.14,
});
export const CLOUD_BENCHMARK_EXPIRES_AT = "2026-10-05T00:00:00.000Z";

export const CLOUD_ACTION_INTENTS = Object.freeze([
  "save_recommendation",
  "move_plan",
  "unavailability",
  "adapt_environment",
  "adapt_duration",
  "cancel_plan",
  "adapt_week",
]);

export const CLOUD_QUALITY_GATES = Object.freeze({
  structured_valid_rate: 0.99,
  intent_accuracy: 0.95,
  action_intent_accuracy: 0.99,
  slot_exact_accuracy: 0.92,
});

const ACTION_SET = new Set(CLOUD_ACTION_INTENTS);
const TOP_LEVEL_KEYS = ["confidence", "intent", "language", "slots", "version"];
const SLOT_KEYS = ["date_reference", "duration_max_minutes", "environment", "intensity_preference", "weekday"];

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
};
const same = (a, b) => JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
const round = (value, digits = 4) => value == null ? null : Number(value.toFixed(digits));

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * ratio)] : null;
}

function gate(value, threshold) {
  return { value, threshold, pass: value != null && value >= threshold };
}

export function buildCloudLanguagePrompt() {
  return [
    "You are ENQIDU's language parser, not a sports coach.",
    "Return exactly one JSON object and nothing else.",
    "Classify only the user's intent and extract only slots explicitly stated in the user's text.",
    "Do not recommend training, infer health/recovery facts, invent dates, execute actions, or fill missing slots.",
    "If semantics are outside the allowed intents, use intent=unknown.",
    "If a weekday is present, date_reference must be weekday; otherwise weekday must be null.",
    `Allowed intents: ${LOCAL_LANGUAGE_INTENTS.join(", ")}.`,
    `Allowed environments: ${LOCAL_LANGUAGE_ENVIRONMENTS.join(", ")}.`,
    `Allowed intensities: ${LOCAL_LANGUAGE_INTENSITIES.join(", ")}.`,
    `Allowed date references: ${LOCAL_LANGUAGE_DATE_REFERENCES.join(", ")}.`,
    `Allowed weekdays: ${LOCAL_LANGUAGE_WEEKDAYS.join(", ")}.`,
    `Required JSON Schema: ${JSON.stringify(localLanguageJsonSchema)}`,
  ].join("\n");
}

export function parseCloudLanguagePayload(raw) {
  try {
    const value = JSON.parse(String(raw ?? ""));
    const normalized = normalizeLocalLanguageParse(value);
    const structuredValid = Boolean(
      normalized
      && exactKeys(value, TOP_LEVEL_KEYS)
      && exactKeys(value.slots, SLOT_KEYS)
      && same(normalized, value)
    );
    return {
      jsonValid: true,
      structuredValid,
      value: structuredValid ? value : null,
      parsedValue: value,
    };
  } catch (error) {
    return {
      jsonValid: false,
      structuredValid: false,
      value: null,
      parsedValue: null,
      error: String(error?.message || error),
    };
  }
}

export function selectCloudBenchmarkCases(dataset, mode = "smoke") {
  if (mode === "full") return dataset.slice();
  if (mode !== "smoke") throw new Error("unsupported_benchmark_mode");

  const selected = [];
  for (const intent of LOCAL_LANGUAGE_INTENTS) {
    for (const language of ["es", "en"]) {
      const preferredKind = ACTION_SET.has(intent) ? "challenge" : "core";
      const match = dataset.find((row) =>
        row.language === language
        && row.expected?.intent === intent
        && row.kind === preferredKind
      ) || dataset.find((row) =>
        row.language === language
        && row.expected?.intent === intent
      );
      if (!match) throw new Error(`missing_smoke_case_${intent}_${language}`);
      selected.push(match);
    }
  }
  return selected;
}

function aggregate(records) {
  const total = records.length;
  const jsonValid = records.filter((record) => record.jsonValid).length;
  const structuredValid = records.filter((record) => record.structuredValid).length;
  const intentMatches = records.filter((record) =>
    record.structuredValid && record.actual?.intent === record.expected?.intent
  ).length;
  const slotMatches = records.filter((record) =>
    record.structuredValid && same(record.actual?.slots, record.expected?.slots)
  ).length;

  return {
    cases: total,
    json_parse_valid_rate: total ? round(jsonValid / total) : null,
    structured_valid_rate: total ? round(structuredValid / total) : null,
    intent_accuracy: total ? round(intentMatches / total) : null,
    slot_exact_accuracy: total ? round(slotMatches / total) : null,
  };
}

export function summarizeCloudBenchmark({
  records,
  datasetSize,
  mode,
  model = CLOUD_BENCHMARK_MODEL,
  inputTokens = 0,
  outputTokens = 0,
  generatedAt = new Date().toISOString(),
}) {
  const successfulModelResponses = records.filter((record) => !record.error && record.raw !== null).length;
  const overall = aggregate(records);
  const actionRecords = records.filter((record) => ACTION_SET.has(record.expected?.intent));
  const actionMatches = actionRecords.filter((record) =>
    record.structuredValid && record.actual?.intent === record.expected?.intent
  ).length;
  const actionIntentAccuracy = actionRecords.length ? round(actionMatches / actionRecords.length) : null;
  const latencies = records.map((record) => record.latencyMs).filter(Number.isFinite);
  const p50 = round(percentile(latencies, 0.5), 0);
  const p95 = round(percentile(latencies, 0.95), 0);
  const mean = latencies.length
    ? round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length, 0)
    : null;

  const quality = {
    structured_valid_rate: gate(overall.structured_valid_rate, CLOUD_QUALITY_GATES.structured_valid_rate),
    intent_accuracy: gate(overall.intent_accuracy, CLOUD_QUALITY_GATES.intent_accuracy),
    action_intent_accuracy: gate(actionIntentAccuracy, CLOUD_QUALITY_GATES.action_intent_accuracy),
    slot_exact_accuracy: gate(overall.slot_exact_accuracy, CLOUD_QUALITY_GATES.slot_exact_accuracy),
  };

  return {
    version: LOCAL_LANGUAGE_VERSION,
    benchmark: "vercel_ai_gateway_v0",
    model,
    mode,
    cases: records.length,
    dataset_size: datasetSize,
    full_dataset: mode === "full" && records.length === datasetSize,
    pricing_usd_per_million_tokens: CLOUD_BENCHMARK_PRICING_USD_PER_MILLION,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
    estimated_cost_usd: round(
      (inputTokens / 1_000_000) * CLOUD_BENCHMARK_PRICING_USD_PER_MILLION.input
      + (outputTokens / 1_000_000) * CLOUD_BENCHMARK_PRICING_USD_PER_MILLION.output,
      6,
    ),
    json_parse_valid_rate: overall.json_parse_valid_rate,
    structured_valid_rate: overall.structured_valid_rate,
    intent_accuracy: overall.intent_accuracy,
    slot_exact_accuracy: overall.slot_exact_accuracy,
    action_intents: {
      cases: actionRecords.length,
      intent_accuracy: actionIntentAccuracy,
    },
    inference_ms: { p50, p95, mean },
    successful_model_responses: successfulModelResponses,
    quality_gates_evaluated: successfulModelResponses > 0,
    failures: records.filter((record) =>
      !record.structuredValid
      || record.actual?.intent !== record.expected?.intent
      || !same(record.actual?.slots, record.expected?.slots)
    ).length,
    gates: {
      quality: successfulModelResponses > 0 ? quality : null,
      passes_measured_gates: successfulModelResponses > 0
        ? Object.values(quality).every((item) => item.pass)
        : null,
    },
    generated_at: generatedAt,
  };
}

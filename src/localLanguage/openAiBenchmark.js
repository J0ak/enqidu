import {
  LOCAL_LANGUAGE_INTENTS,
  LOCAL_LANGUAGE_VERSION,
  normalizeLocalLanguageParse,
} from "./contract.js";

export const OPENAI_LANGUAGE_BENCHMARK_MODEL = "gpt-6-luna";
export const OPENAI_LANGUAGE_BENCHMARK_EXPIRES_AT = "2026-10-07T00:00:00.000Z";

export const OPENAI_LANGUAGE_PRICING_USD_PER_MILLION = Object.freeze({
  input: 0.10,
  output: 0.50,
});

export const OPENAI_LANGUAGE_GATES = Object.freeze({
  structured_valid_rate: 0.99,
  intent_accuracy: 0.95,
  action_intent_accuracy: 0.99,
  slot_exact_accuracy: 0.92,
});

export const OPENAI_LANGUAGE_ACTION_INTENTS = Object.freeze([
  "save_recommendation",
  "move_plan",
  "unavailability",
  "adapt_environment",
  "adapt_duration",
  "cancel_plan",
  "adapt_week",
]);

const ACTION_SET = new Set(OPENAI_LANGUAGE_ACTION_INTENTS);
const TOP_LEVEL_KEYS = ["confidence", "intent", "language", "slots", "version"];
const SLOT_KEYS = ["date_reference", "duration_max_minutes", "environment", "intensity_preference", "weekday"];

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
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

export function buildOpenAiLanguageInstructions() {
  return [
    "You are ENQIDU's language parser, not a sports coach.",
    "Classify the user's intent and extract only slots explicitly stated by the user.",
    "Do not recommend training, infer health/recovery data, invent dates, execute actions, or fill missing slots.",
    "Use unknown when semantics are outside the allowed intent list.",
    "If a weekday is explicit, date_reference must be weekday. Otherwise weekday must be null.",
    "Return only the requested structured object.",
  ].join("\n");
}

export function parseOpenAiLanguageOutput(raw) {
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

export function selectOpenAiBenchmarkCases(dataset, mode = "smoke") {
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
  const successful = records.filter((record) => !record.error && record.raw !== null).length;
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
    successful_model_responses: successful,
    json_parse_valid_rate: total ? round(jsonValid / total) : null,
    structured_valid_rate: total ? round(structuredValid / total) : null,
    intent_accuracy: total ? round(intentMatches / total) : null,
    slot_exact_accuracy: total ? round(slotMatches / total) : null,
  };
}

export function summarizeOpenAiBenchmark({
  records,
  datasetSize,
  mode,
  inputTokens = 0,
  outputTokens = 0,
  reasoningTokens = 0,
  generatedAt = new Date().toISOString(),
  model = OPENAI_LANGUAGE_BENCHMARK_MODEL,
}) {
  const overall = aggregate(records);
  const actionRecords = records.filter((record) => ACTION_SET.has(record.expected?.intent));
  const actionMatches = actionRecords.filter((record) =>
    record.structuredValid && record.actual?.intent === record.expected?.intent
  ).length;
  const actionIntentAccuracy = actionRecords.length ? round(actionMatches / actionRecords.length) : null;
  const latencies = records.map((record) => record.latencyMs).filter(Number.isFinite);
  const providerErrors = records.filter((record) => Boolean(record.error)).length;
  const completeRun = overall.successful_model_responses === records.length;

  const quality = {
    structured_valid_rate: gate(overall.structured_valid_rate, OPENAI_LANGUAGE_GATES.structured_valid_rate),
    intent_accuracy: gate(overall.intent_accuracy, OPENAI_LANGUAGE_GATES.intent_accuracy),
    action_intent_accuracy: gate(actionIntentAccuracy, OPENAI_LANGUAGE_GATES.action_intent_accuracy),
    slot_exact_accuracy: gate(overall.slot_exact_accuracy, OPENAI_LANGUAGE_GATES.slot_exact_accuracy),
  };

  return {
    version: LOCAL_LANGUAGE_VERSION,
    benchmark: "openai_direct_language_v0",
    model,
    mode,
    cases: records.length,
    dataset_size: datasetSize,
    full_dataset: mode === "full" && records.length === datasetSize,
    provider_errors: providerErrors,
    successful_model_responses: overall.successful_model_responses,
    quality_gates_evaluated: completeRun,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      reasoning_tokens: reasoningTokens,
    },
    pricing_usd_per_million_tokens: OPENAI_LANGUAGE_PRICING_USD_PER_MILLION,
    estimated_cost_usd: round(
      (inputTokens / 1_000_000) * OPENAI_LANGUAGE_PRICING_USD_PER_MILLION.input
      + (outputTokens / 1_000_000) * OPENAI_LANGUAGE_PRICING_USD_PER_MILLION.output,
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
    inference_ms: {
      p50: round(percentile(latencies, 0.5), 0),
      p95: round(percentile(latencies, 0.95), 0),
      mean: latencies.length
        ? round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length, 0)
        : null,
    },
    failures: records.filter((record) =>
      record.error
      || !record.structuredValid
      || record.actual?.intent !== record.expected?.intent
      || !same(record.actual?.slots, record.expected?.slots)
    ).length,
    gates: {
      quality: completeRun ? quality : null,
      passes_measured_gates: completeRun
        ? Object.values(quality).every((item) => item.pass)
        : null,
    },
    generated_at: generatedAt,
  };
}

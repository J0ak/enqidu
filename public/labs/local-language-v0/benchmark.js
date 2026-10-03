import {
  VERSION,
  INTENTS,
  ACTION_INTENTS,
  ENVS,
  DATES,
  DAYS,
  QUALITY_GATES,
} from "./config.js";

const INTENT_SET = new Set(INTENTS);
const ACTION_INTENT_SET = new Set(ACTION_INTENTS);
const ENV_SET = new Set(ENVS);
const DATE_SET = new Set(DATES);
const DAY_SET = new Set(DAYS);
const LANGUAGE_SET = new Set(["es", "en", "unknown"]);
const INTENSITY_SET = new Set(["easy", "moderate", "hard"]);
const TOP_LEVEL_KEYS = ["confidence", "intent", "language", "slots", "version"];
const SLOT_KEYS = ["date_reference", "duration_max_minutes", "environment", "intensity_preference", "weekday"];

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected) => {
  if (!isObject(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};
const enumOrNull = (value, allowed) => value === null || allowed.has(value);
const round = (value, digits = 4) => value == null ? null : Number(value.toFixed(digits));
const percentile = (values, ratio) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * ratio)] : null;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validateStructuredParse(value) {
  if (!exactKeys(value, TOP_LEVEL_KEYS)) return false;
  if (value.version !== VERSION || !INTENT_SET.has(value.intent) || !LANGUAGE_SET.has(value.language)) return false;
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return false;
  if (!exactKeys(value.slots, SLOT_KEYS)) return false;

  const slots = value.slots;
  if (!enumOrNull(slots.environment, ENV_SET)) return false;
  if (slots.duration_max_minutes !== null && (
    !Number.isInteger(slots.duration_max_minutes)
    || slots.duration_max_minutes < 5
    || slots.duration_max_minutes > 300
  )) return false;
  if (!enumOrNull(slots.intensity_preference, INTENSITY_SET)) return false;
  if (!enumOrNull(slots.date_reference, DATE_SET)) return false;
  if (!enumOrNull(slots.weekday, DAY_SET)) return false;
  if (slots.date_reference === "weekday" && !slots.weekday) return false;
  if (slots.date_reference !== "weekday" && slots.weekday !== null) return false;

  return true;
}

export function parseModelPayload(raw) {
  try {
    const value = JSON.parse(String(raw ?? ""));
    return {
      jsonValid: true,
      structuredValid: validateStructuredParse(value),
      value,
    };
  } catch (error) {
    return {
      jsonValid: false,
      structuredValid: false,
      value: null,
      error: String(error?.message || error),
    };
  }
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

function gate(value, threshold, direction = "min") {
  const pass = value == null
    ? false
    : direction === "max"
      ? value <= threshold
      : value >= threshold;
  return { value, threshold, pass };
}

export function summarizeBenchmarkResults({
  records,
  datasetSize,
  model,
  device,
  initMs,
  warmupMs,
  cacheState,
  cacheDeltaMb,
  completionTokens,
  cloudLlmApiCalls = 0,
  generatedAt = new Date().toISOString(),
}) {
  const overall = aggregate(records);
  const slices = {
    core: aggregate(records.filter((record) => record.kind === "core")),
    challenge: aggregate(records.filter((record) => record.kind === "challenge")),
    es: aggregate(records.filter((record) => record.language === "es")),
    en: aggregate(records.filter((record) => record.language === "en")),
  };

  const actionRecords = records.filter((record) => ACTION_INTENT_SET.has(record.expected?.intent));
  const actionIntentMatches = actionRecords.filter((record) =>
    record.structuredValid && record.actual?.intent === record.expected?.intent
  ).length;
  const actionIntentAccuracy = actionRecords.length
    ? round(actionIntentMatches / actionRecords.length)
    : null;

  const latencies = records.map((record) => Number(record.latencyMs)).filter(Number.isFinite);
  const p50 = round(percentile(latencies, 0.5), 0);
  const p95 = round(percentile(latencies, 0.95), 0);
  const mean = latencies.length
    ? round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length, 0)
    : null;

  const quality = {
    structured_valid_rate: gate(overall.structured_valid_rate, QUALITY_GATES.structured_valid_rate),
    intent_accuracy: gate(overall.intent_accuracy, QUALITY_GATES.intent_accuracy),
    action_intent_accuracy: gate(actionIntentAccuracy, QUALITY_GATES.action_intent_accuracy),
    slot_exact_accuracy: gate(overall.slot_exact_accuracy, QUALITY_GATES.slot_exact_accuracy),
  };
  const qualityPass = Object.values(quality).every((item) => item.pass);
  const android = /Android/i.test(device?.userAgent || "");
  const androidLatency = {
    applicable: android,
    p50_ms: p50,
    p95_ms: p95,
    p50_gate: android ? gate(p50, QUALITY_GATES.android_warm_p50_ms, "max") : null,
    p95_gate: android ? gate(p95, QUALITY_GATES.android_warm_p95_ms, "max") : null,
  };
  const latencyPass = !android || Boolean(androidLatency.p50_gate?.pass && androidLatency.p95_gate?.pass);
  const fullDataset = records.length === datasetSize;

  return {
    version: VERSION,
    model,
    device,
    cases: records.length,
    dataset_size: datasetSize,
    full_dataset: fullDataset,
    slices,
    action_intents: {
      cases: actionRecords.length,
      intent_accuracy: actionIntentAccuracy,
    },
    webllm: "0.2.85",
    cloud_llm_api_calls: cloudLlmApiCalls,
    init_ms: round(initMs, 0),
    warmup_inference_ms: round(warmupMs, 0),
    cache_state_hint: cacheState,
    approximate_cache_delta_mb: cacheDeltaMb == null ? null : round(cacheDeltaMb, 1),
    documented_vram_required_mb: model?.vramMb ?? null,
    json_parse_valid_rate: overall.json_parse_valid_rate,
    structured_valid_rate: overall.structured_valid_rate,
    intent_accuracy: overall.intent_accuracy,
    slot_exact_accuracy: overall.slot_exact_accuracy,
    inference_ms: { p50, p95, mean },
    completion_tokens: completionTokens || null,
    failures: records.filter((record) =>
      !record.structuredValid
      || record.actual?.intent !== record.expected?.intent
      || !same(record.actual?.slots, record.expected?.slots)
    ).length,
    gates: {
      quality,
      android_latency: androidLatency,
      evaluation: fullDataset ? "full_dataset" : "sample_only",
      passes_measured_gates: fullDataset ? qualityPass && latencyPass : null,
      contract_rejects_extra_fields: true,
    },
    generated_at: generatedAt,
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalLanguageEvalDataset } from "../src/localLanguage/evalDataset.js";
import {
  CLOUD_BENCHMARK_MODEL,
  buildCloudLanguagePrompt,
  parseCloudLanguagePayload,
  selectCloudBenchmarkCases,
  summarizeCloudBenchmark,
} from "../src/localLanguage/cloudBenchmark.js";

const valid = {
  version: "local_language_v0",
  intent: "recommend_today",
  language: "es",
  confidence: 0.99,
  slots: {
    environment: "home",
    duration_max_minutes: 30,
    intensity_preference: "easy",
    date_reference: null,
    weekday: null,
  },
};

test("CLOUD LANGUAGE BENCHMARK: smoke set covers every intent in Spanish and English", () => {
  const dataset = buildLocalLanguageEvalDataset();
  const sample = selectCloudBenchmarkCases(dataset, "smoke");
  assert.equal(sample.length, 30);
  const keys = new Set(sample.map((row) => `${row.expected.intent}:${row.language}`));
  assert.equal(keys.size, 30);
});

test("CLOUD LANGUAGE BENCHMARK: strict parser accepts only the closed contract", () => {
  assert.equal(parseCloudLanguagePayload(JSON.stringify(valid)).structuredValid, true);
  assert.equal(parseCloudLanguagePayload(JSON.stringify({ ...valid, extra: true })).structuredValid, false);
  assert.equal(parseCloudLanguagePayload(JSON.stringify({
    ...valid,
    slots: { ...valid.slots, weekday: "friday" },
  })).structuredValid, false);
  assert.equal(parseCloudLanguagePayload("not-json").jsonValid, false);
});

test("CLOUD LANGUAGE BENCHMARK: prompt explicitly forbids sports decisions", () => {
  const prompt = buildCloudLanguagePrompt();
  assert.match(prompt, /not a sports coach/i);
  assert.match(prompt, /Do not recommend training/i);
  assert.match(prompt, /extract only slots explicitly stated/i);
});

test("CLOUD LANGUAGE BENCHMARK: summary applies the safety gates and ignores missing latency", () => {
  const records = [
    {
      expected: { intent: "save_recommendation", slots: valid.slots },
      actual: { ...valid, intent: "save_recommendation" },
      kind: "core",
      language: "es",
      jsonValid: true,
      structuredValid: true,
      latencyMs: 120,
    },
    {
      expected: { intent: "save_recommendation", slots: valid.slots },
      actual: null,
      kind: "challenge",
      language: "en",
      jsonValid: false,
      structuredValid: false,
      latencyMs: null,
    },
  ];
  const summary = summarizeCloudBenchmark({
    records,
    datasetSize: 2,
    mode: "full",
    model: CLOUD_BENCHMARK_MODEL,
    inputTokens: 100,
    outputTokens: 10,
  });
  assert.equal(summary.inference_ms.p50, 120);
  assert.equal(summary.action_intents.intent_accuracy, 0.5);
  assert.equal(summary.gates.passes_measured_gates, false);
  assert.equal(summary.pricing_usd_per_million_tokens.input, 0.04);
  assert.equal(summary.pricing_usd_per_million_tokens.output, 0.14);
  assert.equal(summary.estimated_cost_usd, 0.000005);
});


test("CLOUD LANGUAGE BENCHMARK: gateway-only failures do not masquerade as model quality", () => {
  const records = Array.from({ length: 2 }, (_, index) => ({
    expected: { intent: index ? "plan_week" : "greeting", slots: valid.slots },
    actual: null,
    kind: "core",
    language: index ? "en" : "es",
    jsonValid: false,
    structuredValid: false,
    latencyMs: 80 + index,
    raw: null,
    error: "gateway_403: billing_required",
  }));

  const summary = summarizeCloudBenchmark({
    records,
    datasetSize: 222,
    mode: "smoke",
  });

  assert.equal(summary.successful_model_responses, 0);
  assert.equal(summary.quality_gates_evaluated, false);
  assert.equal(summary.gates.quality, null);
  assert.equal(summary.gates.passes_measured_gates, null);
});

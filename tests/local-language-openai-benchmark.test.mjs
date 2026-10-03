import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalLanguageEvalDataset } from "../src/localLanguage/evalDataset.js";
import {
  OPENAI_LANGUAGE_BENCHMARK_MODEL,
  buildOpenAiLanguageInstructions,
  parseOpenAiLanguageOutput,
  selectOpenAiBenchmarkCases,
  summarizeOpenAiBenchmark,
} from "../src/localLanguage/openAiBenchmark.js";

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

test("OPENAI LANGUAGE BENCHMARK: smoke covers every intent in ES and EN", () => {
  const dataset = buildLocalLanguageEvalDataset();
  const sample = selectOpenAiBenchmarkCases(dataset, "smoke");
  assert.equal(sample.length, 30);
  assert.equal(new Set(sample.map((row) => `${row.expected.intent}:${row.language}`)).size, 30);
});

test("OPENAI LANGUAGE BENCHMARK: strict parser accepts only canonical contract", () => {
  assert.equal(parseOpenAiLanguageOutput(JSON.stringify(valid)).structuredValid, true);
  assert.equal(parseOpenAiLanguageOutput(JSON.stringify({ ...valid, extra: true })).structuredValid, false);
  assert.equal(parseOpenAiLanguageOutput(JSON.stringify({
    ...valid,
    slots: { ...valid.slots, weekday: "friday" },
  })).structuredValid, false);
  assert.equal(parseOpenAiLanguageOutput("not-json").jsonValid, false);
});

test("OPENAI LANGUAGE BENCHMARK: instructions forbid sports decisions and invented slots", () => {
  const instructions = buildOpenAiLanguageInstructions();
  assert.match(instructions, /not a sports coach/i);
  assert.match(instructions, /Do not recommend training/i);
  assert.match(instructions, /extract only slots explicitly stated/i);
});

test("OPENAI LANGUAGE BENCHMARK: provider failures do not masquerade as model quality", () => {
  const records = Array.from({ length: 2 }, (_, index) => ({
    expected: { intent: index ? "plan_week" : "greeting", slots: valid.slots },
    actual: null,
    raw: null,
    jsonValid: false,
    structuredValid: false,
    latencyMs: 80 + index,
    error: "openai_401: invalid_api_key",
  }));

  const summary = summarizeOpenAiBenchmark({
    records,
    datasetSize: 222,
    mode: "smoke",
  });

  assert.equal(summary.provider_errors, 2);
  assert.equal(summary.quality_gates_evaluated, false);
  assert.equal(summary.gates.quality, null);
  assert.equal(summary.gates.passes_measured_gates, null);
});

test("OPENAI LANGUAGE BENCHMARK: complete run applies gates, latency and token cost", () => {
  const records = [
    {
      expected: { intent: "save_recommendation", slots: valid.slots },
      actual: { ...valid, intent: "save_recommendation" },
      raw: JSON.stringify(valid),
      jsonValid: true,
      structuredValid: true,
      latencyMs: 120,
      error: null,
    },
  ];

  const summary = summarizeOpenAiBenchmark({
    records,
    datasetSize: 1,
    mode: "full",
    inputTokens: 1000,
    outputTokens: 100,
    reasoningTokens: 0,
  });

  assert.equal(summary.model, OPENAI_LANGUAGE_BENCHMARK_MODEL);
  assert.equal(summary.estimated_cost_usd, 0.00015);
  assert.equal(summary.inference_ms.p50, 120);
  assert.equal(summary.quality_gates_evaluated, true);
  assert.equal(summary.action_intents.intent_accuracy, 1);
});

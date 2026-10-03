import assert from "node:assert/strict";
import test from "node:test";

import { HARNESS_REVISION, VERSION } from "../public/labs/local-language-v0/config.js";
import {
  buildRuntimeFailureArtifact,
  isFatalLocalLanguageRuntimeError,
  parseModelPayload,
  summarizeBenchmarkResults,
  validateStructuredParse,
} from "../public/labs/local-language-v0/benchmark.js";

const valid = (overrides = {}) => ({
  version: VERSION,
  intent: "recommend_today",
  slots: {
    environment: "home",
    duration_max_minutes: 40,
    intensity_preference: "easy",
    date_reference: "today",
    weekday: null,
  },
  language: "es",
  confidence: 0.94,
  ...overrides,
});

test("LOCAL LANGUAGE BENCHMARK: strict validator enforces the same closed structured contract", () => {
  assert.equal(validateStructuredParse(valid()), true);
  assert.equal(validateStructuredParse({ ...valid(), recommendation: "fuerza" }), false);
  assert.equal(validateStructuredParse(valid({ confidence: 1.2 })), false);
  assert.equal(validateStructuredParse(valid({
    slots: { ...valid().slots, date_reference: "weekday", weekday: null },
  })), false);
  assert.equal(validateStructuredParse(valid({
    slots: { ...valid().slots, date_reference: "today", weekday: "friday" },
  })), false);
});

test("LOCAL LANGUAGE BENCHMARK: parseable JSON and contract-valid JSON are measured separately", () => {
  const parseableButInvalid = parseModelPayload(JSON.stringify({ hello: "world" }));
  assert.equal(parseableButInvalid.jsonValid, true);
  assert.equal(parseableButInvalid.structuredValid, false);

  const validPayload = parseModelPayload(JSON.stringify(valid()));
  assert.equal(validPayload.jsonValid, true);
  assert.equal(validPayload.structuredValid, true);

  const broken = parseModelPayload("{");
  assert.equal(broken.jsonValid, false);
  assert.equal(broken.structuredValid, false);
});

test("LOCAL LANGUAGE BENCHMARK: invalid outputs count as failures and action intents have a dedicated gate", () => {
  const expectedAction = {
    intent: "save_recommendation",
    slots: {
      environment: null,
      duration_max_minutes: null,
      intensity_preference: null,
      date_reference: "today",
      weekday: null,
    },
  };
  const actualAction = valid({
    intent: "save_recommendation",
    slots: expectedAction.slots,
  });
  const records = [
    {
      expected: expectedAction,
      actual: actualAction,
      kind: "core",
      language: "es",
      jsonValid: true,
      structuredValid: true,
      latencyMs: 100,
    },
    {
      expected: expectedAction,
      actual: null,
      kind: "challenge",
      language: "en",
      jsonValid: true,
      structuredValid: false,
      latencyMs: 200,
    },
  ];

  const summary = summarizeBenchmarkResults({
    records,
    datasetSize: 2,
    model: { id: "test", vramMb: 1 },
    device: { userAgent: "Desktop" },
    initMs: 10,
    warmupMs: 5,
    cacheState: "first_observed_load_in_this_browser",
    cacheDeltaMb: 1,
    completionTokens: 10,
  });

  assert.equal(summary.harness_revision, HARNESS_REVISION);
  assert.equal(summary.structured_valid_rate, 0.5);
  assert.equal(summary.intent_accuracy, 0.5);
  assert.equal(summary.action_intents.intent_accuracy, 0.5);
  assert.equal(summary.gates.quality.action_intent_accuracy.pass, false);
  assert.equal(summary.gates.passes_measured_gates, false);
});

test("LOCAL LANGUAGE BENCHMARK: partial samples never masquerade as a gate decision", () => {
  const records = Array.from({ length: 24 }, () => ({
    expected: valid(),
    actual: valid(),
    kind: "core",
    language: "es",
    jsonValid: true,
    structuredValid: true,
    latencyMs: 100,
  }));

  const summary = summarizeBenchmarkResults({
    records,
    datasetSize: 222,
    model: { id: "test", vramMb: 1 },
    device: { userAgent: "Android test" },
    initMs: 10,
    warmupMs: 5,
    cacheState: "previously_loaded_in_this_browser",
    cacheDeltaMb: 0,
    completionTokens: 10,
  });

  assert.equal(summary.full_dataset, false);
  assert.equal(summary.gates.evaluation, "sample_only");
  assert.equal(summary.gates.passes_measured_gates, null);
});


test("LOCAL LANGUAGE BENCHMARK: runtime failures are portable artifacts and do not masquerade as quality scores", () => {
  const artifact = buildRuntimeFailureArtifact({
    model: { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", vramMb: 879.04 },
    device: {
      userAgent: "Windows Chrome Intel",
      deviceMemoryGb: 16,
      gpu: { available: true, info: { vendor: "intel" } },
    },
    datasetSize: 222,
    requestedCases: "all",
    stage: "model_init",
    error: new Error("Invalid ShaderModule"),
    cloudLlmApiCalls: 0,
    cacheState: "first_observed_load_in_this_browser",
    generatedAt: "2026-10-03T14:00:00.000Z",
  });

  assert.equal(artifact.summary.harness_revision, HARNESS_REVISION);
  assert.equal(artifact.summary.artifact_type, "runtime_failure");
  assert.equal(artifact.summary.runtime_status, "failed");
  assert.equal(artifact.summary.stage, "model_init");
  assert.equal(artifact.summary.error, "Invalid ShaderModule");
  assert.equal(artifact.summary.fallback, "deterministic");
  assert.equal(artifact.summary.quality_gates_evaluated, false);
  assert.equal(artifact.summary.eligible_on_this_device, false);
  assert.equal(artifact.summary.cloud_llm_api_calls, 0);
  assert.deepEqual(artifact.failures, []);
});


test("LOCAL LANGUAGE BENCHMARK: missing per-case latency is not converted to a fake zero", () => {
  const records = [
    {
      expected: valid(),
      actual: valid(),
      kind: "core",
      language: "es",
      jsonValid: true,
      structuredValid: true,
      latencyMs: 120,
    },
    {
      expected: valid(),
      actual: null,
      kind: "core",
      language: "es",
      jsonValid: false,
      structuredValid: false,
      latencyMs: null,
    },
  ];

  const summary = summarizeBenchmarkResults({
    records,
    datasetSize: 2,
    model: { id: "test", vramMb: 1 },
    device: { userAgent: "Android test" },
    initMs: 10,
    warmupMs: 5,
    cacheState: "previously_loaded_in_this_browser",
    cacheDeltaMb: 0,
    completionTokens: 1,
  });

  assert.equal(summary.inference_ms.p50, 120);
  assert.equal(summary.inference_ms.p95, 120);
  assert.equal(summary.inference_ms.mean, 120);
});

test("LOCAL LANGUAGE BENCHMARK: fatal WebGPU disposal errors are detected", () => {
  assert.equal(
    isFatalLocalLanguageRuntimeError(new Error("Failed to execute 'mapAsync' on 'GPUBuffer': A valid external Instance reference no longer exists.")),
    true,
  );
  assert.equal(
    isFatalLocalLanguageRuntimeError(new Error("The current Object has already been disposed")),
    true,
  );
  assert.equal(isFatalLocalLanguageRuntimeError(new Error("temporary malformed JSON")), false);
});

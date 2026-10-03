import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_LANGUAGE_INTENTS,
  LOCAL_LANGUAGE_VERSION,
  normalizeLocalLanguageParse,
} from "../src/localLanguage/contract.js";
import { buildDeterministicLanguageParse } from "../src/localLanguage/deterministicFallback.js";
import { buildLocalLanguageChallengeDataset, buildLocalLanguageCoreEvalDataset, buildLocalLanguageEvalDataset } from "../src/localLanguage/evalDataset.js";
import { routeLocalLanguage } from "../src/localLanguage/router.js";
import { serializeLocalLanguageBrowserDataset } from "../scripts/local-language/export-eval-dataset.mjs";

const validParse = (overrides = {}) => ({
  version: LOCAL_LANGUAGE_VERSION,
  intent: "recommend_today",
  slots: {
    environment: "home",
    duration_max_minutes: 40,
    intensity_preference: "easy",
    date_reference: null,
    weekday: null,
  },
  language: "es",
  confidence: 0.93,
  ...overrides,
});

test("LOCAL LANGUAGE V0: eval dataset is systematic, bilingual and covers the semantic contract", () => {
  const dataset = buildLocalLanguageEvalDataset();
  assert.ok(dataset.length >= 100, `expected >=100 generated cases, got ${dataset.length}`);
  assert.equal(new Set(dataset.map((item) => `${item.language}:${item.text.toLowerCase()}`)).size, dataset.length);
  assert.deepEqual(new Set(dataset.map((item) => item.language)), new Set(["es", "en"]));

  const intents = new Set(dataset.map((item) => item.expected.intent));
  for (const intent of LOCAL_LANGUAGE_INTENTS) assert.ok(intents.has(intent), `missing intent: ${intent}`);
});

test("LOCAL LANGUAGE V0: eval expectations preserve slots that are explicit in the utterance", () => {
  const dataset = buildLocalLanguageEvalDataset();
  const byText = new Map(dataset.map((item) => [item.text, item.expected.slots]));
  assert.equal(byText.get("¿Qué entreno hoy?")?.date_reference, "today");
  assert.equal(byText.get("What do I have this week?")?.date_reference, "this_week");
  assert.equal(byText.get("¿Qué equipamiento hay en casa?")?.environment, "home");
  assert.equal(byText.get("How was yesterday's workout?")?.date_reference, "yesterday");
});

test("LOCAL LANGUAGE V0: target free-language example becomes intent plus slots without a sports decision", () => {
  const parsed = buildDeterministicLanguageParse("Hazme algo suave en casa, tengo 40 minutos");
  assert.equal(parsed.intent, "recommend_today");
  assert.equal(parsed.slots.environment, "home");
  assert.equal(parsed.slots.duration_max_minutes, 40);
  assert.equal(parsed.slots.intensity_preference, "easy");
  assert.equal("recommendation" in parsed, false);
  assert.equal("session" in parsed, false);
});

test("LOCAL LANGUAGE V0: current deterministic today intent remains a valid fallback", () => {
  const parsed = buildDeterministicLanguageParse("¿Qué entreno hoy?");
  assert.equal(parsed.intent, "recommend_today");
  assert.equal(parsed.slots.date_reference, "today");
  assert.equal(parsed.confidence, 1);
});

test("LOCAL LANGUAGE V0: upcoming Coach actions are semantics only and extract narrow slots", () => {
  assert.deepEqual(
    buildDeterministicLanguageParse("Muévelo al viernes").slots,
    {
      environment: null,
      duration_max_minutes: null,
      intensity_preference: null,
      date_reference: "weekday",
      weekday: "friday",
    },
  );
  assert.equal(buildDeterministicLanguageParse("Muévelo al viernes").intent, "move_plan");
  assert.equal(buildDeterministicLanguageParse("Mañana no puedo").intent, "unavailability");
  assert.equal(buildDeterministicLanguageParse("Hazlo en casa").intent, "adapt_environment");
  assert.equal(buildDeterministicLanguageParse("Hazlo de 30 minutos").intent, "adapt_duration");
});

test("LOCAL LANGUAGE V0: structured output rejects unsupported values before they can reach ENQIDU", () => {
  assert.equal(normalizeLocalLanguageParse(validParse({ intent: "invent_workout" })), null);
  assert.equal(normalizeLocalLanguageParse(validParse({ confidence: 1.2 })), null);
  assert.equal(normalizeLocalLanguageParse(validParse({ slots: { ...validParse().slots, environment: "garage" } })), null);
  assert.equal(normalizeLocalLanguageParse(validParse({ slots: { ...validParse().slots, date_reference: "weekday", weekday: null } })), null);
});

test("LOCAL LANGUAGE V0: confident valid local parse is accepted", async () => {
  const result = await routeLocalLanguage({
    message: "Hazme algo suave en casa, tengo 40 minutos",
    localParser: async () => validParse(),
  });
  assert.equal(result.source, "local_model");
  assert.equal(result.fallback_reason, null);
  assert.equal(result.parse.intent, "recommend_today");
});

test("LOCAL LANGUAGE V0: low confidence, invalid JSON semantics and model errors fail closed to deterministic routing", async () => {
  const low = await routeLocalLanguage({
    message: "¿Qué entreno hoy?",
    localParser: async () => validParse({ confidence: 0.4 }),
  });
  assert.equal(low.source, "deterministic_fallback");
  assert.equal(low.fallback_reason, "low_confidence");
  assert.equal(low.parse.intent, "recommend_today");

  const invalid = await routeLocalLanguage({
    message: "¿Qué entreno hoy?",
    localParser: async () => ({ hello: "world" }),
  });
  assert.equal(invalid.fallback_reason, "invalid_structured_output");

  const failed = await routeLocalLanguage({
    message: "¿Qué entreno hoy?",
    localParser: async () => { throw new Error("webgpu_lost"); },
  });
  assert.equal(failed.fallback_reason, "local_parser_error");
});

test("LOCAL LANGUAGE V0: local parser timeout fails closed", async () => {
  const result = await routeLocalLanguage({
    message: "¿Qué entreno hoy?",
    localParser: () => new Promise((resolve) => setTimeout(() => resolve(validParse()), 50)),
    timeoutMs: 5,
  });
  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.fallback_reason, "local_language_timeout");
});


test("LOCAL LANGUAGE V0: deterministic fallback closes the two baseline equipment-query gaps", () => {
  assert.equal(buildDeterministicLanguageParse("¿Con qué puedo entrenar?").intent, "equipment_query");
  assert.equal(buildDeterministicLanguageParse("What can I train with?").intent, "equipment_query");
});

test("LOCAL LANGUAGE V0: challenge slice is distinct, bilingual and materially expands the eval", () => {
  const core = buildLocalLanguageCoreEvalDataset();
  const challenge = buildLocalLanguageChallengeDataset();
  assert.ok(challenge.length >= 80, `expected >=80 challenge cases, got ${challenge.length}`);
  assert.deepEqual(new Set(challenge.map((item) => item.kind)), new Set(["challenge"]));
  assert.deepEqual(new Set(challenge.map((item) => item.language)), new Set(["es", "en"]));
  assert.equal(buildLocalLanguageEvalDataset().length, core.length + challenge.length);
});

test("LOCAL LANGUAGE V0: browser benchmark dataset serializes from the canonical eval source", () => {
  const expected = buildLocalLanguageEvalDataset();
  const browserDataset = JSON.parse(serializeLocalLanguageBrowserDataset());
  assert.deepEqual(browserDataset, expected);
});


test("LOCAL LANGUAGE V0: deterministic fallback remains perfect on the core semantic slice", () => {
  for (const item of buildLocalLanguageCoreEvalDataset()) {
    const parsed = buildDeterministicLanguageParse(item.text);
    assert.equal(parsed.intent, item.expected.intent, `intent mismatch for: ${item.text}`);
    assert.deepEqual(parsed.slots, item.expected.slots, `slot mismatch for: ${item.text}`);
  }
});

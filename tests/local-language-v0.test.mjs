import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_LANGUAGE_INTENTS,
  LOCAL_LANGUAGE_VERSION,
  normalizeLocalLanguageParse,
} from "../src/localLanguage/contract.js";
import { buildDeterministicLanguageParse } from "../src/localLanguage/deterministicFallback.js";
import { buildLocalLanguageEvalDataset } from "../src/localLanguage/evalDataset.js";
import { routeLocalLanguage } from "../src/localLanguage/router.js";

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

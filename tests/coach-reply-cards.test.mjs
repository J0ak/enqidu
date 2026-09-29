import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("coach-reply uses deterministic ENQIDU responses by default and gates the LLM", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");

  assert.match(source, /buildDeterministicCoachReply\(\{ message, context \}\)/);
  assert.match(source, /OPENAI_COACH_ENABLED/);
  assert.match(source, /if \(!llmEnabled \|\| intents\.planToday\)[\s\S]*response_mode: "deterministic"[\s\S]*llm_used: false/);
  assert.match(source, /response_mode: "llm"[\s\S]*llm_used: true/);

  const deterministicGateIndex = source.indexOf("if (!llmEnabled || intents.planToday)");
  const openAiFetchIndex = source.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(deterministicGateIndex >= 0);
  assert.ok(openAiFetchIndex > deterministicGateIndex);
  assert.equal((source.match(/api\.openai\.com\/v1\/responses/g) || []).length, 1);
});

test("today's training intent returns before the OpenAI call even when its optional flag is on", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  const deterministicGateIndex = source.indexOf("if (!llmEnabled || intents.planToday)");
  const openAiFetchIndex = source.indexOf('fetch("https://api.openai.com/v1/responses"');

  assert.ok(deterministicGateIndex >= 0);
  assert.ok(openAiFetchIndex > deterministicGateIndex);
  assert.match(source.slice(deterministicGateIndex, openAiFetchIndex), /response_mode: "deterministic"/);
  assert.match(source.slice(deterministicGateIndex, openAiFetchIndex), /llm_used: false/);
  assert.match(source.slice(deterministicGateIndex, openAiFetchIndex), /usage: null/);
});

test("coach-reply preserves deterministic answers if the optional LLM path fails", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");

  assert.match(source, /answer: deterministic\.answer[\s\S]*error: "openai_api_key_missing"/);
  assert.match(source, /answer: deterministic\.answer[\s\S]*error: "openai_request_failed"/);
  assert.match(source, /answer: deterministic\.answer[\s\S]*error: "openai_empty_response"/);
  assert.match(source, /response_mode: "deterministic_fallback"/);
});


test("coach-reply resolves yesterday against the previous calendar date before querying context", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");

  assert.match(source, /const requestDate = body\.date \|\| new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(source, /intents\.yesterday && !intents\.period[\s\S]*shiftIsoDate\(requestDate, -1\)/);
  assert.match(source, /p_date: contextDate/);
});


test("coach-reply loads today's RLS-protected planned sessions before building the deterministic reply", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");

  assert.match(source, /from\("planned_training_sessions"\)/);
  assert.match(source, /from\("planned_session_blocks"\)/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.eq\("planned_date", date\)/);
  assert.match(source, /context\.planned_training = intents\.planToday[\s\S]*loadPlannedTraining\(db, userId, contextDate\)/);
  assert.match(source, /buildDeterministicCoachReply\(\{ message, context \}\)/);
});


test("frontend sends the local calendar date instead of UTC for Coach today/ayer semantics", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  assert.match(source, /getLocalCalendarDate/);
  assert.match(source, /date: date \|\| getLocalCalendarDate\(\)/);
  assert.doesNotMatch(source, /date: date \|\| new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});


test("coach-reply loads only authenticated active athlete constraints for recommendation context", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("coach_athlete_constraints"\)/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.eq\("active", true\)/);
  assert.match(source, /context\.recommendation_context = \{[\s\S]*loadRecommendationConstraints\(db, userId\)/);
});

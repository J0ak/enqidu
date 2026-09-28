import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("coach-reply uses deterministic ENQIDU responses by default and gates the LLM", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");

  assert.match(source, /buildDeterministicCoachReply\(\{ message, context \}\)/);
  assert.match(source, /OPENAI_COACH_ENABLED/);
  assert.match(source, /if \(!llmEnabled\)[\s\S]*response_mode: "deterministic"[\s\S]*llm_used: false/);
  assert.match(source, /response_mode: "llm"[\s\S]*llm_used: true/);

  const deterministicGateIndex = source.indexOf("if (!llmEnabled)");
  const openAiFetchIndex = source.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(deterministicGateIndex >= 0);
  assert.ok(openAiFetchIndex > deterministicGateIndex);
  assert.equal((source.match(/api\.openai\.com\/v1\/responses/g) || []).length, 1);
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

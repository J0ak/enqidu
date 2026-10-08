import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("coach-reply uses deterministic ENQIDU responses by default and gates the LLM", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");

  assert.match(source, /buildDeterministicCoachReply\(\{ message, context \}\)/);
  assert.match(source, /OPENAI_COACH_ENABLED/);
  assert.match(source, /if \(!llmEnabled \|\| intents\.planToday \|\| intents\.trend \|\| intents\.weekPlan \|\| intents\.recovery \|\| intents\.closedLoop\)[\s\S]*response_mode: "deterministic"[\s\S]*llm_used: false/);
  assert.match(source, /response_mode: "llm"[\s\S]*llm_used: true/);

  const deterministicGateIndex = source.indexOf("if (!llmEnabled || intents.planToday || intents.trend || intents.weekPlan || intents.recovery || intents.closedLoop)");
  const openAiFetchIndex = source.indexOf("requestOpenAiResponses({");
  assert.ok(deterministicGateIndex >= 0);
  assert.ok(openAiFetchIndex > deterministicGateIndex);
  assert.equal((source.match(/api\.openai\.com\/v1\/responses/g) || []).length, 0);
  assert.match(source, /requestOpenAiResponses/);
});

test("today's training intent returns before the OpenAI call even when its optional flag is on", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  const deterministicGateIndex = source.indexOf("if (!llmEnabled || intents.planToday || intents.trend || intents.weekPlan || intents.recovery || intents.closedLoop)");
  const openAiFetchIndex = source.indexOf("requestOpenAiResponses({");

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

  assert.match(source, /const profileTimezone = await loadUserTimezone\(db, userId\)/);
  assert.match(source, /resolveUserCalendar\(\{[\s\S]*profileTimezone,[\s\S]*clientTimezone: body\.client_timezone/);
  assert.match(source, /const requestDate = calendar\.date/);
  assert.match(source, /intents\.yesterday && !intents\.period[\s\S]*shiftIsoDate\(requestDate, -1\)/);
  assert.match(source, /p_date: contextDate/);
  assert.match(source, /context\.request = \{[\s\S]*date: contextDate,[\s\S]*reference_date: requestDate/);
  assert.doesNotMatch(source, /context\.request = \{ \.\.\.\(context\.request \|\| \{\}\), date: requestDate \}/);
});


test("coach-reply loads today's RLS-protected planned sessions before building the deterministic reply", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");

  const domain = await readFile(new URL("../src/enqiduTools/readTools.js", import.meta.url), "utf8");
  assert.match(domain, /from\("planned_training_sessions"\)/);
  assert.match(domain, /from\("planned_session_blocks"\)/);
  assert.match(domain, /\.eq\("user_id", userId\)/);
  assert.match(domain, /planRows\(calendar\.date, calendar\.date\)/);
  assert.match(source, /intents\.planToday \|\| intents\.healthTraining[\s\S]*tool: "get_today_plan"/);
  assert.match(source, /await tools\.executeMany\(requests\)/);
  assert.match(source, /applyToolResultsToCoachContext\(context, toolResults\)/);
  assert.match(source, /buildDeterministicCoachReply\(\{ message, context \}\)/);
});


test("frontend does not impose the browser calendar date on Coach relative-day semantics", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  assert.match(source, /date: date \|\| null/);
  assert.match(source, /date_source: date \? "explicit" : "profile_timezone"/);
  assert.match(source, /client_timezone: getClientCalendarTimezone\(\)/);
  assert.doesNotMatch(source, /date: date \|\| getLocalCalendarDate\(\)/);
});


test("coach-reply loads only authenticated active athlete constraints for recommendation context", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  const domain = await readFile(new URL("../src/enqiduTools/readTools.js", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../src/enqiduTools/coachAdapter.js", import.meta.url), "utf8");
  assert.match(domain, /from\("coach_athlete_constraints"\)/);
  assert.match(domain, /\.eq\("user_id", userId\)\.eq\("active", true\)/);
  assert.match(source, /tool: "get_athlete_context"/);
  assert.match(adapter, /context\.recommendation_context = \{ constraints: data\.constraints \}/);
});


test("coach-reply uses elapsed trend ranges and loads only comparable periods", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  assert.match(source, /buildTrainingTrendRanges/);
  assert.match(source, /get_ai_training_period_summary/);
  assert.match(source, /intents\.trend && currentFrom && currentTo[\s\S]*buildTrainingTrendRanges/);
  assert.match(source, /currentNeedsReload[\s\S]*loadTrainingPeriod/);
  assert.match(source, /partial_current_period: trendRanges\.partial_current_period/);
});

test("trend intent returns before the optional OpenAI call", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  const deterministicGateIndex = source.indexOf("if (!llmEnabled || intents.planToday || intents.trend || intents.weekPlan || intents.recovery || intents.closedLoop)");
  const openAiFetchIndex = source.indexOf("requestOpenAiResponses({");
  assert.ok(deterministicGateIndex >= 0);
  assert.ok(openAiFetchIndex > deterministicGateIndex);
  assert.match(source.slice(deterministicGateIndex, openAiFetchIndex), /response_mode: "deterministic"/);
  assert.match(source.slice(deterministicGateIndex, openAiFetchIndex), /llm_used: false/);
  assert.match(source.slice(deterministicGateIndex, openAiFetchIndex), /usage: null/);
});


test("coach-reply loads weekly planning only for weekly-plan intent", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  const domain = await readFile(new URL("../src/enqiduTools/readTools.js", import.meta.url), "utf8");
  assert.match(domain, /PLAN_SELECT = .*linked_completed_session_id/);
  assert.match(domain, /from\("weekly_plans"\)[\s\S]*weekly_focus/);
  assert.match(source, /if \(intents\.weekPlan\) requests\.push\(\{ tool: "get_week_plan"/);
});


test("coach-reply exposes the canonical request date and timezone for QA/debugging", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  assert.match(source, /request_date: requestDate/);
  assert.match(source, /calendar_timezone: calendar\.timezone/);
  assert.match(source, /date_source: calendar\.source/);
});

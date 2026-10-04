import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getEnqiduTool } from "../src/coachTools/catalog.js";
import { detectEnqiduFastPathCommand } from "../src/coachTools/fastPath.js";
import { scalePlannedBlockDurations } from "../src/coachTools/planActions.js";

test("COACH DURATION: explicit phrases resolve to the narrow write tool", () => {
  const cases = [
    ["Hazlo de 30 minutos", 30],
    ["Déjalo a 45 min", 45],
    ["Ajústalo en 60 minutos", 60],
    ["Solo tengo 25 minutos", 25],
    ["Make it 40 minutes", 40],
    ["I only have 35 min", 35],
  ];

  for (const [phrase, minutes] of cases) {
    const result = detectEnqiduFastPathCommand(phrase);
    assert.equal(result?.tool, "adapt_session_duration", phrase);
    assert.equal(result?.arguments?.duration_minutes, minutes, phrase);
    assert.equal(result?.explicit_user_command, true, phrase);
    assert.equal(result?.source, "deterministic_fast_path", phrase);
  }
});

test("COACH DURATION: ambiguous, compound and out-of-range requests fail closed", () => {
  for (const phrase of [
    "Quizá déjalo en 30 minutos",
    "Hazlo de 30 minutos y en casa",
    "No lo dejes en 30 minutos",
    "Hazlo de 5 minutos",
    "Hazlo de 240 minutos",
    "Hazlo más corto",
  ]) {
    assert.equal(detectEnqiduFastPathCommand(phrase), null, phrase);
  }
});

test("COACH DURATION: scaler preserves block structure and sums exactly to target minutes", () => {
  const blocks = [
    { id: "a", block_order: 1, title: "Warm-up", planned_duration_seconds: 600 },
    { id: "b", block_order: 2, title: "Main", planned_duration_seconds: 1500 },
    { id: "c", block_order: 3, title: "Cooldown", planned_duration_seconds: 600 },
  ];

  const scaled = scalePlannedBlockDurations(blocks, 30);
  assert.deepEqual(scaled.map((block) => block.id), ["a", "b", "c"]);
  assert.deepEqual(scaled.map((block) => block.duration_minutes), [7, 16, 7]);
  assert.equal(scaled.reduce((sum, block) => sum + block.duration_minutes, 0), 30);
  assert.equal(scaled.reduce((sum, block) => sum + block.duration_seconds, 0), 1800);
});

test("COACH DURATION: scaler is deterministic and rejects unsafe structures", () => {
  const blocks = [
    { id: "a", block_order: 1, planned_duration_seconds: 600 },
    { id: "b", block_order: 2, planned_duration_seconds: 600 },
  ];

  assert.deepEqual(
    scalePlannedBlockDurations(blocks, 31),
    scalePlannedBlockDurations(blocks, 31),
  );
  assert.equal(scalePlannedBlockDurations([], 30), null);
  assert.equal(scalePlannedBlockDurations([{ id: "", planned_duration_seconds: 600 }], 30), null);
  assert.equal(scalePlannedBlockDurations([{ id: "a", planned_duration_seconds: 0 }], 30), null);
  assert.equal(scalePlannedBlockDurations(blocks, 5), null);
  assert.equal(scalePlannedBlockDurations(blocks, 181), null);
});

test("COACH DURATION: shared tool contract requires source date and bounded integer duration", () => {
  const definition = getEnqiduTool("adapt_session_duration");
  assert.equal(definition?.access, "write");
  assert.equal(definition?.explicit_user_command, true);
  assert.equal(definition?.server_validated, true);
  assert.deepEqual(definition?.parameters?.required, ["source_date", "duration_minutes"]);
  assert.deepEqual(definition?.parameters?.properties?.duration_minutes, {
    type: "integer",
    minimum: 10,
    maximum: 180,
  });
  assert.equal(definition?.parameters?.additionalProperties, false);
});

test("COACH DURATION: client sends only source date, target duration and client timezone", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function adaptCoachPlannedSessionDuration");
  assert.ok(start >= 0);
  const payloadStart = source.indexOf("const payload = {", start);
  const invokeStart = source.indexOf('supabase.functions.invoke("coach-plan-action"', payloadStart);
  const block = source.slice(payloadStart, invokeStart);
  assert.match(block, /action: "adapt_session_duration"/);
  assert.match(block, /source_date: sourceDate \|\| null/);
  assert.match(block, /duration_minutes: durationMinutes \?\? null/);
  assert.match(block, /client_timezone: getClientCalendarTimezone\(\)/);
  assert.doesNotMatch(block, /user_id:|planned_session_id:|blocks:|status:/);
});

test("COACH DURATION: server derives block durations and never calls OpenAI", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  const start = source.indexOf('if (action === "adapt_session_duration")');
  const end = source.indexOf('if (action === "adapt_session_environment")', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /isPlanDateOnOrAfter\(sourceDate, calendar\.date\)/);
  assert.match(block, /sourceSession\.source !== "enkidu_coach"/);
  assert.match(block, /loadPlannedBlocks\(userDb, sourceSession\.id\)/);
  assert.match(block, /scalePlannedBlockDurations\(blocks, targetDurationMinutes\)/);
  assert.match(block, /adminDb\.rpc\("adapt_coach_planned_session_duration"/);
  assert.match(block, /response_mode: "deterministic_action"/);
  assert.match(block, /llm_used: false/);
  assert.match(block, /usage: null/);
  assert.doesNotMatch(block, /api\.openai\.com/);
});

test("COACH DURATION: migration validates exact block set and exact duration sum before writes", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261004090000_adapt_coach_planned_session_duration.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /security invoker/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /v_source <> 'enkidu_coach'/i);
  assert.match(sql, /v_current_block_count <> v_payload_block_count/i);
  assert.match(sql, /count\(distinct value ->> 'id'\)/i);
  assert.match(sql, /v_total_seconds <> p_duration_minutes \* 60/i);
  assert.match(sql, /status = 'modified'/i);
  assert.match(sql, /grant update \(planned_duration_seconds\)/i);
  assert.match(sql, /revoke execute on function public\.adapt_coach_planned_session_duration[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.adapt_coach_planned_session_duration[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /security definer/i);
});

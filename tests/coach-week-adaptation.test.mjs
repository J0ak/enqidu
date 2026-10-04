import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getEnqiduTool, toMcpToolDescriptors, toOpenAIResponsesTools } from "../src/coachTools/catalog.js";
import { detectEnqiduFastPathCommand } from "../src/coachTools/fastPath.js";
import {
  planRemainingWeekReschedule,
  resolveRemainingWeekEndDate,
} from "../src/coachTools/planActions.js";

test("COACH WEEK: resolves the current week end as Sunday", () => {
  assert.equal(resolveRemainingWeekEndDate("2026-10-05"), "2026-10-11");
  assert.equal(resolveRemainingWeekEndDate("2026-10-10"), "2026-10-11");
  assert.equal(resolveRemainingWeekEndDate("2026-10-11"), "2026-10-11");
  assert.equal(resolveRemainingWeekEndDate("invalid"), null);
});

test("COACH WEEK: moves an ENQIDU plan off an unavailable day to the next free later date", () => {
  const result = planRemainingWeekReschedule({
    fromDate: "2026-10-05",
    toDate: "2026-10-11",
    unavailableDates: ["2026-10-06"],
    sessions: [
      {
        id: "plan-a",
        planned_date: "2026-10-06",
        title: "Fuerza",
        source: "enkidu_coach",
        status: "planned",
        linked_completed_session_id: null,
      },
      {
        id: "plan-b",
        planned_date: "2026-10-07",
        title: "Natación",
        source: "enkidu_coach",
        status: "planned",
        linked_completed_session_id: null,
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    from_date: "2026-10-05",
    to_date: "2026-10-11",
    moves: [{
      planned_session_id: "plan-a",
      title: "Fuerza",
      source_date: "2026-10-06",
      target_date: "2026-10-08",
    }],
  });
});

test("COACH WEEK: never moves non-ENQIDU or completed plans automatically", () => {
  const external = planRemainingWeekReschedule({
    fromDate: "2026-10-05",
    toDate: "2026-10-11",
    unavailableDates: ["2026-10-06"],
    sessions: [{
      id: "external",
      planned_date: "2026-10-06",
      source: "manual",
      status: "planned",
      linked_completed_session_id: null,
    }],
  });
  assert.equal(external.ok, false);
  assert.equal(external.error, "unsupported_plan_source");

  const completed = planRemainingWeekReschedule({
    fromDate: "2026-10-05",
    toDate: "2026-10-11",
    unavailableDates: ["2026-10-06"],
    sessions: [{
      id: "done",
      planned_date: "2026-10-06",
      source: "enkidu_coach",
      status: "planned",
      linked_completed_session_id: "completed-id",
    }],
  });
  assert.equal(completed.ok, false);
  assert.equal(completed.error, "source_plan_not_adaptable");
});

test("COACH WEEK: fails closed when no same-week capacity remains", () => {
  const result = planRemainingWeekReschedule({
    fromDate: "2026-10-09",
    toDate: "2026-10-11",
    unavailableDates: ["2026-10-09"],
    sessions: [
      { id: "a", planned_date: "2026-10-09", source: "enkidu_coach", status: "planned" },
      { id: "b", planned_date: "2026-10-10", source: "enkidu_coach", status: "planned" },
      { id: "c", planned_date: "2026-10-11", source: "enkidu_coach", status: "planned" },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "remaining_week_capacity_exhausted");
  assert.deepEqual(result.moves, []);
});

test("COACH WEEK: exact ES/EN commands use the deterministic write tool and ambiguous language fails closed", () => {
  for (const phrase of [
    "Adapta el resto de la semana",
    "Reorganiza lo que queda de semana",
    "Replanifica el resto de la semana",
    "Adapt the rest of the week",
    "Replan the rest of the week",
  ]) {
    const command = detectEnqiduFastPathCommand(phrase);
    assert.equal(command?.tool, "adapt_remaining_week", phrase);
    assert.equal(command?.explicit_user_command, true, phrase);
    assert.equal(command?.source, "deterministic_fast_path", phrase);
  }

  for (const phrase of [
    "No adaptes el resto de la semana",
    "Quizá adapta el resto de la semana",
    "Adapta la semana que viene",
    "Reorganiza mis entrenamientos",
  ]) {
    assert.equal(detectEnqiduFastPathCommand(phrase), null, phrase);
  }
});

test("COACH WEEK: App/OpenAI and future MCP share the same no-argument contract", () => {
  const definition = getEnqiduTool("adapt_remaining_week");
  assert.equal(definition?.access, "write");
  assert.equal(definition?.explicit_user_command, true);
  assert.equal(definition?.server_validated, true);
  assert.deepEqual(definition?.parameters?.required, []);
  assert.deepEqual(definition?.parameters?.properties, {});
  assert.equal(definition?.parameters?.additionalProperties, false);

  const openai = toOpenAIResponsesTools().find((item) => item.name === "adapt_remaining_week");
  const mcp = toMcpToolDescriptors().find((item) => item.name === "adapt_remaining_week");
  assert.ok(openai);
  assert.ok(mcp);
  assert.deepEqual(openai.parameters, mcp.inputSchema);
});

test("COACH WEEK: browser client sends no user-controlled dates or move list", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function adaptCoachRemainingWeek");
  assert.ok(start >= 0);
  const payloadStart = source.indexOf("const payload = {", start);
  const invokeStart = source.indexOf('supabase.functions.invoke("coach-plan-action"', payloadStart);
  const block = source.slice(payloadStart, invokeStart);

  assert.match(block, /action: "adapt_remaining_week"/);
  assert.match(block, /client_timezone: getClientCalendarTimezone\(\)/);
  assert.doesNotMatch(block, /from_date:|to_date:|moves:|user_id:/);
});

test("COACH WEEK: server derives the week from profile timezone and remains LLM-free", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  const start = source.indexOf('if (action === "adapt_remaining_week")');
  const end = source.indexOf('if (action === "cancel_planned_session")', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /resolveRemainingWeekEndDate\(calendar\.date\)/);
  assert.match(block, /loadPlannedTrainingRange/);
  assert.match(block, /loadTrainingAvailabilityRange/);
  assert.match(block, /planRemainingWeekReschedule/);
  assert.match(block, /adminDb\.rpc\("adapt_coach_remaining_week"/);
  assert.match(block, /response_mode: "deterministic_action"/);
  assert.match(block, /llm_used: false/);
  assert.match(block, /usage: null/);
  assert.doesNotMatch(block, /api\.openai\.com/);
});

test("COACH WEEK: migration is atomic, service-role-only and does not delete plan history", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261004101500_adapt_coach_remaining_week.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /security invoker/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /Validation pass: no writes occur until every move is known to be safe/i);
  assert.match(sql, /set planned_date = v_target_date[\s\S]*status = 'rescheduled'/i);
  assert.match(sql, /source <> 'enkidu_coach'/i);
  assert.match(sql, /linked_completed_session_id is not null/i);
  assert.match(sql, /revoke execute on function public\.adapt_coach_remaining_week[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.adapt_coach_remaining_week[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /delete from public\.planned_training_sessions/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[\s\S]*to authenticated/i);
});

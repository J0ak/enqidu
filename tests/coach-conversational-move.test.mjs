import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findLatestPlannedTrainingContext,
  markLatestPlannedTrainingMoved,
} from "../src/coachContext/coachCardsView.js";
import { getEnqiduTool } from "../src/coachTools/catalog.js";
import { detectEnqiduFastPathCommand } from "../src/coachTools/fastPath.js";
import {
  isPlanDateOnOrAfter,
  resolveNextWeekdayDate,
} from "../src/coachTools/planActions.js";

test("COACH MOVE: explicit move phrases resolve to the narrow write tool", () => {
  const cases = [
    ["Muévelo al viernes", "friday"],
    ["Pásalo al miércoles", "wednesday"],
    ["Mejor el domingo, cámbialo", "sunday"],
    ["Move it to Friday", "friday"],
    ["Reschedule it to Monday", "monday"],
    ["Thursday instead, shift it", "thursday"],
  ];

  for (const [phrase, weekday] of cases) {
    const result = detectEnqiduFastPathCommand(phrase);
    assert.equal(result?.tool, "move_planned_session", phrase);
    assert.equal(result?.arguments?.target_weekday, weekday, phrase);
    assert.equal(result?.explicit_user_command, true, phrase);
    assert.equal(result?.source, "deterministic_fast_path", phrase);
  }
});

test("COACH MOVE: ambiguous or negative text fails closed", () => {
  for (const phrase of [
    "No lo muevas al viernes",
    "Muévelo",
    "El viernes quizá",
    "Muévelo al viernes y cancela el domingo",
    "Cambia la semana",
  ]) {
    assert.equal(detectEnqiduFastPathCommand(phrase), null, phrase);
  }
});

test("COACH MOVE: date resolver always selects the next weekday after the source", () => {
  assert.equal(resolveNextWeekdayDate("2026-10-03", "friday"), "2026-10-09");
  assert.equal(resolveNextWeekdayDate("2026-10-09", "friday"), "2026-10-16");
  assert.equal(resolveNextWeekdayDate("2026-10-09", "monday"), "2026-10-12");
  assert.equal(resolveNextWeekdayDate("invalid", "friday"), null);
  assert.equal(resolveNextWeekdayDate("2026-10-03", "funday"), null);
  assert.equal(isPlanDateOnOrAfter("2026-10-03", "2026-10-03"), true);
  assert.equal(isPlanDateOnOrAfter("2026-10-02", "2026-10-03"), false);
});

test("COACH MOVE: tool contract requires source date and target weekday", () => {
  const definition = getEnqiduTool("move_planned_session");
  assert.equal(definition?.access, "write");
  assert.equal(definition?.explicit_user_command, true);
  assert.equal(definition?.server_validated, true);
  assert.deepEqual(definition?.parameters?.required, ["source_date", "target_weekday"]);
  assert.equal(definition?.parameters?.additionalProperties, false);
});

test("COACH MOVE: conversation keeps the latest planned card as move context", () => {
  const messages = [
    {
      role: "assistant",
      content: "Hoy tienes planificado...",
      cards: [{
        id: "planned_training_today",
        date: "2026-10-03",
        title: "Fuerza",
        subtitle: "2026-10-03",
        badge: "Strength",
        actions: [],
      }],
    },
  ];

  assert.deepEqual(findLatestPlannedTrainingContext(messages), {
    date: "2026-10-03",
    title: "Fuerza",
  });

  const moved = markLatestPlannedTrainingMoved(messages, {
    sourceDate: "2026-10-03",
    targetDate: "2026-10-09",
  });
  assert.equal(moved[0].cards[0].date, "2026-10-09");
  assert.equal(moved[0].cards[0].subtitle, "2026-10-09");
  assert.equal(moved[0].cards[0].badge, "Reprogramada");
  assert.deepEqual(findLatestPlannedTrainingContext(moved), {
    date: "2026-10-09",
    title: "Fuerza",
  });
});

test("COACH MOVE: client sends only source date, weekday and client timezone", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function moveCoachPlannedSession");
  assert.ok(start >= 0);
  const payloadStart = source.indexOf("const payload = {", start);
  const invokeStart = source.indexOf('supabase.functions.invoke("coach-plan-action"', payloadStart);
  const block = source.slice(payloadStart, invokeStart);
  assert.match(block, /action: "move_planned_session"/);
  assert.match(block, /source_date: sourceDate \|\| null/);
  assert.match(block, /target_weekday: targetWeekday \|\| null/);
  assert.match(block, /client_timezone: getClientCalendarTimezone\(\)/);
  assert.doesNotMatch(block, /planned_session_id:|title:|blocks:/);
});

test("COACH MOVE: server derives target date and never calls OpenAI", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  assert.match(source, /action === "move_planned_session"/);
  assert.match(source, /resolveNextWeekdayDate\(sourceDate, targetWeekday\)/);
  assert.match(source, /isPlanDateOnOrAfter\(sourceDate, calendar\.date\)/);
  assert.match(source, /adminDb\.rpc\("move_coach_planned_session"/);
  assert.doesNotMatch(source, /api\.openai\.com/);
  assert.match(source, /response_mode: "deterministic_action"/);
  assert.match(source, /llm_used: false/);
  assert.match(source, /usage: null/);
});

test("COACH MOVE: migration is service-only and grants only required update columns", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261003214500_move_coach_planned_session.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /security invoker/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /source_plan_ambiguous/);
  assert.match(sql, /target_plan_already_exists/);
  assert.match(sql, /status = 'rescheduled'/);
  assert.match(sql, /revoke execute on function public\.move_coach_planned_session[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.move_coach_planned_session[\s\S]*to service_role/i);
  assert.match(sql, /grant update \(planned_date, status, updated_at\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant update on table[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /security definer/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";
import { buildTrainingRecommendation } from "../src/coachContext/trainingRecommendation.js";
import { getEnqiduTool } from "../src/coachTools/catalog.js";
import { detectEnqiduFastPathCommand } from "../src/coachTools/fastPath.js";
import { shiftPlanCalendarDate } from "../src/coachTools/planActions.js";

test("COACH UNAVAILABILITY: explicit phrases resolve to one narrow write tool", () => {
  const cases = [
    ["Mañana no puedo", "tomorrow"],
    ["Mañana no puedo entrenar", "tomorrow"],
    ["No puedo entrenar mañana", "tomorrow"],
    ["Hoy no puedo entrenar", "today"],
    ["Tomorrow I can't train", "tomorrow"],
    ["I can't train tomorrow", "tomorrow"],
    ["I am unavailable tomorrow", "tomorrow"],
  ];

  for (const [phrase, dateReference] of cases) {
    const result = detectEnqiduFastPathCommand(phrase);
    assert.equal(result?.tool, "set_training_unavailability", phrase);
    assert.equal(result?.arguments?.date_reference, dateReference, phrase);
    assert.equal(result?.explicit_user_command, true, phrase);
    assert.equal(result?.source, "deterministic_fast_path", phrase);
  }
});

test("COACH UNAVAILABILITY: ambiguous, future-week and negative phrases fail closed", () => {
  for (const phrase of [
    "Puede que mañana no pueda",
    "Mañana quizá no puedo",
    "La semana que viene no puedo",
    "No marques mañana como no disponible",
    "Mañana no puedo, muévelo al viernes",
  ]) {
    assert.equal(detectEnqiduFastPathCommand(phrase), null, phrase);
  }
});

test("COACH UNAVAILABILITY: canonical date shift is timezone-independent once the profile date is resolved", () => {
  assert.equal(shiftPlanCalendarDate("2026-10-03", 1), "2026-10-04");
  assert.equal(shiftPlanCalendarDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftPlanCalendarDate("2026-10-03", -1), "2026-10-02");
  assert.equal(shiftPlanCalendarDate("invalid", 1), null);
  assert.equal(shiftPlanCalendarDate("2026-10-03", 1.5), null);
});

test("COACH UNAVAILABILITY: tool contract is explicit, narrow and shared", () => {
  const definition = getEnqiduTool("set_training_unavailability");
  assert.equal(definition?.access, "write");
  assert.equal(definition?.explicit_user_command, true);
  assert.equal(definition?.server_validated, true);
  assert.deepEqual(definition?.parameters?.required, ["date_reference"]);
  assert.deepEqual(
    definition?.parameters?.properties?.date_reference?.enum,
    ["today", "tomorrow"],
  );
  assert.equal(definition?.parameters?.additionalProperties, false);
});

test("COACH UNAVAILABILITY: recommendation engine never invents a session on an unavailable date", () => {
  const recommendation = buildTrainingRecommendation({
    request: { date: "2026-10-04" },
    planned_training: { date: "2026-10-04", sessions: [] },
    training_availability: {
      date: "2026-10-04",
      status: "unavailable",
      source: "coach_explicit",
    },
    athlete_context: {
      goals: [{ name: "Fuerza", status: "active" }],
      equipment: [{ name: "Mancuernas", available: true, location: "home" }],
      constraints: [],
    },
  });

  assert.deepEqual(recommendation, {
    insufficient: true,
    reason: "athlete_unavailable",
    date: "2026-10-04",
  });
});

test("COACH UNAVAILABILITY: no-plan reply shows availability and no recommendation card", () => {
  const result = buildDeterministicCoachReply({
    message: "¿Qué entreno hoy?",
    context: {
      request: { date: "2026-10-04" },
      planned_training: { date: "2026-10-04", sessions: [] },
      training_availability: {
        date: "2026-10-04",
        status: "unavailable",
        source: "coach_explicit",
      },
      athlete_context: {
        goals: [{ name: "Fuerza", status: "active" }],
        equipment: [{ name: "Mancuernas", available: true, location: "home" }],
        constraints: [],
      },
    },
  });

  assert.match(result.answer, /marcado como no disponible/i);
  assert.match(result.answer, /No genero una sesión/i);
  assert.equal(result.cards.some((card) => card.id === "training_availability"), true);
  assert.equal(result.cards.some((card) => card.id === "recommended_training_today"), false);
});

test("COACH UNAVAILABILITY: an existing plan is preserved and surfaced as a conflict", () => {
  const result = buildDeterministicCoachReply({
    message: "¿Qué entreno hoy?",
    context: {
      request: { date: "2026-10-04" },
      planned_training: {
        date: "2026-10-04",
        sessions: [{
          id: "plan-1",
          planned_date: "2026-10-04",
          title: "Fuerza lower",
          session_type: "strength",
          status: "planned",
          planned_duration_min: 45,
          planned_duration_max: 45,
          blocks: [],
        }],
      },
      training_availability: {
        date: "2026-10-04",
        status: "unavailable",
        source: "coach_explicit",
      },
    },
  });

  assert.match(result.answer, /sigue planificado Fuerza lower/i);
  assert.match(result.answer, /No he movido ni cancelado/i);
  assert.deepEqual(result.cards.map((card) => card.id), [
    "training_availability",
    "planned_training_today",
  ]);
});

test("COACH UNAVAILABILITY: client sends only date reference and client timezone", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function setCoachTrainingUnavailability");
  assert.ok(start >= 0);
  const payloadStart = source.indexOf("const payload = {", start);
  const invokeStart = source.indexOf('supabase.functions.invoke("coach-plan-action"', payloadStart);
  const block = source.slice(payloadStart, invokeStart);
  assert.match(block, /action: "set_training_unavailability"/);
  assert.match(block, /date_reference: dateReference \|\| null/);
  assert.match(block, /client_timezone: getClientCalendarTimezone\(\)/);
  assert.doesNotMatch(block, /user_id:|calendar_date:|planned_session_id:|title:/);
});

test("COACH UNAVAILABILITY: server derives the date from athlete calendar and never mutates the plan", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  assert.match(source, /action === "set_training_unavailability"/);
  assert.match(source, /dateReference === "today"[sS]*shiftPlanCalendarDate\(calendar\.date, 1\)/);
  assert.match(source, /adminDb\.rpc\("set_coach_training_unavailability"/);
  assert.match(source, /loadPlannedTraining\(userDb, userId, targetDate\)/);
  assert.match(source, /planned_conflict: planned\.sessions\.length > 0/);
  const start = source.indexOf('if (action === "set_training_unavailability")');
  const end = source.indexOf('if (action === "move_planned_session")', start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /move_coach_planned_session|delete\(|update\(/);
  assert.match(block, /llm_used: false/);
  assert.match(block, /usage: null/);
});

test("COACH UNAVAILABILITY: migration keeps browser writes closed", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261003223000_set_training_unavailability.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select[sS]*to authenticated[sS]*user_id = auth\.uid\(\)/i);
  assert.match(sql, /revoke insert, update, delete[sS]*from public, anon, authenticated/i);
  assert.match(sql, /revoke execute on function public\.set_coach_training_unavailability[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.set_coach_training_unavailability[\s\S]*to service_role/i);
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
});

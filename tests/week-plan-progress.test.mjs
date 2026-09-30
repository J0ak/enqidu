import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeekPlanProgress,
  explainWeekPlanProgress,
} from "../src/coachContext/weekPlanProgress.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";

const currentWeek = {
  week: {
    start: "2026-09-28",
    end: "2026-10-04",
    sessions_count: 2,
    active_days: 2,
  },
};

test("classifies linked completion, future sessions and past-unlinked sessions without calling them missed", () => {
  const result = buildWeekPlanProgress({
    from: "2026-09-28",
    to: "2026-10-04",
    reference_date: "2026-09-30",
    weekly_focus: "Fuerza + carrera suave",
    sessions: [
      { planned_date: "2026-09-28", title: "Lower", linked_completed_session_id: "session-1" },
      { planned_date: "2026-09-29", title: "Upper", status: "planned" },
      { planned_date: "2026-10-02", title: "Z2", status: "planned" },
      { planned_date: "2026-10-03", title: "Cancelada", status: "cancelled" },
    ],
  }, currentWeek);

  assert.equal(result.planned_count, 3);
  assert.equal(result.completed_linked_count, 1);
  assert.equal(result.upcoming_count, 1);
  assert.equal(result.past_unlinked_count, 1);
  assert.equal(result.executed_week_count, 2);

  const answer = explainWeekPlanProgress(result);
  assert.match(answer, /Quedan por delante: Z2/);
  assert.match(answer, /sin ejecución enlazada/);
  assert.match(answer, /no las marco como incumplidas/i);
  assert.doesNotMatch(answer, /incumpliste|fallaste|te saltaste/i);
});

test("an explicit completed status counts as completion evidence even without a link", () => {
  const result = buildWeekPlanProgress({
    reference_date: "2026-09-30",
    sessions: [
      { planned_date: "2026-09-29", title: "Fuerza", status: "completed" },
    ],
  }, currentWeek);

  assert.equal(result.completed_linked_count, 1);
  assert.equal(result.past_unlinked_count, 0);
});

test("no weekly plan stays honest while still reporting real executed sessions", () => {
  const result = buildWeekPlanProgress({
    from: "2026-09-28",
    to: "2026-10-04",
    reference_date: "2026-09-30",
    sessions: [],
  }, currentWeek);

  assert.equal(result.has_plan, false);
  const answer = explainWeekPlanProgress(result);
  assert.match(answer, /No tienes un plan semanal registrado/);
  assert.match(answer, /2 sesiones ejecutadas/);
});

test("Coach answers weekly plan progress deterministically without mixing generic period card", () => {
  const context = {
    request: { date: "2026-09-30", from_date: "2026-09-28", to_date: "2026-10-04" },
    current_week: currentWeek,
    weekly_planning: {
      from: "2026-09-28",
      to: "2026-10-04",
      reference_date: "2026-09-30",
      sessions: [
        { planned_date: "2026-10-02", title: "Trail Z2", session_type: "trail", status: "planned" },
      ],
    },
    training_period: {
      period: { from: "2026-09-28", to: "2026-10-04" },
      summary: { sessions_count: 2, active_days: 2, total_duration_seconds: 7667, activity_types: { HIIT: 2 } },
      sessions: [],
    },
  };

  const reply = buildDeterministicCoachReply({
    message: "¿Qué me queda por entrenar esta semana?",
    context,
  });

  assert.match(reply.answer, /Quedan por delante: Trail Z2/);
  assert.deepEqual(reply.cards.map((card) => card.id), ["weekly_plan_progress"]);
  assert.equal(reply.responseMode, "deterministic");
  assert.equal(reply.llmUsed, false);
});

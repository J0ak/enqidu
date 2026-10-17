import test from "node:test";
import assert from "node:assert/strict";
import { buildProgress } from "../src/progress/domain.js";
import { buildWeeklyDashboard } from "../src/progress/weeklyDashboard.js";
import { weeklyDashboardSchema } from "../src/progress/schema.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";
import { normalizeStoredCoachMessages } from "../src/coachContext/coachCardsView.js";
import { applyToolResultsToCoachContext } from "../src/enqiduTools/coachAdapter.js";
import { recoveryTrendCopy } from "../src/dailyCoach/recoveryCopy.js";
import { loadProgress } from "../src/progress/loadProgress.js";
import { createToolsDb, TOOL_USER_A } from "./support/enqiduToolsDb.mjs";
// SELECT audit on production 2026-10-17. No production identity or raw payload.
const observations = [
  ["12", "Fuerza", 4753, "training", "strength_training"],
  ["13", "Bici", 5909, "cycling", "generic"],
  ["13", "Fuerza", 516, "training", "strength_training"],
  ["14", "HIIT", 3632, "62", "generic"],
  ["15", "Fuerza", 2222, "training", "strength_training"],
  ["15", "Pilates", 3744, "fitness_equipment", "pilates"],
  ["17", "Fuerza", 4058, "training", "strength_training"],
  ["17", "Fuerza", 2853, "training", "strength_training"],
];
const sessions = observations.map(
  ([day, title, duration_seconds, fit_sport, fit_sub_sport], i) => ({
    id: `s${i}`,
    local_date: `2026-10-${day}`,
    title,
    duration_seconds,
    fit_sport,
    fit_sub_sport,
    session_status: "completed",
  }),
);
const plans = Array.from({ length: 7 }, (_, i) => ({
  id: `p${i}`,
  planned_date: `2026-10-${12 + i}`,
  session_type: i === 6 ? "rest" : "strength",
  status: i < 3 ? "modified" : "confirmed",
  linked_completed_session_id: i === 0 ? "s0" : i === 3 ? "s4" : null,
}));
const build = (patch = {}) => {
  const input = {
    sessions,
    plans,
    exercises: [],
    today: "2026-10-17",
    timezone: "Europe/Madrid",
    period: "week",
    ...patch,
  };
  const progress = buildProgress(input);
  return {
    progress,
    dashboard: buildWeeklyDashboard({
      progress,
      sessions: input.sessions,
      plans: input.plans,
    }),
  };
};
test("golden 12–18 October: actual activity, linked plans and future rest remain distinct", () => {
  const { progress, dashboard: d } = build();
  assert.equal(matchesSchema(d, weeklyDashboardSchema), true);
  assert.deepEqual(d.activity, {
    ...progress.summary,
    active_days: 5,
    confirmed_rest_days: 0,
  });
  assert.equal(d.activity.sessions, 8);
  assert.equal(d.activity.seconds, 27687);
  assert.equal(d.days[2].activities.length, 1); // reconciled 14/10
  assert.deepEqual(
    d.days[3].activities.map((s) => s.title),
    ["Fuerza", "Pilates"],
  );
  assert.equal(d.planning.linked, 2);
  assert.equal(d.planning.past_unconfirmed, 3);
  assert.equal(d.planning.planned, 6);
  assert.equal(d.days[6].future, true);
  assert.equal(d.quality.unknown_modality, 1); // numeric FIT sport is not invented as a modality
  assert.equal(progress.session_trend, "insufficient_data");
  assert.equal(
    d.time_distribution.reduce((n, m) => n + (m.seconds ?? 0), 0),
    d.activity.seconds,
  );
});
test("rest requires explicit completion, no active day contradiction, no date-matched plans or future executions", () => {
  const extra = [
    {
      id: "rest",
      planned_date: "2026-10-16",
      session_type: "rest",
      status: "completed",
    },
    {
      id: "bad-rest",
      planned_date: "2026-10-15",
      session_type: "rest",
      status: "completed",
    },
    {
      id: "future",
      planned_date: "2026-10-18",
      session_type: "strength",
      status: "confirmed",
      linked_completed_session_id: "s0",
    },
  ];
  const { dashboard: d } = build({
    sessions: [
      ...sessions,
      { ...sessions[0], id: "future-session", local_date: "2026-10-18" },
      { ...sessions[0], id: "archived", session_status: "archived" },
    ],
    plans: [...plans, ...extra],
  });
  assert.equal(d.activity.sessions, 8);
  assert.equal(d.activity.confirmed_rest_days, 1);
  assert.equal(d.planning.upcoming, 1);
  assert.equal(d.days[4].confirmed_rest, true);
  assert.equal(d.days[3].confirmed_rest, false);
});
test("missing and zero retain meaning, duplicates do not inflate days or minutes", () => {
  const { dashboard: d } = build({
    sessions: [
      sessions[0],
      sessions[0],
      { ...sessions[1], duration_seconds: null },
      { ...sessions[2], duration_seconds: 0 },
    ],
  });
  assert.equal(d.activity.sessions, 3);
  assert.equal(d.activity.seconds, 4753);
  assert.equal(d.activity.duration_known, 2);
  assert.equal(d.activity.active_days, 2);
  assert.equal(
    d.time_distribution.find((m) => m.code === "cycling").seconds,
    null,
  );
  const empty = build({ sessions: [] }).dashboard;
  assert.equal(empty.activity.seconds, null);
  assert.equal(empty.activity.confirmed_rest_days, 0);
});
test("all five weekly intents carry the full deterministic contract through stored Coach cards", () => {
  const { dashboard } = build();
  const context = applyToolResultsToCoachContext({}, [
    {
      ok: true,
      tool: "get_progress_performance_v1",
      data: { weekly_dashboard: dashboard },
    },
  ]);
  for (const message of [
    "¿Qué he entrenado esta semana?",
    "Enséñame mi semana",
    "Hazme el resumen semanal",
    "¿Cómo he entrenado?",
    "¿Cómo voy esta semana?",
  ]) {
    const reply = buildDeterministicCoachReply({ message, context });
    assert.equal(reply.response_mode, "deterministic");
    assert.equal(reply.llm_used, false);
    assert.equal(reply.usage, null);
    assert.equal(reply.cards[0].type, "weekly_dashboard_v1");
    assert.equal(reply.cards[0].dashboard, dashboard);
    const stored = normalizeStoredCoachMessages(
      JSON.parse(
        JSON.stringify([
          { role: "assistant", content: reply.answer, cards: reply.cards },
        ]),
      ),
    );
    assert.deepEqual(stored[0].cards[0].dashboard, dashboard);
    assert.equal(reply.cards[0].actions, undefined);
  }
  assert.equal(
    buildDeterministicCoachReply({ message: "¿Cómo voy esta semana?" }).cards
      .length,
    0,
  );
});
test("Recovery copy uses actual latest score, including zero, and keeps math out of the headline", () => {
  for (const score of [58, 0]) {
    const copy = recoveryTrendCopy({
      direction: "insufficient_data",
      points: [{ readiness_score: score }],
    });
    assert.ok(copy.explanation.includes(`de ${score}.`));
    assert.ok(
      !/ventana|Evidencia insuficiente/.test(copy.title + copy.explanation),
    );
  }
  assert.match(
    recoveryTrendCopy({ direction: "insufficient_data", points: [] })
      .explanation,
    /Aún no tenemos puntuaciones/,
  );
});
test("weekly loader shares Progress aggregates, pages over 100, isolates tenants and includes upcoming plans", async () => {
  const { db, tables } = createToolsDb();
  tables.training_sessions = Array.from({ length: 130 }, (_, i) => ({
    ...sessions[i % sessions.length],
    id: `s${String(i).padStart(3, "0")}`,
    user_id: TOOL_USER_A,
  }));
  tables.training_sessions.push({
    ...sessions[0],
    id: "foreign",
    user_id: "other",
  });
  tables.planned_training_sessions = [
    {
      id: "future",
      user_id: TOOL_USER_A,
      planned_date: "2026-10-18",
      session_type: "strength",
      status: "confirmed",
    },
  ];
  tables.session_exercises = [
    {
      id: "e",
      session_id: "s000",
      reported_name: "Press",
      load_value: 10,
      load_unit: "kg",
      reps_per_set: [8],
    },
  ];
  const result = await loadProgress(db, {
    userId: TOOL_USER_A,
    calendar: { date: "2026-10-17", timezone: "Europe/Madrid" },
    period: "week",
  });
  const { progressSchema } = await import("../src/progress/schema.js");
  assert.equal(matchesSchema(result, progressSchema), true);
  assert.equal(result.summary.sessions, 130);
  assert.equal(result.weekly_dashboard.activity.sessions, 130);
  assert.equal(
    result.summary.seconds,
    result.weekly_dashboard.activity.seconds,
  );
  assert.equal(result.weekly_dashboard.planning.upcoming, 1);
  assert.ok(!JSON.stringify(result).includes("foreign"));
});

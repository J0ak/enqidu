import assert from "node:assert/strict";
import test from "node:test";
import { coachHealthFixture } from "./fixtures/coach-health-v1.mjs";
import { buildCoachCards, coachCardContract, detectCoachIntents } from "../src/coachContext/coachCards.js";
import {
  formatCoachCardMetric,
  formatCoachCardDate,
  formatCoachCardDateRange,
  normalizeStoredCoachMessages,
  resolveCoachCardAction,
} from "../src/coachContext/coachCardsView.js";

const context = {
  athlete_context: {
    equipment: [
      { name: "Rack", category: "strength", location: "home", available: true },
      { name: "Barra", category: "strength", location: "home", available: true },
      { name: "Comba", category: "conditioning", location: "home", available: true },
      { name: "Piscina", category: "cardio", location: "pool", available: true },
      { name: "No disponible", category: "other", location: "home", available: false },
      { name: "Sin marca de disponibilidad", category: "other", location: "home" },
    ],
  },
  planned_training: {
    date: "2026-09-29",
    sessions: [
      {
        title: "Lower strength + unilateral",
        session_type: "strength",
        planned_duration_min: 50,
        planned_duration_max: 60,
        blocks_count: 3,
        blocks: [
          { title: "Activación", planned_duration_seconds: 600 },
          { title: "Fuerza principal", planned_duration_seconds: 1800 },
          { title: "Unilateral", planned_duration_seconds: 1200 },
        ],
      },
    ],
  },
  health_recovery: coachHealthFixture(),
  training_period: {
    period: { from: "2026-09-21", to: "2026-09-27" },
    summary: {
      sessions_count: 4,
      active_days: 4,
      total_duration_seconds: 12600,
      activity_types: { Strength: 2, Trail: 1, Swimming: 1 },
    },
    sessions: [
      {
        session_id: "session-27",
        date: "2026-09-27",
        title: "Hybrid strength",
        garmin_type_label: "Strength",
        duration_seconds: 3600,
        distance_meters: 0,
        elevation_gain_meters: 0,
        blocks_count: 4,
        quality: "partial",
      },
    ],
  },
};

test("builds a deterministic period summary for progress questions", () => {
  const cards = buildCoachCards({ message: "¿Cómo voy esta semana para HYROX?", context });
  assert.equal(cards[0].id, "training_period_summary");
  assert.equal(cards[0].metrics.find((item) => item.key === "sessions").value, 4);
  assert.equal(cards[0].provenance, "enkidu_context");
});

test("detects weekly planned-session questions regardless of natural word order", () => {
  assert.equal(detectCoachIntents("¿Qué sesiones tengo planificadas esta semana?").weekPlan, true);
  assert.equal(detectCoachIntents("¿Qué entrenamientos están programados esta semana?").weekPlan, true);
  assert.equal(detectCoachIntents("¿Qué entrenamientos tengo programados para esta semana que viene?").weekPlan, false);
  assert.equal(detectCoachIntents("¿Qué entrenamientos tengo programados para esta semana que viene?").period, false);
});

test("builds the latest session card for activity questions", () => {
  const cards = buildCoachCards({ message: "¿Qué hice ayer?", context });
  assert.equal(cards[0].id, "latest_training_session");
  assert.equal(cards[0].title, "Hybrid strength");
  assert.equal(cards[0].metrics.find((item) => item.key === "blocks").value, 4);
});

test("builds recovery/readiness only when factual recovery metrics exist", () => {
  const cards = buildCoachCards({ message: "¿Cómo estoy hoy de recuperación?", context });
  assert.equal(cards[0].id, "recovery_readiness");
  assert.equal(cards[0].metrics.find((item) => item.key === "readiness").value, context.health_recovery.readiness.score);
  assert.equal(cards[0].metrics.find((item) => item.key === "hrv").value, 47);

  const withoutRecovery = {
    ...context,
    health_recovery: {
      date: "2026-09-28",
      readiness: { score: null },
      sleep: { score: null, duration_seconds: null },
      hrv: { night_avg_ms: null },
      body_battery: { morning: null },
    },
  };
  assert.deepEqual(buildCoachCards({ message: "¿Cómo estoy hoy de recuperación?", context: withoutRecovery }), []);
});

test("builds equipment context for a requested training environment", () => {
  const cards = buildCoachCards({ message: "¿Qué material tengo en casa?", context });
  assert.equal(cards[0].id, "equipment_context");
  assert.equal(cards[0].title, "Equipamiento · Casa");
  assert.equal(cards[0].metrics.find((item) => item.key === "equipment_items").value, 3);
  assert.equal(cards[0].metrics.find((item) => item.key === "equipment_categories").value, 2);
  assert.deepEqual(cards[0].breakdown, [
    { label: "Strength", value: 2 },
    { label: "Conditioning", value: 1 },
  ]);
});

test("does not show cards for generic conversation", () => {
  assert.deepEqual(buildCoachCards({ message: "Hola", context }), []);
  assert.deepEqual(buildCoachCards({ message: "Gracias", context }), []);
});

test("keeps ambiguous conversational phrases from triggering unrelated cards", () => {
  assert.deepEqual(buildCoachCards({ message: "¿Qué tengo que hacer hoy?", context }), []);
  assert.deepEqual(buildCoachCards({ message: "¿Cuánto descanso entre series?", context }), []);
  assert.deepEqual(buildCoachCards({ message: "¿Qué es HYROX?", context }), []);
});

test("counts only equipment explicitly marked available", () => {
  const [card] = buildCoachCards({ message: "¿Qué material tengo en casa?", context });
  assert.equal(card.metrics.find((item) => item.key === "equipment_items").value, 3);
  assert.equal(card.breakdown.some((item) => item.label === "Other"), false);
});

test("formats period ranges without losing either date", () => {
  assert.equal(formatCoachCardDateRange("2026-09-21", "2026-09-27"), "21–27 sept 2026");
  assert.equal(formatCoachCardDateRange("2026-09-29", "2026-10-05"), "29 sept–5 oct 2026");
  assert.equal(formatCoachCardDate("2026-09-27"), "27 sept 2026");
});

test("never invents cards when no real training data exists", () => {
  const cards = buildCoachCards({
    message: "¿Cómo voy esta semana?",
    context: { training_period: { summary: { sessions_count: 0 }, sessions: [] } },
  });
  assert.deepEqual(cards, []);
});

test("caps reply cards and declares no-extra-LLM token policy", () => {
  const cards = buildCoachCards({
    message: "¿Cómo estoy hoy, qué material tengo en casa y cómo voy esta semana?",
    context,
  });
  assert.ok(cards.length <= coachCardContract.maxCardsPerReply);
  assert.equal(cards.length, 2);
  assert.equal(coachCardContract.version, "coach_card_v2");
  assert.equal(coachCardContract.tokenPolicy, "deterministic_from_context_no_extra_llm_call");
});

test("omits absent and non-positive metrics", () => {
  const [card] = buildCoachCards({ message: "última sesión", context });
  assert.equal(card.metrics.some((item) => item.key === "distance"), false);
  assert.equal(card.metrics.some((item) => item.key === "elevation"), false);
  assert.equal(formatCoachCardMetric({ key: "distance", value: null, unit: "m" }), null);
  assert.equal(formatCoachCardMetric({ key: "duration", value: 5400, unit: "s" }), "1 h 30 min");
  assert.equal(formatCoachCardMetric({ key: "distance", value: 1250, unit: "m" }), "1.3 km");
});

test("keeps old stored messages without requiring cards", () => {
  assert.deepEqual(normalizeStoredCoachMessages([{ role: "assistant", content: "Anterior" }]), [
    { role: "assistant", content: "Anterior" },
  ]);
});

test("only resolves session navigation against an exact known id", () => {
  const sessions = [{ id: "session-27", title: "Hybrid strength" }];
  assert.equal(resolveCoachCardAction({ type: "open_training_session" }, sessions), null);
  assert.equal(resolveCoachCardAction({ type: "open_training_session", session_id: "unknown" }, sessions), null);
  assert.equal(resolveCoachCardAction({ type: "open_training_session", session_id: "session-27" }, sessions)?.session, sessions[0]);
});


test("builds today's planned training card and does not confuse it with completed-session intent", () => {
  const cards = buildCoachCards({ message: "¿Qué entreno hoy?", context });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, "planned_training_today");
  assert.equal(cards[0].title, "Lower strength + unilateral");
  assert.equal(cards[0].metrics.find((item) => item.key === "planned_duration").value, 60);
  assert.equal(cards[0].metrics.find((item) => item.key === "blocks").value, 3);
});

test("does not invent a planned-training card when today has no plan", () => {
  const cards = buildCoachCards({
    message: "¿Qué me toca hoy?",
    context: { ...context, planned_training: { date: "2026-09-29", sessions: [] } },
  });
  assert.deepEqual(cards, []);
});


test("builds a dedicated trend card without duplicating the normal period card", () => {
  const comparisonContext = {
    ...context,
    training_comparison: {
      basis: "immediately_preceding_equal_length_period",
      current: context.training_period,
      previous: {
        period: { from: "2026-09-14", to: "2026-09-20" },
        summary: {
          sessions_count: 2,
          active_days: 2,
          total_duration_seconds: 7200,
          activity_types: { Strength: 1, Trail: 1 },
        },
        sessions: [],
      },
    },
  };
  const cards = buildCoachCards({
    message: "Compárame esta semana con la anterior",
    context: comparisonContext,
  });
  assert.deepEqual(cards.map((card) => card.id), ["training_trend_comparison"]);
  assert.equal(cards[0].type, "comparison_summary");
  assert.equal(cards[0].provenance, "enkidu_context");
});


test("trend card labels an in-progress comparison as the same elapsed portion", () => {
  const current = {
    period: { from: "2026-09-28", to: "2026-09-29" },
    summary: { sessions_count: 1, active_days: 1, total_duration_seconds: 3919, activity_types: { HIIT: 1 } },
    sessions: [],
  };
  const previous = {
    period: { from: "2026-09-21", to: "2026-09-22" },
    summary: { sessions_count: 1, active_days: 1, total_duration_seconds: 5149, activity_types: { Strength: 1 } },
    sessions: [],
  };
  const cards = buildCoachCards({
    message: "¿Cómo va mi carga?",
    context: {
      ...context,
      training_period: current,
      training_comparison: {
        basis: "same_elapsed_portion_of_previous_period",
        partial_current_period: true,
        requested_current_period: { from: "2026-09-28", to: "2026-10-04" },
        current,
        previous,
      },
    },
  });
  assert.equal(cards[0].id, "training_trend_comparison");
  assert.equal(cards[0].subtitle, "Mismo tramo transcurrido vs periodo anterior");
  assert.equal(cards[0].comparison.partial_current_period, true);
});

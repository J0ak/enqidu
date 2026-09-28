import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachCards, coachCardContract } from "../src/coachContext/coachCards.js";
import {
  formatCoachCardMetric,
  formatCoachCardDate,
  formatCoachCardDateRange,
  normalizeStoredCoachMessages,
  resolveCoachCardAction,
} from "../src/coachContext/coachCardsView.js";

const context = {
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

test("builds the latest session card for activity questions", () => {
  const cards = buildCoachCards({ message: "¿Qué hice ayer?", context });
  assert.equal(cards[0].id, "latest_training_session");
  assert.equal(cards[0].title, "Hybrid strength");
  assert.equal(cards[0].metrics.find((item) => item.key === "blocks").value, 4);
});

test("does not show cards for generic conversation", () => {
  assert.deepEqual(buildCoachCards({ message: "Hola", context }), []);
  assert.deepEqual(buildCoachCards({ message: "Gracias", context }), []);
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
  const cards = buildCoachCards({ message: "Resumen de la semana y última sesión", context });
  assert.ok(cards.length <= coachCardContract.maxCardsPerReply);
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

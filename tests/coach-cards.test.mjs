import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachCards, coachCardContract } from "../src/coachContext/coachCards.js";

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

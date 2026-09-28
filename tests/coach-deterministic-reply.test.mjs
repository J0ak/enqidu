import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";

const context = {
  athlete_context: {
    equipment: [
      { name: "Rack", category: "strength", location: "home", available: true },
      { name: "Barra", category: "strength", location: "home", available: true },
      { name: "Comba", category: "conditioning", location: "home", available: true },
      { name: "Piscina", category: "cardio", location: "pool", available: true },
    ],
  },
  health_recovery: {
    date: "2026-09-28",
    readiness: { score: 82 },
    sleep: { score: 79, duration_seconds: 27000 },
    hrv: { night_avg_ms: 47 },
    body_battery: { morning: 76 },
  },
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
      },
    ],
  },
};

test("answers weekly progress from ENQIDU context without an LLM", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Cómo voy esta semana?", context });
  assert.equal(reply.responseMode, "deterministic");
  assert.equal(reply.llmUsed, false);
  assert.match(reply.answer, /4 sesiones/);
  assert.match(reply.answer, /4 días activos/);
  assert.match(reply.answer, /3 h 30 min/);
  assert.equal(reply.cards[0].id, "training_period_summary");
});

test("answers latest session from structured data", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué hice ayer?", context });
  assert.match(reply.answer, /Hybrid strength/);
  assert.match(reply.answer, /1 h/);
  assert.match(reply.answer, /4 bloques/);
  assert.equal(reply.cards[0].id, "latest_training_session");
});

test("answers home equipment with concrete available item names", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué material tengo en casa?", context });
  assert.match(reply.answer, /3 elementos disponibles en casa/);
  assert.match(reply.answer, /Rack/);
  assert.match(reply.answer, /Barra/);
  assert.match(reply.answer, /Comba/);
  assert.doesNotMatch(reply.answer, /Piscina/);
  assert.equal(reply.cards[0].id, "equipment_context");
});

test("answers recovery facts when present and states when they are absent", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Cómo estoy hoy de recuperación?", context });
  assert.match(reply.answer, /readiness 82/);
  assert.match(reply.answer, /sueño 79/);
  assert.match(reply.answer, /HRV nocturna 47 ms/);
  assert.match(reply.answer, /Body Battery 76/);

  const missing = buildDeterministicCoachReply({
    message: "¿Cómo estoy hoy de recuperación?",
    context: { ...context, health_recovery: {} },
  });
  assert.match(missing.answer, /Aún no tengo datos de recuperación suficientes/);
  assert.deepEqual(missing.cards, []);
});

test("unsupported free-form questions are honest about phase-1 scope", () => {
  const reply = buildDeterministicCoachReply({
    message: "Diseña mi estrategia anual completa para competir",
    context,
  });
  assert.match(reply.answer, /primera fase/);
  assert.match(reply.answer, /capa LLM está desactivada/);
  assert.deepEqual(reply.cards, []);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrainingRecommendation,
  RECOMMENDATION_RULES,
} from "../src/coachContext/trainingRecommendation.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";

const base = {
  request: { date: "2026-09-29" },
  planned_training: { date: "2026-09-29", sessions: [] },
  athlete_context: {
    goals: [{ description: "Mejorar fuerza para HYROX", active: true }],
    constraints: [],
    equipment: [
      { name: "Rack", location: "home", available: true },
      { name: "Barra", location: "home", available: true },
      { name: "Bicicleta", location: "gym", available: false },
    ],
  },
  training_period: { sessions: [] },
  health_recovery: {},
};

test("an existing plan always wins and recommendation cards are never mixed", () => {
  const context = {
    ...base,
    planned_training: { sessions: [{ title: "Plan existente", blocks: [] }] },
  };
  assert.equal(buildTrainingRecommendation(context), null);
  const reply = buildDeterministicCoachReply({ message: "¿Qué me recomiendas hoy?", context });
  assert.match(reply.answer, /Plan existente/);
  assert.deepEqual(reply.cards.map((card) => card.id), ["planned_training_today"]);
});

test("without a plan it creates a stable, complete deterministic recommendation", () => {
  const first = buildDeterministicCoachReply({ message: "¿Qué hago hoy?", context: base });
  const second = buildDeterministicCoachReply({ message: "¿Qué hago hoy?", context: base });
  assert.deepEqual(first, second);
  assert.equal(first.cards[0].id, "recommended_training_today");
  assert.match(first.answer, /Recomendación calculada \(no es un plan guardado\)/);
  assert.match(first.answer, /Objetivo:/);
  assert.match(first.answer, /Duración aproximada:/);
  assert.match(first.answer, /Intensidad:/);
  assert.match(first.answer, /Entorno:/);
  assert.match(first.answer, /Material:/);
  assert.match(first.answer, /Bloques:/);
  assert.equal(first.responseMode, "deterministic");
  assert.equal(first.llmUsed, false);
});

test("low factual readiness produces a conservative session", () => {
  const result = buildTrainingRecommendation({
    ...base,
    health_recovery: { readiness: { score: RECOMMENDATION_RULES.lowReadinessUpperBound - 1 } },
  });
  assert.equal(result.session_type, "recovery");
  assert.equal(result.intensity, "baja");
  assert.match(result.reasons.join(" "), /readiness 61/);
});

test("missing recovery is not invented or cited", () => {
  const result = buildTrainingRecommendation(base);
  assert.doesNotMatch(result.reasons.join(" "), /recuperaci|readiness|HRV|sueño/i);
});

test("a recent hard strength session is not repeated", () => {
  const result = buildTrainingRecommendation({
    ...base,
    training_period: {
      sessions: [{ date: "2026-09-28", title: "Fuerza máxima", session_type: "strength", intensity: "high" }],
    },
  });
  assert.equal(result.session_type, "aerobic");
  assert.match(result.reasons.join(" "), /no se repite/);
});

test("a home request uses only available home equipment", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy en casa?", context: base });
  const session = reply.cards[0].session;
  assert.equal(session.environment, "home");
  assert.deepEqual(session.equipment, ["Rack", "Barra"]);
  assert.doesNotMatch(JSON.stringify(session), /Bicicleta/);
});

test("an active knee restriction changes the proposal and avoids impact", () => {
  const result = buildTrainingRecommendation({
    ...base,
    athlete_context: {
      ...base.athlete_context,
      constraints: [{ description: "Molestia de rodilla: evitar impacto", active: true }],
    },
  });
  assert.equal(result.session_type, "mobility");
  assert.doesNotMatch(`${result.title} ${result.blocks.map((block) => block.title).join(" ")}`, /correr|saltos/i);
  assert.match(result.reasons[0], /restricción activa/);
});

test("a concrete pool environment adapts the session", () => {
  const context = {
    ...base,
    athlete_context: {
      ...base.athlete_context,
      equipment: [{ name: "Piscina", location: "pool", available: true }],
    },
  };
  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy en piscina?", context });
  assert.equal(reply.cards[0].session.session_type, "swim");
  assert.equal(reply.cards[0].session.environment, "piscina");
});

test("insufficient context is explicit and produces no fabricated card", () => {
  const reply = buildDeterministicCoachReply({
    message: "¿Qué me recomiendas hoy?",
    context: { request: { date: "2026-09-29" }, planned_training: { sessions: [] } },
  });
  assert.match(reply.answer, /información ENQIDU suficiente/);
  assert.deepEqual(reply.cards, []);
});

test("today recommendation never exceeds the card contract limit and uses no LLM", () => {
  const reply = buildDeterministicCoachReply({
    message: "¿Qué entreno hoy y cómo estoy de recuperación?",
    context: { ...base, health_recovery: { readiness: { score: 80 } } },
  });
  assert.ok(reply.cards.length <= 2);
  assert.equal(reply.cards.filter((card) => card.id === "recommended_training_today").length, 1);
  assert.equal(reply.cards.some((card) => card.id === "planned_training_today"), false);
  assert.equal(reply.llmUsed, false);
});

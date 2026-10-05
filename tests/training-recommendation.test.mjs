import assert from "node:assert/strict";
import test from "node:test";
import { coachHealthFixture } from "./fixtures/coach-health-v1.mjs";
import {
  buildTrainingRecommendation,
  RECOMMENDATION_RULES,
} from "../src/coachContext/trainingRecommendation.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";

const base = {
  request: { date: "2026-09-29" },
  planned_training: { date: "2026-09-29", sessions: [] },
  recommendation_context: { constraints: [] },
  athlete_context: {
    goals: [{ description: "Mejorar fuerza para HYROX", active: true }],
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
    health_recovery: coachHealthFixture({ sleepScore: 40, bodyBattery: 40 }),
  });
  assert.equal(result.session_type, "recovery");
  assert.equal(result.intensity, "baja");
  assert.match(result.reasons.join(" "), /readiness \d+ calculado con evidencia actual/);
});

test("missing recovery is not invented or cited", () => {
  const result = buildTrainingRecommendation(base);
  assert.doesNotMatch(result.reasons.join(" "), /recuperaci|readiness|HRV|sueño/i);
});

test("an explicit recent HIIT activity from the canonical context is treated as hard and not repeated", () => {
  const result = buildTrainingRecommendation({
    ...base,
    training_period: {
      sessions: [{
        date: "2026-09-28",
        title: "Aconcagua — isométricos + unilateral + híbrido",
        garmin_type_key: "hiit",
        garmin_type_label: "HIIT",
      }],
    },
  });
  assert.equal(result.session_type, "aerobic");
  assert.match(result.reasons.join(" "), /no se repite|estímulo duro reciente/);
});

test("a hard-looking session without a valid date is not assumed to be recent", () => {
  const result = buildTrainingRecommendation({
    ...base,
    training_period: {
      sessions: [{ title: "HIIT", garmin_type_key: "hiit" }],
    },
  });
  assert.equal(result.session_type, "strength");
});

test("a home request uses only available home equipment", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy en casa?", context: base });
  const session = reply.cards[0].session;
  assert.equal(session.environment, "home");
  assert.deepEqual(session.equipment, ["Rack", "Barra"]);
  assert.doesNotMatch(JSON.stringify(session), /Bicicleta/);
  assert.match(reply.answer, /Entorno: casa/);
  assert.doesNotMatch(reply.answer, /Entorno: home/);
});

test("an active knee restriction changes the proposal and avoids impact", () => {
  const result = buildTrainingRecommendation({
    ...base,
    recommendation_context: {
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
    context: { ...base, health_recovery: coachHealthFixture() },
  });
  assert.ok(reply.cards.length <= 2);
  assert.equal(reply.cards.filter((card) => card.id === "recommended_training_today").length, 1);
  assert.equal(reply.cards.some((card) => card.id === "planned_training_today"), false);
  assert.equal(reply.llmUsed, false);
});


test("training locations in athlete_context.constraints are not treated as physical restrictions", () => {
  const result = buildTrainingRecommendation({
    ...base,
    athlete_context: {
      ...base.athlete_context,
      constraints: [{
        display_name: "Centro de entrenamiento funcional / híbrido",
        location_type: "functional_training_center",
        prescription_scope: "coach_led_only",
      }],
    },
    recommendation_context: { constraints: [] },
  });
  assert.equal(result.session_type, "strength");
});


test("a coach-led-only training location does not receive an autonomous prescription", () => {
  const context = {
    ...base,
    athlete_context: {
      ...base.athlete_context,
      constraints: [{
        display_name: "Centro de entrenamiento funcional / híbrido",
        location_type: "functional_training_center",
        prescription_scope: "coach_led_only",
      }],
      equipment: [
        { name: "Sled", location: "functional_training_center", available: true },
      ],
    },
  };
  const reply = buildDeterministicCoachReply({
    message: "¿Qué entreno hoy en el gimnasio?",
    context,
  });
  assert.match(reply.answer, /sesión guiada/);
  assert.match(reply.answer, /No genero una prescripción autónoma/);
  assert.deepEqual(reply.cards, []);
});

test("equipment from different locations is never combined without a selected environment", () => {
  const result = buildTrainingRecommendation({
    ...base,
    athlete_context: {
      ...base.athlete_context,
      equipment: [
        { name: "Rack", location: "home", available: true },
        { name: "Mancuerna", location: "gym", available: true },
      ],
    },
  });
  assert.deepEqual(result.equipment, []);
});

test("lean-mass and body-composition goals are recognized as strength-oriented", () => {
  const result = buildTrainingRecommendation({
    ...base,
    athlete_context: {
      ...base.athlete_context,
      goals: [{ name: "Ganar masa magra", goal_type: "body_composition", status: "active" }],
      equipment: [
        { name: "Rack", location: "home", available: true },
        { name: "Barra", location: "home", available: true },
      ],
    },
  });
  assert.equal(result.session_type, "strength");
  assert.match(result.reasons.join(" "), /objetivo activo/);
});

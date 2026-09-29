import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";

const baseContext = {
  request: { date: "2026-09-29", reference_date: "2026-09-29" },
  planned_training: { date: "2026-09-29", sessions: [] },
  recommendation_context: { constraints: [] },
  athlete_context: {
    goals: [{ name: "Ganar masa magra", goal_type: "body_composition", status: "active" }],
    constraints: [],
    equipment: [
      { name: "Rack", category: "strength", location: "home", available: true },
      { name: "Barra", category: "strength", location: "home", available: true },
      { name: "Piscina", category: "cardio", location: "pool", available: true },
    ],
  },
  health_recovery: {},
  training_period: {
    period: { from: "2026-09-23", to: "2026-09-29" },
    summary: {
      sessions_count: 1,
      active_days: 1,
      total_duration_seconds: 3919,
      activity_types: { HIIT: 1 },
    },
    sessions: [
      {
        date: "2026-09-28",
        title: "Aconcagua — isométricos + unilateral + híbrido",
        garmin_type_key: "hiit",
        garmin_type_label: "HIIT",
        duration_seconds: 3919,
      },
    ],
  },
};

test("EVAL: persisted plan always wins over calculated recommendation", () => {
  const context = {
    ...baseContext,
    planned_training: {
      date: "2026-09-29",
      sessions: [{
        title: "Plan guardado",
        session_type: "strength",
        planned_duration_min: 45,
        blocks_count: 1,
        blocks: [{ title: "Fuerza", planned_duration_seconds: 2700 }],
      }],
    },
  };

  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy?", context });
  assert.deepEqual(reply.cards.map((card) => card.id), ["planned_training_today"]);
  assert.doesNotMatch(reply.answer, /Recomendación calculada/);
});

test("EVAL: no plan may produce recommendation, but it remains explicitly unsaved", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué me recomiendas hoy?", context: baseContext });
  assert.equal(reply.cards[0]?.id, "recommended_training_today");
  assert.equal(reply.cards[0]?.subtitle, "Recomendación calculada · no guardada");
  assert.match(reply.answer, /no es un plan guardado/);
});

test("EVAL: today recommendation path stays deterministic and LLM-free", async () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué hago hoy?", context: baseContext });
  assert.equal(reply.responseMode, "deterministic");
  assert.equal(reply.llmUsed, false);

  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  const deterministicGate = source.indexOf("if (!llmEnabled || intents.planToday)");
  const openAiCall = source.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(deterministicGate >= 0);
  assert.ok(openAiCall > deterministicGate);
  assert.match(source.slice(deterministicGate, openAiCall), /usage: null/);
});

test("EVAL: missing recovery is never cited as observed evidence", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy?", context: baseContext });
  assert.doesNotMatch(reply.answer, /readiness|HRV|Body Battery|sueño/i);
});

test("EVAL: low factual readiness forces a conservative recovery recommendation", () => {
  const context = {
    ...baseContext,
    health_recovery: { readiness: { score: 50 } },
  };
  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy?", context });
  const session = reply.cards[0]?.session;
  assert.equal(session?.session_type, "recovery");
  assert.equal(session?.intensity, "baja");
});

test("EVAL: a recent explicit HIIT session is not blindly repeated", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy?", context: baseContext });
  const session = reply.cards[0]?.session;
  assert.notEqual(session?.session_type, "hiit");
  assert.match(reply.answer, /estímulo intenso reciente|no se repite/i);
});

test("EVAL: physical restrictions come from recommendation_context, not training locations", () => {
  const withLocationOnly = {
    ...baseContext,
    athlete_context: {
      ...baseContext.athlete_context,
      constraints: [{
        display_name: "Centro funcional",
        location_type: "functional_training_center",
        prescription_scope: "autonomous",
      }],
    },
  };
  const normal = buildDeterministicCoachReply({ message: "¿Qué entreno hoy?", context: withLocationOnly });
  assert.doesNotMatch(normal.answer, /restricción activa registrada/i);

  const withKneeRestriction = {
    ...baseContext,
    recommendation_context: {
      constraints: [{ description: "Molestia de rodilla: evitar impacto", active: true }],
    },
  };
  const restricted = buildDeterministicCoachReply({ message: "¿Qué entreno hoy?", context: withKneeRestriction });
  assert.match(restricted.answer, /restricción activa registrada/i);
});

test("EVAL: coach-led-only environments never receive autonomous prescription", () => {
  const context = {
    ...baseContext,
    athlete_context: {
      ...baseContext.athlete_context,
      constraints: [{
        display_name: "Centro de entrenamiento funcional",
        location_type: "functional_training_center",
        prescription_scope: "coach_led_only",
      }],
      equipment: [
        { name: "Sled", location: "functional_training_center", available: true },
      ],
    },
  };

  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy en el gimnasio?", context });
  assert.match(reply.answer, /sesión guiada/i);
  assert.deepEqual(reply.cards, []);
});

test("EVAL: equipment is scoped to the requested environment", () => {
  const reply = buildDeterministicCoachReply({ message: "¿Qué entreno hoy en casa?", context: baseContext });
  const session = reply.cards[0]?.session;
  assert.equal(session?.environment, "home");

  const allowedHomeEquipment = new Set(["Rack", "Barra"]);
  for (const item of session?.equipment || []) {
    assert.equal(allowedHomeEquipment.has(item), true, `unexpected non-home equipment: ${item}`);
  }

  assert.doesNotMatch(JSON.stringify(session), /Piscina/);
  assert.match(reply.answer, /Entorno: casa/);
});

test("EVAL: yesterday uses the resolved date and never substitutes the latest unrelated session", () => {
  const context = {
    ...baseContext,
    request: { date: "2026-09-28", reference_date: "2026-09-29" },
    training_period: {
      ...baseContext.training_period,
      sessions: [
        { date: "2026-09-29", title: "Sesión de hoy", duration_seconds: 1800 },
        { date: "2026-09-28", title: "Sesión de ayer", duration_seconds: 3600 },
      ],
    },
  };

  const reply = buildDeterministicCoachReply({ message: "¿Qué hice ayer?", context });
  assert.match(reply.answer, /Sesión de ayer/);
  assert.doesNotMatch(reply.answer, /Sesión de hoy/);
});

test("EVAL: greeting remains natural and card-free", () => {
  const reply = buildDeterministicCoachReply({ message: "Hola", context: baseContext });
  assert.match(reply.answer, /^¡Hola!/);
  assert.deepEqual(reply.cards, []);
  assert.equal(reply.llmUsed, false);
});

test("EVAL: Coach never exceeds the card contract limit", () => {
  const context = {
    ...baseContext,
    health_recovery: { readiness: { score: 80 } },
  };
  const reply = buildDeterministicCoachReply({
    message: "¿Qué entreno hoy y cómo estoy de recuperación?",
    context,
  });
  assert.ok(reply.cards.length <= 2);
});


test("EVAL: trend comparison never turns higher volume into a performance verdict", () => {
  const current = baseContext.training_period;
  const context = {
    ...baseContext,
    training_comparison: {
      basis: "immediately_preceding_equal_length_period",
      current,
      previous: {
        period: { from: "2026-09-16", to: "2026-09-22" },
        summary: {
          sessions_count: 0,
          active_days: 0,
          total_duration_seconds: 0,
          activity_types: {},
        },
        sessions: [],
      },
    },
  };

  const reply = buildDeterministicCoachReply({ message: "¿Estoy mejorando?", context });
  assert.match(reply.answer, /carga y volumen registrados/);
  assert.match(reply.answer, /no puedo afirmar una mejora de rendimiento/);
  assert.doesNotMatch(reply.answer, /sí, estás mejorando|no estás mejorando/i);
  assert.deepEqual(reply.cards.map((card) => card.id), ["training_trend_comparison"]);
});

test("EVAL: trend comparison stays deterministic and LLM-free", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-reply/index.ts", import.meta.url), "utf8");
  const gate = source.indexOf("if (!llmEnabled || intents.planToday || intents.trend)");
  const openAi = source.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(gate >= 0);
  assert.ok(openAi > gate);
  assert.match(source.slice(gate, openAi), /response_mode: "deterministic"/);
  assert.match(source.slice(gate, openAi), /llm_used: false/);
  assert.match(source.slice(gate, openAi), /usage: null/);
});

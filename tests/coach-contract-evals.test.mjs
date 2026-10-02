import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";
import { buildTrainingTrendRanges } from "../src/coachContext/trainingTrend.js";
import { resolveUserCalendar } from "../src/time/userCalendar.js";

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
  const deterministicGate = source.indexOf("if (!llmEnabled || intents.planToday || intents.trend || intents.weekPlan)");
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
  const gate = source.indexOf("if (!llmEnabled || intents.planToday || intents.trend || intents.weekPlan)");
  const openAi = source.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(gate >= 0);
  assert.ok(openAi > gate);
  assert.match(source.slice(gate, openAi), /response_mode: "deterministic"/);
  assert.match(source.slice(gate, openAi), /llm_used: false/);
  assert.match(source.slice(gate, openAi), /usage: null/);
});


test("EVAL: an in-progress week compares the same elapsed weekdays, never a partial week against a full week", () => {
  const ranges = buildTrainingTrendRanges({
    from: "2026-09-28",
    to: "2026-10-04",
    referenceDate: "2026-09-29",
  });
  assert.equal(ranges.partial_current_period, true);
  assert.deepEqual(ranges.current, { from: "2026-09-28", to: "2026-09-29" });
  assert.deepEqual(ranges.previous, { from: "2026-09-21", to: "2026-09-22" });
  assert.equal(ranges.basis, "same_elapsed_portion_of_previous_period");
});


test("EVAL: weekly plan progress never labels an unlinked past plan as missed", () => {
  const context = {
    ...baseContext,
    request: {
      ...(baseContext.request || {}),
      date: "2026-09-30",
      from_date: "2026-09-28",
      to_date: "2026-10-04",
    },
    current_week: {
      week: {
        start: "2026-09-28",
        end: "2026-10-04",
        sessions_count: 2,
        active_days: 2,
      },
    },
    weekly_planning: {
      from: "2026-09-28",
      to: "2026-10-04",
      reference_date: "2026-09-30",
      sessions: [
        { planned_date: "2026-09-29", title: "Upper", status: "planned" },
        { planned_date: "2026-10-02", title: "Trail Z2", status: "planned" },
      ],
    },
  };

  const reply = buildDeterministicCoachReply({
    message: "¿Qué me queda por entrenar esta semana?",
    context,
  });

  assert.match(reply.answer, /sin ejecución enlazada/i);
  assert.match(reply.answer, /no las marco como incumplidas/i);
  assert.doesNotMatch(reply.answer, /incumpliste|fallaste|te saltaste/i);
  assert.deepEqual(reply.cards.map((card) => card.id), ["weekly_plan_progress"]);
  assert.equal(reply.llmUsed, false);
});

test("EVAL: a natural weekly planned-sessions question never falls back to executed-period summary", () => {
  const context = {
    ...baseContext,
    request: {
      ...(baseContext.request || {}),
      date: "2026-09-30",
      from_date: "2026-09-28",
      to_date: "2026-10-04",
    },
    current_week: {
      week: {
        start: "2026-09-28",
        end: "2026-10-04",
        sessions_count: 2,
        active_days: 2,
      },
    },
    weekly_planning: {
      from: "2026-09-28",
      to: "2026-10-04",
      reference_date: "2026-09-30",
      sessions: [],
    },
  };

  const reply = buildDeterministicCoachReply({
    message: "¿Qué sesiones tengo planificadas esta semana?",
    context,
  });

  assert.match(reply.answer, /no tienes un plan semanal registrado/i);
  assert.deepEqual(reply.cards, []);
  assert.equal(reply.responseMode, "deterministic");
  assert.equal(reply.llmUsed, false);
});


test("EVAL: next-week wording never returns the current weekly plan or period", () => {
  const reply = buildDeterministicCoachReply({
    message: "¿Qué entrenamientos tengo programados para esta semana que viene?",
    context: baseContext,
  });

  assert.equal(reply.intents.weekPlan, false);
  assert.equal(reply.intents.period, false);
  assert.match(reply.answer, /primera fase/i);
  assert.deepEqual(reply.cards, []);
  assert.equal(reply.responseMode, "deterministic");
  assert.equal(reply.llmUsed, false);
});


test("EVAL: calculated recommendation requires explicit save action and a persisted plan still wins", () => {
  const recommendationReply = buildDeterministicCoachReply({
    message: "¿Qué entreno hoy?",
    context: {
      ...baseContext,
      request: { ...(baseContext.request || {}), date: "2026-10-01" },
      planned_training: { date: "2026-10-01", sessions: [] },
    },
  });

  const recommendationCard = recommendationReply.cards.find((card) => card.id === "recommended_training_today");
  assert.ok(recommendationCard);
  assert.equal(recommendationCard.subtitle, "Recomendación calculada · no guardada");
  assert.deepEqual(recommendationCard.actions, [{
    type: "save_recommendation_to_plan",
    label: "Guardar en plan",
    date: "2026-10-01",
    location: recommendationCard.session.environment,
  }]);

  const plannedReply = buildDeterministicCoachReply({
    message: "¿Qué entreno hoy?",
    context: {
      ...baseContext,
      request: { ...(baseContext.request || {}), date: "2026-10-01" },
      planned_training: {
        date: "2026-10-01",
        sessions: [{
          title: "Plan ya guardado",
          session_type: "strength",
          planned_duration_min: 45,
          blocks_count: 1,
          blocks: [{ title: "Fuerza", planned_duration_seconds: 2700 }],
        }],
      },
    },
  });

  assert.deepEqual(plannedReply.cards.map((card) => card.id), ["planned_training_today"]);
  assert.deepEqual(plannedReply.cards[0].actions, []);
});

test("EVAL: Coach action writer remains service-only and never exposes table writes to authenticated", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261001205500_save_coach_recommendation_plan.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /revoke execute on function public\.save_coach_recommendation_plan[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.save_coach_recommendation_plan[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[\s\S]*authenticated/i);
});


test("EVAL: athlete profile timezone owns today semantics over the browser timezone", () => {
  const resolved = resolveUserCalendar({
    profileTimezone: "Europe/Madrid",
    clientTimezone: "America/Los_Angeles",
    now: new Date("2026-10-02T06:20:00Z"),
  });

  assert.equal(resolved.date, "2026-10-02");
  assert.equal(resolved.timezone, "Europe/Madrid");
  assert.equal(resolved.source, "profile_timezone");
});

test("EVAL: stale recommendation actions cannot silently write into yesterday after timezone rollover", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  assert.match(source, /if \(date !== calendar\.date\)/);
  assert.match(source, /error: "stale_recommendation_date"/);
  assert.match(source, /Vuelve a preguntar qué entrenar hoy/);
});

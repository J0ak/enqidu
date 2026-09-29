import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrainingTrendComparison,
  explainTrainingTrend,
} from "../src/coachContext/trainingTrend.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";

const current = {
  period: { from: "2026-09-23", to: "2026-09-29" },
  summary: {
    sessions_count: 3,
    active_days: 3,
    total_duration_seconds: 7200,
    activity_types: { HIIT: 1, Fuerza: 2 },
  },
  sessions: [],
};

const previous = {
  period: { from: "2026-09-16", to: "2026-09-22" },
  summary: {
    sessions_count: 2,
    active_days: 2,
    total_duration_seconds: 5400,
    activity_types: { Trail: 1, Fuerza: 1 },
  },
  sessions: [],
};

const context = {
  request: {
    date: "2026-09-29",
    from_date: "2026-09-23",
    to_date: "2026-09-29",
  },
  training_period: current,
  training_comparison: {
    basis: "immediately_preceding_equal_length_period",
    current,
    previous,
  },
};

test("builds exact period deltas without an arbitrary performance score", () => {
  const result = buildTrainingTrendComparison(context.training_comparison);
  assert.equal(result.comparable, true);
  assert.deepEqual(result.deltas, {
    sessions_count: 1,
    active_days: 1,
    total_duration_seconds: 1800,
  });
  assert.deepEqual(result.introduced_modalities, ["HIIT"]);
  assert.deepEqual(result.missing_modalities, ["Trail"]);
  assert.equal("score" in result, false);
});

test("explains volume trend but never equates it with performance improvement", () => {
  const result = buildTrainingTrendComparison(context.training_comparison);
  const answer = explainTrainingTrend(result);
  assert.match(answer, /3 vs 2 sesiones \(\+1\)/);
  assert.match(answer, /2 h vs 1 h 30 min/);
  assert.match(answer, /HIIT: 1/);
  assert.match(answer, /no puedo afirmar una mejora de rendimiento/);
});

test("handles a zero-training previous period without percentages or division artifacts", () => {
  const result = buildTrainingTrendComparison({
    current,
    previous: {
      period: { from: "2026-09-16", to: "2026-09-22" },
      summary: {
        sessions_count: 0,
        active_days: 0,
        total_duration_seconds: 0,
        activity_types: {},
      },
    },
  });
  const answer = explainTrainingTrend(result);
  assert.equal(result.deltas.sessions_count, 3);
  assert.doesNotMatch(answer, /Infinity|NaN|%/);
});

test("missing previous period is explicit and does not fabricate a comparison", () => {
  const result = buildTrainingTrendComparison({ current });
  assert.equal(result.comparable, false);
  assert.match(explainTrainingTrend(result), /No tengo un periodo anterior comparable/);
});

test("Coach trend intent returns one comparison card and suppresses duplicate period card", () => {
  const reply = buildDeterministicCoachReply({
    message: "Compárame esta semana con la anterior",
    context,
  });
  assert.match(reply.answer, /Comparando 2026-09-23–2026-09-29/);
  assert.match(reply.answer, /no puedo afirmar una mejora de rendimiento/);
  assert.deepEqual(reply.cards.map((card) => card.id), ["training_trend_comparison"]);
  assert.equal(reply.responseMode, "deterministic");
  assert.equal(reply.llmUsed, false);
});

test("asking whether I am improving stays evidence-limited", () => {
  const reply = buildDeterministicCoachReply({
    message: "¿Estoy mejorando?",
    context,
  });
  assert.match(reply.answer, /carga y volumen registrados/);
  assert.match(reply.answer, /no puedo afirmar una mejora de rendimiento/);
  assert.doesNotMatch(reply.answer, /sí, estás mejorando|no estás mejorando/i);
});

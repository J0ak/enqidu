import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";
import { detectCoachIntents } from "../src/coachContext/coachCards.js";
import { formatCoachCardMetric } from "../src/coachContext/coachCardsView.js";
import { buildTrainingRecommendation } from "../src/coachContext/trainingRecommendation.js";
import { coachHealthFixture } from "./fixtures/coach-health-v1.mjs";

const base = () => ({
  request: { date: "2026-09-29", calendar_timezone: "Europe/Madrid" },
  health_recovery: coachHealthFixture(),
  planned_training: { date: "2026-09-29", sessions: [] },
  athlete_context: { equipment: [{ name: "Rack", location: "home", available: true }] },
});

test("all health questions are deterministic, including sleep and training-effect language", () => {
  for (const message of ["¿Cómo estoy hoy?", "¿Cómo he dormido?", "¿Cuál fue mi HRV?", "¿Qué Body Battery tengo?", "¿Qué datos de salud tienes?", "¿Cómo está mi recuperación?", "¿Estoy recuperado?", "¿Me afecta al entrenamiento?", "¿Influye en mi entrenamiento?"]) {
    assert.equal(detectCoachIntents(message).recovery, true, message);
    const result = buildDeterministicCoachReply({ message, context: base() });
    assert.equal(result.response_mode, "deterministic", message);
    assert.equal(result.llm_used, false, message);
    assert.equal(result.usage, null, message);
    assert.doesNotMatch(result.answer, /primera fase|estás recuperado|contraindica|enfermedad/i, message);
  }
});

test("metric-specific questions report the requested canonical measurement", () => {
  const context = base();
  const sleep = buildDeterministicCoachReply({ message: "¿Cómo he dormido?", context });
  assert.match(sleep.answer, /sueño 79/);
  assert.match(sleep.answer, /7 h 30 min/);
  assert.doesNotMatch(sleep.answer, /HRV nocturna|Body Battery/);
  const hrv = buildDeterministicCoachReply({ message: "¿Cuál fue mi HRV?", context });
  assert.match(hrv.answer, /HRV nocturna 47 ms/);
  const battery = buildDeterministicCoachReply({ message: "¿Qué Body Battery tengo?", context });
  assert.match(battery.answer, /Body Battery 76/);
  assert.doesNotMatch(battery.answer, /por la mañana|morning/);
});

test("absent and partial canonical health never fabricate readiness", () => {
  const context = base();
  context.health_recovery = coachHealthFixture({ sleepScore: 79, bodyBattery: null, hrv: null });
  const reply = buildDeterministicCoachReply({ message: "¿Estoy recuperado?", context });
  assert.match(reply.answer, /No hay evidencia suficiente para calcular readiness hoy\./);
  assert.doesNotMatch(reply.answer, /Readiness \d|Body Battery \d|HRV nocturna \d/);
  assert.equal(reply.cards[0].metrics.some((metric) => metric.key === "readiness"), false);

  context.health_recovery = {};
  const missing = buildDeterministicCoachReply({ message: "¿Qué datos de salud tienes?", context });
  assert.match(missing.answer, /No hay evidencia suficiente para calcular readiness hoy\./);
  assert.deepEqual(missing.cards, []);
});

test("valid observed zeros remain visible in text, card data and formatter", () => {
  const context = base();
  context.health_recovery = coachHealthFixture({ sleepScore: 0, bodyBattery: 0 });
  const reply = buildDeterministicCoachReply({ message: "¿Qué datos de salud tienes?", context });
  assert.match(reply.answer, /sueño 0/);
  assert.match(reply.answer, /Body Battery 0/);
  for (const key of ["sleep_score", "body_battery"]) {
    const metric = reply.cards[0].metrics.find((item) => item.key === key);
    assert.equal(metric.value, 0);
    assert.equal(formatCoachCardMetric(metric), "0");
  }
  assert.equal(formatCoachCardMetric({ value: null }), null);
  assert.equal(formatCoachCardMetric({ value: false }), null);
});

test("family-level stale health is identified and excluded from today's card", () => {
  const context = base();
  context.health_recovery.sleep.calendar_date = "2026-09-20";
  context.health_recovery.sleep.observed_date = "2026-09-20";
  context.health_recovery.sleep.freshness = "stale";
  context.health_recovery.freshness = "current";
  context.readiness = { status: "unavailable", score: null };
  const reply = buildDeterministicCoachReply({ message: "¿Cómo estoy hoy?", context });
  assert.match(reply.answer, /dato histórico del 2026-09-20/);
  assert.match(reply.answer, /no lo trato como actual/);
  assert.match(reply.answer, /HRV nocturna 47 ms \(registrado el 2026-09-29\)/);
  assert.equal(reply.cards[0].metrics.some((item) => item.key === "sleep_score" || item.key === "sleep_duration"), false);
});

test("legacy frontend health and readiness estimates cannot become domain authority", () => {
  const context = base();
  context.health_recovery = { readiness: { score: 0, label: "low" }, sleep: { score: 88 }, hrv: { night_avg_ms: 80 }, body_battery: { morning: 99 } };
  const reply = buildDeterministicCoachReply({ message: "¿Cómo estoy hoy?", context });
  assert.match(reply.answer, /No hay evidencia suficiente/);
  assert.doesNotMatch(reply.answer, /readiness 0|sueño 88|HRV nocturna 80|Body Battery 99/i);
  assert.deepEqual(reply.cards, []);
  assert.equal(buildTrainingRecommendation(context).session_type, "strength");
});

test("persisted plan wins even with low readiness; asking about its health effect writes nothing", () => {
  const context = base();
  context.health_recovery = coachHealthFixture({ sleepScore: 0, bodyBattery: 0 });
  context.planned_training.sessions = [{ id: "plan", title: "Lower Strength", planned_duration_min: 60, blocks: [] }];
  const snapshot = structuredClone(context);
  const result = buildDeterministicCoachReply({ message: "¿Me afecta al entrenamiento?", context });
  assert.match(result.answer, /Lower Strength/);
  assert.match(result.answer, /no he cambiado la sesión/);
  assert.match(result.answer, /Readiness \d+\/100/);
  assert.equal(result.cards[0].id, "planned_training_today");
  assert.equal(result.cards.some((card) => card.id === "recommended_training_today"), false);
  assert.equal(buildTrainingRecommendation(context), null);
  assert.deepEqual(context, snapshot);
});

test("canonical top-level unavailable readiness wins over compatibility nested readiness", () => {
  const context = base();
  context.readiness = { schema_version: "readiness_v1", status: "unavailable", score: null };
  const reply = buildDeterministicCoachReply({ message: "¿Cómo está mi recuperación?", context });
  assert.match(reply.answer, /No hay evidencia suficiente/);
  assert.doesNotMatch(reply.answer, /Readiness \d/);
});

test("readiness from another date cannot influence today's deterministic recommendation", () => {
  const context = base();
  context.health_recovery = coachHealthFixture({ date: "2026-09-28", sleepScore: 0, bodyBattery: 0 });
  assert.equal(buildTrainingRecommendation(context).session_type, "strength");
  const reply = buildDeterministicCoachReply({ message: "¿Cómo estoy hoy?", context });
  assert.match(reply.answer, /dato histórico del 2026-09-28/);
  assert.match(reply.answer, /No hay evidencia suficiente/);
});

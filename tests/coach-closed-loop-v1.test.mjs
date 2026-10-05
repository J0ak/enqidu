import assert from "node:assert/strict";
import test from "node:test";
import { assessClosedLoop } from "../src/closedLoop/closedLoopAssessment.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";
import { detectCoachIntents } from "../src/coachContext/coachCards.js";

function assessmentFixture() {
  return assessClosedLoop({
    userId: "athlete-a",
    plannedSession: { id: "plan-private-id", user_id: "athlete-a", title: "Lower Strength", planned_date: "2026-09-28", status: "completed", planned_duration_min: 60, planned_duration_max: 60, linked_completed_session_id: "fit-private-id" },
    executedSession: { id: "fit-private-id", user_id: "athlete-a", title: "Lower Strength", local_date: "2026-09-28", duration_seconds: 3600, source_type: "garmin_fit" },
    userFeedback: { confirmed: true, source: "user_feedback", user_id: "athlete-a", session_id: "fit-private-id", discomfort: true, rpe: 8, completion: "completed" },
    futureSessions: [{ id: "future-private-id", user_id: "athlete-a", title: "Upper Strength", planned_date: "2026-09-30", status: "planned" }],
    calendarDate: "2026-09-29",
    timezone: "Europe/Madrid",
    generatedAt: "2026-09-29T08:00:00Z",
  });
}

test("closed loop queries use deterministic domain assessments and proposals remain unapplied", () => {
  const assessment = assessmentFixture();
  const context = { request: { date: "2026-09-29" }, closed_loop_assessments: [assessment] };
  const before = structuredClone(context);
  const reply = buildDeterministicCoachReply({ message: "Compara lo planificado y ejecutado", context });
  assert.equal(reply.response_mode, "deterministic");
  assert.equal(reply.llm_used, false);
  assert.equal(reply.usage, null);
  assert.match(reply.answer, /Lower Strength/);
  assert.match(reply.answer, /completada/);
  assert.match(reply.answer, /FIT enlazada como evidencia objetiva/);
  assert.match(reply.answer, /Has confirmado una molestia/);
  assert.match(reply.answer, /Propuesta: priorizar recuperación/);
  assert.match(reply.answer, /requiere una acción explícita/);
  assert.match(reply.answer, /No se ha aplicado ningún cambio al plan/);
  assert.doesNotMatch(reply.answer, /private-id|user_reported_discomfort|execution_linked/);
  assert.equal(assessment.adaptation_proposal.applied, false);
  assert.deepEqual(context, before);
});

test("closed loop never labels an unlinked plan as missed and does not substitute an unrelated activity", () => {
  const assessment = assessClosedLoop({ plannedSession: { id: "plan", title: "Sesión sin enlace", planned_date: "2026-09-28", status: "planned" }, calendarDate: "2026-09-29", timezone: "Europe/Madrid" });
  const context = {
    closed_loop_assessments: [assessment],
    training_period: { sessions: [{ id: "unrelated", title: "Una actividad diferente", date: "2026-09-28", duration_seconds: 3600 }] },
  };
  const reply = buildDeterministicCoachReply({ message: "Evalúa mi sesión comparada con el plan", context });
  assert.match(reply.answer, /No hay evidencia suficiente para confirmar la completitud/);
  assert.doesNotMatch(reply.answer, /fallaste|perdiste|omitiste|Una actividad diferente/i);
  assert.deepEqual(reply.cards, []);
});

test("closed loop missing or unversioned data yields no invented assessment or recommendation", () => {
  for (const context of [{}, { closed_loop_assessments: [{ completion: "completed", adaptation_proposal: { action: "increase" } }] }]) {
    const reply = buildDeterministicCoachReply({ message: "¿Qué adaptación propones?", context });
    assert.match(reply.answer, /Aún no tengo una evaluación/);
    assert.doesNotMatch(reply.answer, /completada|aumento de carga/);
    assert.deepEqual(reply.cards, []);
  }
});

test("closed loop language never routes to a generic executed-session answer", () => {
  for (const message of ["Evalúa mi sesión", "Compara lo planificado y ejecutado", "¿Qué adaptación propones?", "¿Cómo fue mi sesión comparada con el plan?"]) {
    const intents = detectCoachIntents(message);
    assert.equal(intents.closedLoop, true, message);
    assert.equal(intents.session, false, message);
  }
});

test("a pending plan today cannot hide the latest exact linked execution assessment", () => {
  const pending = assessClosedLoop({
    plannedSession: { id: "today", title: "Upper Strength pendiente", planned_date: "2026-09-29", status: "planned" },
    calendarDate: "2026-09-29", timezone: "Europe/Madrid",
  });
  const linked = assessmentFixture();
  for (const assessments of [[pending, linked], [linked, pending]]) {
    const reply = buildDeterministicCoachReply({ message: "Evalúa mi sesión", context: { closed_loop_assessments: assessments } });
    assert.match(reply.answer, /Lower Strength/);
    assert.match(reply.answer, /FIT enlazada como evidencia objetiva/);
    assert.doesNotMatch(reply.answer, /Upper Strength pendiente/);
  }
});

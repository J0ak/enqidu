import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildCoachApplyRequest, buildCoachPreviewRequest, coachAppliedSummary, coachPreviewSummary, detectPreviewConversationAction, previewSessionView } from "../src/coachTools/actionPreviewView.js";

const commands = [
  [{ tool: "move_planned_session", arguments: { target_weekday: "friday", user_id: "other" } }, "preview_move_session", { source_date: "2026-10-05", target_date: "2026-10-09" }],
  [{ tool: "adapt_session_duration", arguments: { duration_minutes: 30 } }, "preview_adapt_duration", { source_date: "2026-10-05", duration_minutes: 30 }],
  [{ tool: "adapt_session_environment", arguments: { environment: "home" } }, "preview_adapt_environment", { source_date: "2026-10-05", environment: "home" }],
  [{ tool: "cancel_planned_session" }, "preview_cancel_session", { source_date: "2026-10-05" }],
  [{ tool: "adapt_remaining_week" }, "preview_adapt_remaining_week", {}],
];
for (const [command, tool, args] of commands) test(`COACH PREVIEW: ${command.tool} selects only a narrow preview`, () => {
  assert.deepEqual(buildCoachPreviewRequest(command, { date: "2026-10-05" }), { tool, arguments: args });
});
test("COACH PREVIEW: missing reference fails closed and a weekday uses the canonical source day", () => {
  assert.equal(buildCoachPreviewRequest(commands[0][0], null), null);
  assert.equal(buildCoachPreviewRequest({ tool: "update_record" }, { date: "2026-10-05" }), null);
  assert.equal(buildCoachPreviewRequest({ tool: "move_planned_session", arguments: { target_weekday: "funday" } }, { date: "2026-10-05" }), null);
});
test("COACH PREVIEW: apply needs review and explicit confirmation, never sends preview before/after", () => {
  const pending = { request: { tool: "preview_adapt_duration", arguments: { source_date: "2026-10-05", duration_minutes: 30 } }, preview: { requires_confirmation: true, fingerprint: "state-check", expires_at: "2026-10-05T10:15:00Z", before: { title: "old" }, after: { title: "new" } } };
  assert.equal(buildCoachApplyRequest(pending), null);
  assert.deepEqual(buildCoachApplyRequest({ ...pending, reviewed: true }), {
    tool: "apply_adapt_duration", arguments: { source_date: "2026-10-05", duration_minutes: 30, fingerprint: "state-check", expires_at: "2026-10-05T10:15:00Z", confirmation: true },
  });
  assert.equal(buildCoachApplyRequest({ ...pending, reviewed: true, request: { tool: "execute_query" } }), null);
});
test("COACH PREVIEW: conversational acceptance is explicit and negative/ambiguous text cannot apply", () => {
  for (const text of ["Aplícalo", "Aplica el cambio", "Apply it"]) assert.equal(detectPreviewConversationAction(text), "apply");
  assert.equal(detectPreviewConversationAction("Enséñame qué cambiarías"), "review");
  for (const text of ["sí", "quizá aplícalo", "no lo apliques", "aplícalo y cancela todo"]) assert.equal(detectPreviewConversationAction(text), null);
});
test("COACH PREVIEW: presentation shows canonical dates, durations, status and blocks with friendly labels", () => {
  const before = { title: "Fuerza", planned_date: "2026-10-05", planned_duration_min: 50, planned_duration_max: 50, location_type: "home", status: "planned", blocks: [{ title: "Calentamiento", planned_duration_seconds: 600 }] };
  const after = { ...before, planned_duration_min: 40, planned_duration_max: 40 };
  assert.match(coachPreviewSummary({ action: "adapt_duration", before, after }), /Te propongo.*de 50 min a 40 min/);
  assert.deepEqual(previewSessionView(before).blocks, [{ title: "Calentamiento", duration: "10 min", objective: null, rounds: null, exercises: null, constraints: null, notes: null }]);
  assert.equal(previewSessionView(before).environment, "casa");
  assert.equal(previewSessionView(before).status, "Planificada");
  assert.match(coachAppliedSummary({ adapted: true, planned_session: { title: "Fuerza", duration_minutes: 40 } }), /He ajustado Fuerza a 40 minutos/);
});
test("COACH PREVIEW: App mutation commands only invoke the tools boundary and preview acceptance is not stored", async () => {
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(main, /(?:await |import.*\b)(?:adaptCoachPlannedSessionDuration|adaptCoachPlannedSessionEnvironment|adaptCoachRemainingWeek|cancelCoachPlannedSession|moveCoachPlannedSession)\b/);
  assert.match(main, /const \[pendingToolAction, setPendingToolAction\] = useState\(null\)/);
  assert.match(main, /requestEnqiduTool\(request\)/);
  assert.match(main, /toolActionInFlight\.current = true/);
  const service = await readFile(new URL("../src/services/enqiduToolsService.js", import.meta.url), "utf8");
  assert.match(service, /invoke\("enqidu-tools", \{ body: \{ tool, arguments: args \} \}\)/);
  assert.doesNotMatch(service, /service_role|user_id|client_timezone|\.rpc\(|\.from\(/);
});

test("COACH PREVIEW: explicit source/target weekday command resolves the owned canonical week only", async () => {
  const { detectEnqiduFastPathCommand } = await import("../src/coachTools/fastPath.js");
  const { plannedContextForWeekday } = await import("../src/coachTools/actionPreviewView.js");
  const command = detectEnqiduFastPathCommand("Mueve el martes al jueves");
  assert.deepEqual(command.arguments, { source_weekday: "tuesday", target_weekday: "thursday" });
  const week = { calendar_date: "2026-10-05", timezone: "Europe/Madrid", sessions: [{ title: "Fuerza", planned_date: "2026-10-06", status: "planned" }] };
  const context = plannedContextForWeekday(week, command.arguments.source_weekday);
  assert.deepEqual(buildCoachPreviewRequest(command, context), { tool: "preview_move_session", arguments: { source_date: "2026-10-06", target_date: "2026-10-08" } });
  assert.equal(plannedContextForWeekday({ ...week, sessions: [...week.sessions, ...week.sessions] }, "tuesday"), null);
  assert.equal(plannedContextForWeekday({ ...week, calendar_date: "2026-10-07" }, "tuesday"), null);
});


test("COACH PREVIEW: exercise prescriptions, constraints, rounds and notes survive before/after presentation", () => {
  const session = { title: "Fuerza", date: "2026-10-06", duration_min: 40, duration_max: 50, intensity: "RPE 6-7", blocks: [{ title: "Principal", planned_rounds: 3, exercises_text: '[{"name":"Sentadilla","sets":3,"target_reps":"5","load_kg":45}]', constraints_text: '["Sin dolor"]', notes: "Mantén margen" }] };
  const view = previewSessionView(session);
  assert.equal(view.duration, "40–50 min");
  assert.equal(view.intensity, "RPE 6-7");
  assert.equal(view.blocks[0].rounds, 3);
  assert.equal(view.blocks[0].exercises, "Ejercicio: Sentadilla · Series: 3 · Repeticiones: 5 · Carga (kg): 45");
  assert.equal(view.blocks[0].constraints, "Sin dolor");
  assert.equal(view.blocks[0].notes, "Mantén margen");
});

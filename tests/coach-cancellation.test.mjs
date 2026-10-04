import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findLatestPlannedTrainingContext,
  markLatestPlannedTrainingCancelled,
} from "../src/coachContext/coachCardsView.js";
import { getEnqiduTool } from "../src/coachTools/catalog.js";
import { detectEnqiduFastPathCommand } from "../src/coachTools/fastPath.js";
import { normalizePlannedCalendarItem } from "../src/training/plannedCalendar.js";

test("COACH CANCEL: explicit cancel/delete phrases resolve to the narrow write tool", () => {
  for (const phrase of [
    "Cancélalo",
    "Cancela este entrenamiento",
    "Cancela la sesión",
    "Quita este entrenamiento del plan",
    "Bórralo del plan",
    "Elimínalo del plan",
    "Cancel it",
    "Remove this workout from my plan",
    "Delete it from my plan",
  ]) {
    const result = detectEnqiduFastPathCommand(phrase);
    assert.equal(result?.tool, "cancel_planned_session", phrase);
    assert.equal(result?.explicit_user_command, true, phrase);
    assert.equal(result?.source, "deterministic_fast_path", phrase);
  }
});

test("COACH CANCEL: ambiguous, negative and compound requests fail closed", () => {
  for (const phrase of [
    "No lo canceles",
    "Quizá cancélalo",
    "¿Lo cancelo?",
    "Cancélalo y muévelo al viernes",
    "Borra la semana",
    "Elimina entrenamientos",
  ]) {
    assert.equal(detectEnqiduFastPathCommand(phrase), null, phrase);
  }
});

test("COACH CANCEL: shared tool contract requires only the canonical source date", () => {
  const definition = getEnqiduTool("cancel_planned_session");
  assert.equal(definition?.access, "write");
  assert.equal(definition?.explicit_user_command, true);
  assert.equal(definition?.server_validated, true);
  assert.deepEqual(definition?.parameters?.required, ["source_date"]);
  assert.deepEqual(definition?.parameters?.properties?.source_date, {
    type: "string",
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  });
  assert.equal(definition?.parameters?.additionalProperties, false);
});

test("COACH CANCEL: cancelled conversation card is auditable but no longer actionable context", () => {
  const messages = [{
    role: "assistant",
    content: "Plan actual",
    cards: [{
      id: "planned_training_today",
      date: "2026-10-04",
      title: "Fuerza",
      subtitle: "2026-10-04",
      badge: "Strength",
      actions: [],
    }],
  }];

  assert.deepEqual(findLatestPlannedTrainingContext(messages), {
    date: "2026-10-04",
    title: "Fuerza",
  });

  const cancelled = markLatestPlannedTrainingCancelled(messages, { date: "2026-10-04" });
  assert.equal(cancelled[0].cards[0].badge, "Cancelada");
  assert.equal(cancelled[0].cards[0].cancelled, true);
  assert.deepEqual(cancelled[0].cards[0].actions, []);
  assert.equal(findLatestPlannedTrainingContext(cancelled), null);
});

test("COACH CANCEL: calendar preserves cancelled plan history explicitly", () => {
  const item = normalizePlannedCalendarItem({
    id: "plan-cancelled",
    planned_date: "2026-10-04",
    title: "Fuerza cancelada",
    session_type: "strength",
    status: "cancelled",
  });

  assert.equal(item.status, "cancelled");
  assert.equal(item.statusLabel, "Cancelada");
  assert.equal(item.title, "Fuerza cancelada");
});

test("COACH CANCEL: client sends only source date and client timezone", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function cancelCoachPlannedSession");
  assert.ok(start >= 0);
  const payloadStart = source.indexOf("const payload = {", start);
  const invokeStart = source.indexOf('supabase.functions.invoke("coach-plan-action"', payloadStart);
  const block = source.slice(payloadStart, invokeStart);

  assert.match(block, /action: "cancel_planned_session"/);
  assert.match(block, /source_date: sourceDate \|\| null/);
  assert.match(block, /client_timezone: getClientCalendarTimezone\(\)/);
  assert.doesNotMatch(block, /user_id:|planned_session_id:|status:|title:/);
});

test("COACH CANCEL: server rejects stale or ambiguous context, ignores cancelled rows and never calls OpenAI", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  assert.match(source, /\.neq\("status", "cancelled"\)/);

  const start = source.indexOf('if (action === "cancel_planned_session")');
  const end = source.indexOf('if (action === "adapt_session_duration")', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /isPlanDateOnOrAfter\(sourceDate, calendar\.date\)/);
  assert.match(block, /planned\.sessions\.length > 1/);
  assert.match(block, /sourceSession\.linked_completed_session_id/);
  assert.match(block, /adminDb\.rpc\("cancel_coach_planned_session"/);
  assert.match(block, /response_mode: "deterministic_action"/);
  assert.match(block, /llm_used: false/);
  assert.match(block, /usage: null/);
  assert.doesNotMatch(block, /api\.openai\.com/);
});

test("COACH CANCEL: migration preserves audit history and releases cancelled dates without opening browser writes", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261004093000_cancel_coach_planned_session.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /'cancelled'::text/);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /set status = 'cancelled'/i);
  assert.match(sql, /v_linked_completed_session_id is not null/i);
  assert.doesNotMatch(sql, /delete from public\.planned_training_sessions/i);
  assert.match(sql, /revoke execute on function public\.cancel_coach_planned_session[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.cancel_coach_planned_session[\s\S]*to service_role/i);
  assert.match(sql, /save_coach_recommendation_plan[\s\S]*status <> 'cancelled'/i);
  assert.match(sql, /move_coach_planned_session[\s\S]*status <> 'cancelled'/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[\s\S]*to authenticated/i);
});

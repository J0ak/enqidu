import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findLatestPlannedTrainingContext,
  markLatestPlannedTrainingAdapted,
} from "../src/coachContext/coachCardsView.js";
import { getEnqiduTool } from "../src/coachTools/catalog.js";
import { detectEnqiduFastPathCommand } from "../src/coachTools/fastPath.js";

test("COACH ENVIRONMENT: explicit phrases resolve to one narrow write tool", () => {
  const cases = [
    ["Hazlo en casa", "home"],
    ["Házmelo en piscina", "pool"],
    ["Mejor en trail", "trail"],
    ["Adáptalo en parque", "outdoor"],
    ["Cámbialo en gimnasio", "functional_training_center"],
    ["Do it at home", "home"],
    ["Make it a pool workout", "pool"],
  ];

  for (const [phrase, environment] of cases) {
    const result = detectEnqiduFastPathCommand(phrase);
    assert.equal(result?.tool, "adapt_session_environment", phrase);
    assert.equal(result?.arguments?.environment, environment, phrase);
    assert.equal(result?.explicit_user_command, true, phrase);
    assert.equal(result?.source, "deterministic_fast_path", phrase);
  }
});

test("COACH ENVIRONMENT: ambiguous or compound commands fail closed", () => {
  for (const phrase of [
    "Quizá mejor en casa",
    "¿Podría ser en casa?",
    "Hazlo en casa y de 30 minutos",
    "No lo hagas en casa",
    "Hazlo cerca de casa",
  ]) {
    assert.equal(detectEnqiduFastPathCommand(phrase), null, phrase);
  }
});

test("COACH ENVIRONMENT: shared tool contract requires source date and canonical environment", () => {
  const definition = getEnqiduTool("adapt_session_environment");
  assert.equal(definition?.access, "write");
  assert.equal(definition?.explicit_user_command, true);
  assert.equal(definition?.server_validated, true);
  assert.deepEqual(definition?.parameters?.required, ["source_date", "environment"]);
  assert.deepEqual(
    definition?.parameters?.properties?.environment?.enum,
    ["home", "pool", "trail", "outdoor", "functional_training_center"],
  );
  assert.equal(definition?.parameters?.additionalProperties, false);
});

test("COACH ENVIRONMENT: adapted card preserves date and refreshes visible plan content", () => {
  const messages = [{
    role: "assistant",
    content: "Plan actual",
    cards: [{
      id: "planned_training_today",
      date: "2026-10-04",
      title: "Sesión exterior",
      subtitle: "2026-10-04",
      badge: "Running",
      metrics: [{ key: "planned_duration", label: "Duración prevista", value: 40, unit: "min" }],
      breakdown: [{ label: "Continuo", value: 40 }],
      actions: [],
    }],
  }];

  const adapted = markLatestPlannedTrainingAdapted(messages, {
    date: "2026-10-04",
    plannedSession: {
      title: "Fuerza general controlada",
      session_type: "strength",
      duration_minutes: 45,
      environment: "home",
      blocks: [
        { title: "Activación", duration_minutes: 10 },
        { title: "Fuerza de patrones básicos", duration_minutes: 25 },
        { title: "Accesorios y vuelta a la calma", duration_minutes: 10 },
      ],
    },
  });

  assert.equal(adapted[0].cards[0].date, "2026-10-04");
  assert.equal(adapted[0].cards[0].title, "Fuerza general controlada");
  assert.equal(adapted[0].cards[0].badge, "Plan adaptado");
  assert.equal(adapted[0].cards[0].environment, "home");
  assert.equal(adapted[0].cards[0].metrics[0].value, 45);
  assert.equal(adapted[0].cards[0].breakdown.length, 3);
  assert.deepEqual(findLatestPlannedTrainingContext(adapted), {
    date: "2026-10-04",
    title: "Fuerza general controlada",
  });
});

test("COACH ENVIRONMENT: client sends only source date, canonical environment and client timezone", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function adaptCoachPlannedSessionEnvironment");
  assert.ok(start >= 0);
  const payloadStart = source.indexOf("const payload = {", start);
  const invokeStart = source.indexOf('supabase.functions.invoke("coach-plan-action"', payloadStart);
  const block = source.slice(payloadStart, invokeStart);
  assert.match(block, /action: "adapt_session_environment"/);
  assert.match(block, /source_date: sourceDate \|\| null/);
  assert.match(block, /environment: environment \|\| null/);
  assert.match(block, /client_timezone: getClientCalendarTimezone\(\)/);
  assert.doesNotMatch(block, /user_id:|planned_session_id:|title:|session_type:|blocks:/);
});

test("COACH ENVIRONMENT: shared domain recalculates canonical context without OpenAI", async () => {
  const source = await readFile(new URL("../src/enqiduTools/actions.js", import.meta.url), "utf8");
  assert.match(source, /isPlanDateOnOrAfter\(sourceDate, calendar\.date\)/);
  assert.match(source, /normalizeCoachPlanLocation\(args\.environment\)/);
  assert.match(source, /source\.source !== "enkidu_coach"/);
  assert.match(source, /context\.planned_training = \{ date, sessions: \[\] \}/);
  assert.match(source, /loadAvailability\(db, userId, targetSelection === "closed_loop_target" \? shiftPlanCalendarDate\(calendar\.date, 1\) : sourceDate, targetDate\)/);
  assert.match(source, /buildTrainingRecommendation\(context, \{ requestedLocation: \{ key: environment \} \}\)/);
  assert.match(source, /adminDb\.rpc\("apply_enqidu_action_v1"/);
  const boundary = await readFile(new URL("../supabase/migrations/20261007045422_apply_enqidu_action_v1.sql", import.meta.url), "utf8");
  assert.match(boundary, /public\.adapt_coach_planned_session_environment\(/);
  assert.match(source, /response_mode: "deterministic_action"/);
  assert.match(source, /llm_used: false/);
  assert.match(source, /usage: null/);
  assert.doesNotMatch(source, /api\.openai\.com/);
});

test("COACH ENVIRONMENT: migration keeps browser writes closed and rewrites blocks transactionally", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261004083000_adapt_coach_planned_session_environment.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /security invoker/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /v_source <> 'enkidu_coach'/i);
  assert.match(sql, /status = 'modified'/i);
  assert.match(sql, /delete from public\.planned_session_blocks/i);
  assert.match(sql, /insert into public\.planned_session_blocks/i);
  assert.match(sql, /revoke execute on function public\.adapt_coach_planned_session_environment[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.adapt_coach_planned_session_environment[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /to authenticated[\s\S]*grant (insert|update|delete)/i);
  assert.doesNotMatch(sql, /security definer/i);
});

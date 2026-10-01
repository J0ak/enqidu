import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  normalizeCoachPlanLocation,
  toCanonicalPlannedSessionType,
  toPlannedRecommendationPayload,
} from "../src/coachContext/coachPlanAction.js";
import { buildCoachCards } from "../src/coachContext/coachCards.js";
import { resolveCoachCardAction } from "../src/coachContext/coachCardsView.js";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("maps recommendation types and environments to canonical plan values", () => {
  assert.equal(normalizeCoachPlanLocation("aire libre"), "outdoor");
  assert.equal(normalizeCoachPlanLocation("Casa"), "home");
  assert.equal(normalizeCoachPlanLocation("entorno trail"), "trail");
  assert.equal(normalizeCoachPlanLocation("desconocido"), null);

  assert.equal(toCanonicalPlannedSessionType({
    session_type: "aerobic",
    environment: "aire libre",
  }), "running");
  assert.equal(toCanonicalPlannedSessionType({
    session_type: "aerobic",
    environment: "trail",
  }), "trail");
  assert.equal(toCanonicalPlannedSessionType({ session_type: "strength" }), "strength");
  assert.equal(toCanonicalPlannedSessionType({ session_type: "made_up" }), null);
});

test("planned payload preserves the recommendation but canonicalizes storage fields", () => {
  const payload = toPlannedRecommendationPayload({
    kind: "calculated_recommendation",
    session_type: "aerobic",
    title: "Sesión aeróbica fácil",
    duration_minutes: 40,
    environment: "aire libre",
    blocks: [{ title: "Continuo", duration_minutes: 25 }],
  });

  assert.equal(payload.session_type, "running");
  assert.equal(payload.environment, "outdoor");
  assert.equal(payload.title, "Sesión aeróbica fácil");
  assert.equal(payload.duration_minutes, 40);
});

test("recommendation card exposes only an explicit save action, never a plan payload", () => {
  const recommendation = {
    kind: "calculated_recommendation",
    session_type: "aerobic",
    title: "Sesión aeróbica fácil",
    objective: "Base aeróbica",
    duration_minutes: 40,
    intensity: "suave",
    environment: "outdoor",
    equipment: [],
    blocks: [{ title: "Continuo", duration_minutes: 40 }],
    reasons: ["estímulo intenso reciente"],
  };
  const cards = buildCoachCards({
    message: "¿Qué entreno hoy?",
    context: {
      request: { date: "2026-10-01" },
      planned_training: { date: "2026-10-01", sessions: [] },
      training_period: { sessions: [], summary: {} },
    },
    recommendation,
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, "recommended_training_today");
  assert.deepEqual(cards[0].actions, [{
    type: "save_recommendation_to_plan",
    label: "Guardar en plan",
    date: "2026-10-01",
    location: "outdoor",
  }]);
  assert.equal("title" in cards[0].actions[0], false);
  assert.equal("session_type" in cards[0].actions[0], false);
  assert.equal("blocks" in cards[0].actions[0], false);
});

test("save card action resolver returns only sanitized date and location", () => {
  assert.deepEqual(resolveCoachCardAction({
    type: "save_recommendation_to_plan",
    date: "2026-10-01",
    location: "outdoor",
    title: "tampered",
    blocks: [{ title: "tampered" }],
  }), {
    type: "save_recommendation_to_plan",
    date: "2026-10-01",
    location: "outdoor",
  });

  assert.equal(resolveCoachCardAction({
    type: "save_recommendation_to_plan",
    date: "01/10/2026",
  }), null);
});

test("frontend service sends only action metadata to the write endpoint", async () => {
  const source = await readFile(new URL("../src/services/aiCoachContextService.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function saveCoachRecommendationToPlan");
  assert.ok(start >= 0);
  const block = source.slice(start);
  assert.match(block, /functions\.invoke\("coach-plan-action"/);
  assert.match(block, /action: "save_recommendation_today"/);
  assert.match(block, /date: date \|\| getLocalCalendarDate\(\)/);
  assert.match(block, /location: location \|\| null/);
  assert.doesNotMatch(block, /title:|session_type:|blocks:/);
});

test("write Edge Function authenticates, recalculates and uses a separate server admin client", async () => {
  const source = await readFile(new URL("../supabase/functions/coach-plan-action/index.ts", import.meta.url), "utf8");
  assert.match(source, /userDb\.auth\.getUser\(\)/);
  assert.match(source, /buildTrainingRecommendation\(context, \{ requestedLocation \}\)/);
  assert.match(source, /context\.planned_training = await loadPlannedTraining/);
  assert.match(source, /if \(context\.planned_training\.sessions\.length\)/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /const adminDb = createClient/);
  assert.match(source, /adminDb\.rpc\("save_coach_recommendation_plan"/);
  assert.doesNotMatch(source, /api\.openai\.com/);
  assert.match(source, /response_mode: "deterministic_action"/);
  assert.match(source, /llm_used: false/);
  assert.match(source, /usage: null/);
});

test("service-role secret is never referenced by frontend runtime source", async () => {
  const files = await walk(fileURLToPath(new URL("../src/", import.meta.url)));
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (source.includes("SUPABASE_SERVICE_ROLE_KEY")) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("writer migration is transactional, service-only and does not grant table writes", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261001205500_save_coach_recommendation_plan.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /plan_already_exists/);
  assert.match(sql, /'planned'/);
  assert.match(sql, /'enkidu_coach'/);
  assert.match(sql, /revoke execute on function public\.save_coach_recommendation_plan[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.save_coach_recommendation_plan[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant (insert|update|delete) on .*planned_training_sessions.*authenticated/i);
  assert.doesNotMatch(sql, /security definer/i);
});

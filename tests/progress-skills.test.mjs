import test from "node:test";
import assert from "node:assert/strict";
import { isSkillExercise, exerciseIdentity } from "../src/progress/domain.js";
import { loadProgress } from "../src/progress/loadProgress.js";
import { withCatalogIdentity } from "../src/training/catalogResolver.js";
import { catalogSeed } from "../src/training/catalogSeed.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";
import { createToolsDb, TOOL_USER_A, toolId } from "./support/enqiduToolsDb.mjs";

const catalog = catalogSeed.map((entry, i) => ({
  ...entry, id: toolId(900 + i), is_active: true,
}));
const resolve = withCatalogIdentity(catalog);
const skills = [
  ["handstand_push_up", "HSPU", "handstand push-up"],
  ["high_pull_up", "Dominada alta", "high pull-up"],
  ["strict_pull_up", "Dominada estricta", "strict pull-up"],
  ["pike_push_up", "Pike push-up", "pike_push_up"],
  ["elevated_feet_pike_push_up", "pike push-up con pies elevados", "Elevated feet pike push-up"],
  ["elevated_pike_push_up_unspecified", "Pike push-up elevado", "elevated_pike_push_up_unspecified"],
];

for (const [code, ...names] of skills) {
  test(`Skills: ${code} is independent of resolved alias/language`, () => {
    const rows = names.map((reported_name) => resolve({ reported_name }));
    for (const row of rows) {
      assert.equal(row.canonical_exercise_code, code);
      assert.equal(isSkillExercise(row), true);
      assert.equal(isSkillExercise({ ...row, reported_name: "Un nombre distinto" }), true);
      assert.equal(exerciseIdentity(row), exerciseIdentity(rows[0]));
    }
  });
}

test("Skills: catalog codes win over misleading names, including non-skill and future codes", () => {
  const expected = new Set(skills.map(([code]) => code));
  for (const entry of catalog) {
    const row = resolve({ exercise_id: entry.id, reported_name: "HSPU muscle-up pistol" });
    assert.equal(isSkillExercise(row), expected.has(entry.code), entry.code);
  }
  for (const code of ["other", "handstand_push_up_extra", "prefix_pike_push_up", ""]) {
    assert.equal(isSkillExercise({ canonical_exercise_code: code, reported_name: "HSPU" }), false);
  }
});

test("Skills: all three pike variants stay separate identities", () => {
  const rows = skills.filter(([code]) => code.includes("pike")).map(([, name]) => resolve({ reported_name: name }));
  assert.equal(rows.length, 3);
  assert.ok(rows.every(isSkillExercise));
  assert.equal(new Set(rows.map(exerciseIdentity)).size, 3);
});

test("Skills: unresolved history retains bounded legacy patterns and trivial normalization", () => {
  for (const reported_name of ["muscle-up", "Muscle up", "muscleup", "  PÍSTOL  ", "Pike HSPU", "high pull", "Dominadas estrictas", "strict pull-ups"]) {
    const row = resolve({ reported_name });
    if (["Dominadas estrictas", "strict pull-ups"].includes(reported_name)) {
      // Explicitly test the legacy path even when today's catalog could resolve it.
      row.canonical_exercise_code = null;
    } else assert.equal(row.canonical_exercise_code, null);
    assert.equal(isSkillExercise(row), true, reported_name);
    assert.equal(isSkillExercise({ reported_name }), true, reported_name);
  }
  for (const reported_name of ["spike", "pistolero", "muscle-uplift", "HSPUextra", "Unknown", "Press banca"]) {
    assert.equal(isSkillExercise({ canonical_exercise_code: null, reported_name }), false, reported_name);
  }
});

const scope = {
  userId: TOOL_USER_A,
  calendar: { date: "2026-10-17", timezone: "Europe/Madrid" },
  period: "week",
};
function fixture(aliasIndex) {
  const f = createToolsDb({ empty: true });
  f.tables.exercise_catalog = catalog;
  f.tables.training_sessions = [{
    id: "s", user_id: TOOL_USER_A, local_date: "2026-10-15",
    session_status: "completed", title: "Skills", duration_seconds: 1800,
  }];
  f.tables.session_exercises = [
    ...skills.map(([code, ...names], i) => ({
      id: `e${i}`, session_id: "s", exercise_id: null,
      reported_name: names[aliasIndex], execution_type: "performed",
      reps_per_set: [8, 8, 7], sets_completed: 3,
      load_value: 5, load_unit: "kg", side: "bilateral", tempo_or_pause: null,
    })),
    { id: "non-skill", session_id: "s", reported_name: "HSPU",
      exercise_id: catalog.find((e) => e.code === "bench_press").id,
      execution_type: "performed", reps_per_set: [10], load_value: 40, load_unit: "kg" },
  ];
  return f;
}

test("Skills tab has identical membership across aliases; Progress, Weekly and Coach retain identity and metrics", async () => {
  const a = fixture(0), b = fixture(1);
  const before = [structuredClone(a.tables), structuredClone(b.tables)];
  const fullA = await loadProgress(a.db, scope);
  const fullB = await loadProgress(b.db, scope);
  assert.deepEqual(fullA, fullB);
  assert.equal(fullA.exercise_count, 7);
  const onlyA = await loadProgress(a.db, { ...scope, skills_only: true });
  const onlyB = await loadProgress(b.db, { ...scope, skills_only: true });
  assert.deepEqual(onlyA, onlyB);
  assert.equal(onlyA.exercise_count, 6);
  assert.deepEqual(onlyA.strength, fullA.strength.filter((e) => e.skill));
  assert.equal(new Set(onlyA.strength.map((e) => e.key)).size, 6);
  for (const card of onlyA.strength) {
    assert.equal(card.best_load, 5);
    assert.equal(card.best_reps, 8);
    assert.equal(card.known_volume, 115);
  }
  assert.deepEqual(onlyA.weekly_dashboard, fullA.weekly_dashboard);
  const reply = (data) => buildDeterministicCoachReply({
    message: "Enséñame mi semana", context: { weekly_dashboard: data.weekly_dashboard },
  });
  assert.deepEqual(reply(fullA), reply(fullB));
  assert.deepEqual([a.tables, b.tables], before);
});

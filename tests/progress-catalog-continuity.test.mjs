import test from "node:test";
import assert from "node:assert/strict";
import { buildExerciseCatalogIndex } from "../src/progress/exerciseCatalogIdentity.js";
import { exerciseIdentity } from "../src/progress/domain.js";
import { loadProgress } from "../src/progress/loadProgress.js";
import {
  createToolsDb,
  TOOL_USER_A,
  TOOL_USER_B,
  toolId,
} from "./support/enqiduToolsDb.mjs";

const rdl = {
  id: toolId(900),
  code: "romanian_deadlift",
  name: "Peso muerto rumano",
  metadata: {
    aliases: ["RDL", "Romanian Deadlift", "peso muerto rumano", "RDL"],
  },
  is_active: true,
};
const row = (patch = {}) => ({
  reported_name: "RDL",
  exercise_id: null,
  execution_type: "performed",
  side: "bilateral",
  tempo_or_pause: null,
  load_unit: "kg",
  load_value: 45,
  reps_per_set: [8, 8, 8],
  ...patch,
});
const resolve = buildExerciseCatalogIndex([rdl]);
const current = row({ exercise_id: rdl.id, reps_per_set: [10, 10, 10] });

for (const name of [
  "RDL",
  "Peso muerto rumano",
  "  PÉSO  MUERTO RÚMANO  ",
  "romanian_deadlift",
  "Romanian Deadlift",
]) {
  test(`catalog continuity: UUID matches historical null via exact ${name}`, () => {
    const historical = row({ reported_name: name });
    assert.equal(resolve(historical).canonical_exercise_code, rdl.code);
    assert.equal(
      exerciseIdentity(resolve(historical)),
      exerciseIdentity(resolve(current)),
    );
    assert.equal(historical.exercise_id, null);
    assert.equal(historical.canonical_exercise_code, undefined);
  });
}
test("catalog continuity: no fuzzy, substring or non-string aliases", () => {
  for (const name of ["peso", "mi RDL", "peso muerto", "RDL extra"]) {
    const e = resolve(row({ reported_name: name }));
    assert.equal(e.canonical_exercise_code, null);
    assert.notEqual(exerciseIdentity(e), exerciseIdentity(resolve(current)));
    assert.deepEqual(JSON.parse(exerciseIdentity(e))[0], [
      "reported",
      name.toLowerCase(),
    ]);
  }
  const bad = buildExerciseCatalogIndex([
    { ...rdl, metadata: { aliases: [45, { name: "peso" }] } },
  ]);
  assert.equal(bad(row({ reported_name: "45" })).canonical_exercise_code, null);
  assert.equal(
    bad(row({ reported_name: "peso" })).canonical_exercise_code,
    null,
  );
});
test("catalog continuity: Unknown never becomes identified through a configured placeholder alias", () => {
  const index = buildExerciseCatalogIndex([
    { ...rdl, metadata: { aliases: ["Unknown", "Desconocido"] } },
  ]);
  for (const name of [
    "Unknown",
    "Desconocido",
    " unknown 2 ",
    "sin identificar",
    "",
  ]) {
    const e = index(row({ reported_name: name }));
    assert.equal(e.canonical_exercise_code, null);
    assert.equal(exerciseIdentity(e), null);
  }
});
test("catalog continuity: ambiguous exact aliases cannot choose a catalog exercise or collide with its code", () => {
  const first = { ...rdl, code: "rdl" };
  const index = buildExerciseCatalogIndex([
    first,
    { ...rdl, id: toolId(901), code: "other", name: "Other exercise" },
  ]);
  const historical = index(row());
  assert.equal(historical.canonical_exercise_code, null);
  assert.notEqual(
    exerciseIdentity(historical),
    exerciseIdentity(index(current)),
  );
  assert.equal(index(current).canonical_exercise_code, "rdl"); // explicit ID still authoritative
});
test("catalog continuity: unresolved UUID uses literal-name fallback; catalog deactivation preserves history", () => {
  assert.equal(
    resolve({ ...current, exercise_id: toolId(999) }).canonical_exercise_code,
    null,
  );
  assert.notEqual(
    exerciseIdentity(resolve({ ...current, exercise_id: toolId(999) })),
    exerciseIdentity(resolve(current)),
  );
  const inactive = buildExerciseCatalogIndex([{ ...rdl, is_active: false }]);
  assert.equal(
    exerciseIdentity(inactive(row())),
    exerciseIdentity(inactive(current)),
  );
});
for (const variant of [
  { side: "left" },
  { tempo_or_pause: "pause 2s" },
  { load_unit: "kg_each" },
  { execution_type: "eccentric_only" },
]) {
  test(`catalog continuity preserves incompatible dimension ${JSON.stringify(variant)}`, () => {
    assert.notEqual(
      exerciseIdentity(resolve(row(variant))),
      exerciseIdentity(resolve(current)),
    );
  });
}

const session = (id, local_date, user_id = TOOL_USER_A) => ({
  id,
  local_date,
  user_id,
  title: "Fuerza",
  duration_seconds: 3600,
  session_status: "completed",
});
function fixture() {
  const f = createToolsDb({ empty: true });
  f.tables.exercise_catalog = [rdl];
  f.tables.training_sessions = [
    session("now", "2026-10-15"),
    session("old", "2026-05-01"),
    session("foreign", "2026-05-01", TOOL_USER_B),
  ];
  f.tables.session_exercises = [
    row({
      id: "old-e",
      session_id: "old",
      reported_name: "Peso muerto rumano",
    }),
    { ...current, id: "now-e", session_id: "now" },
    row({
      id: "private",
      session_id: "foreign",
      reps_per_set: [999, 999, 999],
    }),
  ];
  return f;
}
const week = {
  userId: TOOL_USER_A,
  calendar: { date: "2026-10-17", timezone: "Europe/Madrid" },
  period: "week",
};
test("catalog continuity: 52-week comparison, Weekly, highlights, null → UUID, no writes and tenant scope", async () => {
  const { db, tables, calls } = fixture(),
    before = structuredClone(tables);
  const p = await loadProgress(db, week);
  assert.equal(p.strength.length, 1);
  assert.equal(p.observed_records, 1);
  assert.equal(p.strength[0].records[0].kind, "reps_at_load");
  assert.equal(p.strength[0].records[0].previous, 8);
  assert.equal(p.strength[0].records[0].value, 10);
  assert.equal(p.strength[0].records[0].load, 45);
  assert.equal(p.strength[0].records[0].previous_exercise_id, "old-e");
  assert.equal(p.strength[0].known_volume, 1350);
  assert.equal(p.weekly_dashboard.observed_records, 1);
  assert.deepEqual(p.weekly_dashboard.highlights, p.highlights);
  assert.match(
    p.insights.find((i) => i.kind === "observed_reps_record").text,
    /8 → 10 reps/,
  );
  assert.ok(!JSON.stringify(p).includes("private"));
  assert.deepEqual(tables, before); // fixture has no mutation methods; no backfill even in memory
  assert.ok(
    calls
      .filter((c) => c.table === "training_sessions")
      .every((c) =>
        c.filters.some((f) => f.key === "user_id" && f.value === TOOL_USER_A),
      ),
  );
  assert.deepEqual(
    calls.find((c) => c.table === "exercise_catalog").select,
    "id,code,name,metadata,is_active",
  );
});
for (const period of ["4", "12"]) {
  test(`catalog continuity: ${period}-week evolution groups null/UUID aliases into one improving series`, async () => {
    const { db, tables } = fixture();
    const earlier =
      period === "4"
        ? ["2026-09-24", "2026-09-25"]
        : ["2026-08-10", "2026-08-11"];
    tables.training_sessions = [...earlier, "2026-10-15", "2026-10-16"].map(
      (date, i) => session(`s${i}`, date),
    );
    tables.session_exercises = tables.training_sessions.map((s, i) =>
      row({
        id: `e${i}`,
        session_id: s.id,
        reported_name: i < 2 ? "Peso muerto rumano" : "RDL",
        exercise_id: i < 2 ? null : rdl.id,
        reps_per_set: i < 2 ? [8, 8, 8] : [10, 10, 10],
      }),
    );
    const p = await loadProgress(db, {
      ...week,
      period,
      calendar: { ...week.calendar, date: "2026-10-19" },
    });
    assert.equal(p.strength.length, 1);
    assert.equal(p.strength[0].exposures, 4);
    assert.equal(p.strength[0].trend, "improving");
  });
}
test("catalog continuity: Unknown has no identified volume, records or Weekly exercise", async () => {
  const { db, tables } = fixture();
  tables.session_exercises = tables.session_exercises.map((e) => ({
    ...e,
    exercise_id: null,
    reported_name: "Unknown",
  }));
  const p = await loadProgress(db, week);
  assert.deepEqual(p.strength, []);
  assert.equal(p.observed_records, 0);
  assert.equal(
    p.weekly_dashboard.days
      .flatMap((d) => d.activities)
      .flatMap((a) => a.exercises).length,
    0,
  );
});
test("catalog continuity: paginated catalog detects cross-page ambiguity; overflow/errors fail closed", async () => {
  const { db, tables } = fixture();
  tables.exercise_catalog = Array.from({ length: 251 }, (_, i) => ({
    ...rdl,
    id: toolId(1000 + i),
    code: `code_${i}`,
    name: `Exercise ${i}`,
    metadata: { aliases: [] },
  }));
  tables.exercise_catalog[0] = rdl;
  tables.exercise_catalog[250].metadata.aliases = ["RDL"];
  tables.session_exercises[0].reported_name = "RDL";
  assert.equal((await loadProgress(db, week)).observed_records, 0);
  tables.exercise_catalog = Array.from({ length: 2001 }, (_, i) => ({
    ...rdl,
    id: toolId(1000 + i),
  }));
  await assert.rejects(
    () => loadProgress(db, week),
    /progress_scope_too_large/,
  );
  const failing = {
    ...db,
    from(table) {
      return table === "exercise_catalog"
        ? {
            select() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return Promise.resolve({ error: { message: "unavailable" } });
            },
          }
        : db.from(table);
    },
  };
  await assert.rejects(
    () => loadProgress(failing, week),
    /canonical_read_unavailable/,
  );
});

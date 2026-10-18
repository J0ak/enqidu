import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProgress,
  observedReps,
  normalizeName,
  periodBounds,
  modality,
} from "../src/progress/domain.js";
import { readPages, loadProgress } from "../src/progress/loadProgress.js";
import { progressDomainSchema as progressSchema } from "../src/progress/schema.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
const session = (id, date = "2026-10-06", extra = {}) => ({
  id,
  user_id: "a",
  session_status: "completed",
  local_date: date,
  duration_seconds: 600,
  modality_code: "functional_strength",
  ...extra,
});
const exercise = (id, session_id, extra = {}) => ({
  id,
  session_id,
  reported_name: "Press banca",
  load_value: 20,
  load_unit: "kg",
  reps_per_set: [8, 10],
  ...extra,
});
const build = (extra = {}) =>
  buildProgress({
    sessions: [session("s")],
    exercises: [exercise("e", "s")],
    plans: [],
    today: "2026-10-17",
    timezone: "Europe/Madrid",
    firstDate: "2026-01-01",
    ...extra,
  });
test("numeric arrays only; zero is observed, object/text/null never inferred", () => {
  assert.deepEqual(observedReps([0, 8]), [0, 8]);
  for (const v of [null, [], { reps: 8 }, ["8"], [null], [8, -1], [1.5]])
    assert.equal(observedReps(v), null);
  const p = build();
  assert.equal(p.strength[0].known_volume, 360);
  assert.equal(p.strength[0].best_load, 20);
  assert.equal(p.strength[0].best_reps_at_load, 10);
  assert.ok(matchesSchema(p, progressSchema));
  for (const patch of [
    { load_value: null },
    { reps_per_set: null },
    { load_unit: "goma" },
  ])
    assert.equal(
      build({ exercises: [exercise("e", "s", patch)] }).strength[0]
        .known_volume,
      null,
    );
  assert.equal(
    build({ exercises: [exercise("e", "s", { load_value: 0 })] }).strength[0]
      .known_volume,
    0,
  );
});
test("safe identity preserves names, variants, units, sides and tempo", () => {
  assert.equal(normalizeName("  PRÉSS  BANCA "), "press banca");
  const p = build({
    exercises: [
      exercise("1", "s"),
      exercise("2", "s", { reported_name: "DB bench" }),
      exercise("3", "s", { side: "left" }),
      exercise("4", "s", { tempo_or_pause: "slow" }),
      exercise("5", "s", { load_unit: "lb" }),
    ],
  });
  assert.equal(p.strength.length, 5);
});
test("skills keep variants, observed reps and insufficient history", () => {
  const p = build({
    exercises: [
      exercise("1", "s", { reported_name: "Pike HSPU", load_value: null }),
      exercise("2", "s", { reported_name: "HSPU", reps_per_set: { reps: 9 } }),
    ],
  });
  assert.ok(p.strength.every((e) => e.skill));
  assert.equal(p.strength[0].trend, "insufficient_data");
  assert.equal(p.strength.find((e) => e.name === "HSPU").best_reps, null);
});
test("trends require four sessions, same load, two per complete half", () => {
  const sessions = ["2026-09-15", "2026-09-20", "2026-10-03", "2026-10-06"].map(
    (date, i) => session(String(i), date),
  );
  const exercises = sessions.map((s, i) =>
    exercise("e" + i, s.id, { reps_per_set: [i < 2 ? 8 : 10] }),
  );
  assert.equal(build({ sessions, exercises }).strength[0].trend, "improving");
  assert.equal(
    build({
      sessions,
      exercises: exercises.map((e, i) => ({
        ...e,
        load_value: i < 2 ? 20 : 25,
      })),
    }).strength[0].trend,
    "insufficient_data",
  );
});
test("running and trail separate, missing distance not zero, paired pace only", () => {
  const p = build({
    sessions: [
      session("a", "2026-10-06", {
        modality_code: "running",
        distance_meters: 1000,
      }),
      session("b", "2026-10-06", {
        modality_code: "trail_running",
        distance_meters: 2000,
        elevation_gain_meters: 100,
      }),
      session("c", "2026-10-06", {
        modality_code: "running",
        distance_meters: null,
      }),
    ],
    exercises: [],
  });
  assert.equal(p.cardio.length, 2);
  assert.equal(p.cardio[0].pace_seconds_km, 600);
  assert.equal(p.cardio[0].distance, 1000);
  assert.equal(p.cardio[0].distance_known, 1);
  assert.equal(p.cardio[1].pace_seconds_km, 300);
  assert.equal(
    modality({ fit_sport: "running", fit_sub_sport: "trail" }),
    "trail_running",
  );
  assert.equal(modality({ fit_sport: "hiking" }), "unknown");
});
test("canonical links only; cross-day execution, modified, skipped, unknown and rest", () => {
  const plans = [
    { id: "p1", planned_date: "2026-10-05", linked_completed_session_id: "s" },
    {
      id: "p2",
      planned_date: "2026-10-06",
      status: "modified",
      linked_completed_session_id: "t",
    },
    { id: "p3", planned_date: "2026-10-06", status: "skipped" },
    { id: "p4", planned_date: "2026-10-06", status: "completed" },
    { id: "p5", planned_date: "2026-10-06", session_type: "rest" },
  ];
  const p = build({ plans, sessions: [session("s"), session("t")] });
  assert.deepEqual(
    [
      p.planning.total,
      p.planning.linked,
      p.planning.modified,
      p.planning.skipped,
      p.planning.unknown,
    ],
    [4, 1, 1, 1, 1],
  );
  assert.equal(p.planning.adherence, 0.5);
});
test("complete periods, >100 sessions, no duplicates, empty weeks, current partial", () => {
  const sessions = Array.from({ length: 125 }, (_, i) => session(String(i)));
  const p = build({ sessions: [...sessions, sessions[0]], exercises: [] });
  assert.equal(p.summary.sessions, 125);
  assert.equal(p.weeks.length, 12);
  assert.equal(p.weeks.at(-1).partial, true);
  assert.equal(p.weeks[0].sessions, 0);
  assert.equal(p.weeks[0].seconds, null);
  assert.deepEqual(periodBounds("2026-10-17", "4"), {
    from: "2026-09-14",
    to: "2026-10-11",
    previousFrom: "2026-08-17",
    days: 28,
  });
  assert.equal(
    build({ firstDate: "2026-09-01" }).session_trend,
    "insufficient_data",
  );
  assert.equal(build({ sessions: [], exercises: [] }).status, "empty");
});
function fakeDb(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      let filters = [],
        limit = Infinity,
        order = "id";
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push((r) => r[k] === v);
          return q;
        },
        in(k, v) {
          filters.push((r) => v.includes(r[k]));
          return q;
        },
        gte(k, v) {
          filters.push((r) => r[k] >= v);
          return q;
        },
        lte(k, v) {
          filters.push((r) => r[k] <= v);
          return q;
        },
        gt(k, v) {
          filters.push((r) => r[k] > v);
          return q;
        },
        order(k) {
          order = k;
          return q;
        },
        limit(n) {
          limit = n;
          return q;
        },
        then(resolve) {
          calls.push(table);
          return Promise.resolve({
            data: (tables[table] || [])
              .filter((r) => filters.every((f) => f(r)))
              .sort((a, b) => String(a[order]).localeCompare(String(b[order])))
              .slice(0, limit),
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
}
test("server pages fully and isolates tenant including exercise child scope", async () => {
  const rows = Array.from({ length: 511 }, (_, i) =>
    session(String(i).padStart(4, "0"), "2026-10-06", {
      session_status: "completed",
    }),
  );
  const db = fakeDb({
    training_sessions: [
      ...rows,
      session("foreign", "2026-10-06", {
        user_id: "b",
        session_status: "completed",
      }),
    ],
    session_exercises: [
      exercise("owned", "0000"),
      exercise("foreign-e", "foreign"),
    ],
    planned_training_sessions: [],
    sport_modalities: [],
  });
  const p = await loadProgress(db, {
    userId: "a",
    calendar: { date: "2026-10-17", timezone: "Europe/Madrid" },
  });
  assert.equal(p.summary.sessions, 511);
  assert.equal(p.strength.length, 1);
  assert.equal(p.strength[0].points[0].exercise_id, "owned");
  assert.ok(!p.summary.session_ids.includes("foreign"));
  assert.equal(
    (
      await readPages(() => db.from("training_sessions").select("*"), {
        pageSize: 100,
      })
    ).length,
    512,
  );
  await assert.rejects(
    readPages(() => db.from("training_sessions"), {
      pageSize: 100,
      maxRows: 200,
    }),
    /scope_too_large/,
  );
});

test("observed records require a previous comparable day, never an estimated 1RM", () => {
  const sessions = [
    session("a", "2026-09-20"),
    session("b", "2026-10-05"),
    session("c", "2026-10-06"),
  ];
  const p = build({
    sessions,
    exercises: [
      exercise("a", "a", { load_value: 15, reps_per_set: [8] }),
      exercise("b", "b", { load_value: 20, reps_per_set: [8] }),
      exercise("c", "c", { load_value: 20, reps_per_set: [10] }),
    ],
  });
  assert.deepEqual(
    p.strength[0].records.map((r) => r.kind),
    ["load", "reps_at_load"],
  );
  assert.equal(p.strength[0].records[0].previous, 15);
  assert.equal(p.strength[0].records[1].value, 10);
  assert.equal(build().strength[0].records.length, 0);
});

test("golden canonical counts preserve reconciled activities and separate same-day Fuerza/Pilates", () => {
  const sessions = [
    session("jul21", "2026-07-21"),
    session("oct7", "2026-10-07"),
    session("oct14", "2026-10-14"),
    session("strength15", "2026-10-15"),
    session("pilates15", "2026-10-15", { modality_code: "yoga_pilates" }),
  ];
  const exercises = [21, 14, 14, 4, 1].flatMap((n, i) =>
    Array.from({ length: n }, (_, j) => exercise(`${i}-${j}`, sessions[i].id)),
  );
  const p = build({
    period: "all",
    sessions,
    exercises,
    plans: [
      { id: "p14", planned_date: "2026-10-14", status: "modified" },
      {
        id: "p15",
        planned_date: "2026-10-15",
        status: "confirmed",
        linked_completed_session_id: "strength15",
      },
    ],
  });
  assert.equal(p.summary.sessions, 5);
  assert.equal(p.planning.linked, 1);
  assert.equal(p.planning.unknown, 1);
  assert.equal(p.strength[0].observations, 54);
  assert.equal(p.strength[0].exposures, 5);
});
test("ambiguous duplicate canonical links do not double credit adherence", () => {
  const plans = ["a", "b"].map((id) => ({
    id,
    planned_date: "2026-10-06",
    linked_completed_session_id: "s",
  }));
  const p = build({ plans });
  assert.equal(p.planning.unknown, 2);
  assert.equal(p.planning.adherence, null);
});
test("bounded card pages preserve aggregates and filter skills before paging", async () => {
  const db = fakeDb({
    training_sessions: [
      session("s", "2026-10-06", { session_status: "completed" }),
    ],
    session_exercises: Array.from({ length: 30 }, (_, i) =>
      exercise(String(i).padStart(2, "0"), "s", {
        reported_name: i === 29 ? "HSPU" : `Press ${i}`,
      }),
    ),
    planned_training_sessions: [],
    sport_modalities: [],
  });
  const args = {
    userId: "a",
    calendar: { date: "2026-10-17", timezone: "Europe/Madrid" },
  };
  const first = await loadProgress(db, args),
    last = await loadProgress(db, { ...args, exercise_page: 2 });
  assert.equal(first.exercise_count, 30);
  assert.equal(first.strength.length, 12);
  assert.equal(last.strength.length, 6);
  assert.deepEqual(first.summary, last.summary);
  const skills = await loadProgress(db, { ...args, skills_only: true });
  assert.equal(skills.exercise_count, 1);
  assert.equal(skills.strength[0].name, "HSPU");
});

test("repeated blocks at one observed best mark do not multiply PRs", () => {
  const sessions = [session("a", "2026-09-20"), session("b", "2026-10-06")];
  const p = build({
    sessions,
    exercises: [
      exercise("old", "a", { load_value: 15 }),
      exercise("new1", "b", { load_value: 20 }),
      exercise("new2", "b", { load_value: 20 }),
    ],
  });
  assert.equal(p.strength[0].record_count, 1);
  assert.equal(p.strength[0].records[0].value, 20);
  assert.equal(p.summary.sessions, 2);
});

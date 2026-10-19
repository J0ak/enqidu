import test from "node:test";
import assert from "node:assert/strict";
import { buildProgress } from "../src/progress/domain.js";
import { buildWeeklyDashboard } from "../src/progress/weeklyDashboard.js";
import { loadProgress } from "../src/progress/loadProgress.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import {
  progressSchema,
  weeklyDashboardSchema,
} from "../src/progress/schema.js";
import {
  createToolsDb,
  TOOL_USER_A,
  TOOL_USER_B,
} from "./support/enqiduToolsDb.mjs";
const session = (id, date, seconds = 600) => ({
  id,
  user_id: TOOL_USER_A,
  title: id,
  local_date: date,
  duration_seconds: seconds,
  session_status: "completed",
  modality_code: "functional_strength",
});
const exercise = (id, session_id, patch = {}) => ({
  id,
  session_id,
  reported_name: "Press banca",
  execution_type: "performed",
  side: "bilateral",
  tempo_or_pause: null,
  load_unit: "kg",
  load_value: 20,
  reps_per_set: [8],
  ...patch,
});
function report(patch = {}) {
  const input = {
    sessions: [
      session("Fuerza", "2026-10-15"),
      session("Pilates", "2026-10-15", 1200),
      session("past", "2026-09-01"),
    ],
    plans: [],
    exercises: [exercise("now", "Fuerza", { reps_per_set: [10] })],
    baselineExercises: [exercise("before", "past")],
    today: "2026-10-17",
    timezone: "Europe/Madrid",
    period: "week",
    comparisonFrom: "2025-10-13",
    ...patch,
  };
  const progress = buildProgress(input);
  return {
    progress,
    weekly: buildWeeklyDashboard({
      progress,
      sessions: input.sessions,
      plans: input.plans,
      exercises: input.exercises,
      blocks: input.blocks || [],
    }),
  };
}
test("daily distribution sums distinct physical sessions; missing, real zero, rest and future differ", () => {
  const { weekly: d } = report({
    sessions: [
      session("Fuerza", "2026-10-15"),
      session("Pilates", "2026-10-15", 1200),
      session("partial", "2026-10-13", null),
      session("zero", "2026-10-12", 0),
      session("future", "2026-10-18"),
    ],
    plans: [
      {
        id: "rest",
        session_type: "rest",
        status: "completed",
        planned_date: "2026-10-16",
      },
    ],
  });
  assert.equal(d.days[3].seconds, 1800);
  assert.equal(d.days[3].activities.length, 2);
  assert.deepEqual(
    d.days.map((day) => day.time_state),
    [
      "observed",
      "missing_duration",
      "unconfirmed",
      "observed",
      "confirmed_rest",
      "unconfirmed",
      "future",
    ],
  );
  assert.deepEqual(
    d.days.map((day) => day.chart_seconds),
    [0, null, null, 1800, 0, null, null],
  );
  assert.equal(d.days[6].activities.length, 0);
  assert.equal(d.days[4].intended_plans[0].status, "confirmed_rest");
  assert.equal(matchesSchema(d, weeklyDashboardSchema), true);
});
test("one weekly exposure can improve against compatible prior history; metrics remain weekly", () => {
  const { progress: p, weekly: d } = report();
  assert.equal(p.summary.sessions, 2);
  assert.equal(p.strength[0].exposures, 1);
  assert.equal(p.strength[0].record_count, 1);
  assert.equal(p.strength[0].records[0].previous_exercise_id, "before");
  assert.equal(p.strength[0].records[0].previous_date, "2026-09-01");
  assert.equal(d.observed_records, 1);
  assert.deepEqual(d.highlights, p.highlights);
  assert.deepEqual(d.insights, p.insights);
  assert.ok(
    d.insights.some(
      (i) => i.kind === "observed_reps_record" && i.text.includes("8 → 10"),
    ),
  );
  assert.equal(d.response_mode, "deterministic");
  assert.equal(d.llm_used, false);
});
test("higher load record is observed, with evidence; never mix units, variants, sides or tempo", () => {
  assert.equal(
    report({ exercises: [exercise("now", "Fuerza", { load_value: 25 })] })
      .progress.strength[0].records[0].kind,
    "load",
  );
  for (const patch of [
    { reported_name: "DB bench" },
    { load_unit: "lb" },
    { side: "left" },
    { tempo_or_pause: "3-1-3" },
    { execution_type: "assisted" },
  ]) {
    assert.equal(
      report({ baselineExercises: [exercise("before", "past", patch)] })
        .progress.strength[0].record_count,
      0,
    );
  }
  assert.equal(
    report({
      sessions: [
        session("Fuerza", "2026-10-15"),
        session("past", "2025-01-01"),
      ],
    }).progress.strength[0].record_count,
    0,
  );
  assert.equal(
    report({
      baselineExercises: [
        exercise("before", "past", { reported_name: "  PRÉSS  BANCA " }),
      ],
    }).progress.strength[0].record_count,
    1,
  );
});
test("semantic evidence preserves notes, numeric arrays only and linked plan authority across dates", () => {
  const { weekly: d } = report({
    plans: [
      {
        id: "plan",
        title: "Upper hipertrofia + skills",
        objective: "Intención",
        planned_date: "2026-10-11",
        session_type: "strength",
        status: "modified",
        linked_completed_session_id: "Fuerza",
      },
      {
        id: "same-date",
        title: "Plan sin enlace",
        planned_date: "2026-10-15",
        session_type: "strength",
        status: "confirmed",
      },
    ],
    exercises: [
      exercise("now", "Fuerza", {
        reps_per_set: ["8 por lado"],
        notes:
          "Modificación registrada: 45 kg x 8 en texto, sin confirmación estructurada.",
      }),
    ],
    blocks: [
      {
        id: "b",
        session_id: "Fuerza",
        name: "strength_skill",
        block_order: 1,
        execution_notes: "Sustitución observada en el bloque",
      },
    ],
  });
  const [strength, pilates] = d.days[3].activities;
  assert.equal(strength.linked_plan.title, "Upper hipertrofia + skills");
  assert.equal(strength.linked_plan.status, "modified");
  assert.equal(pilates.linked_plan, null);
  assert.equal(strength.exercises[0].load, 20);
  assert.equal(strength.exercises[0].reps, null);
  assert.equal(strength.exercises[0].known_volume, null);
  assert.match(strength.exercises[0].notes, /45 kg/);
  assert.equal(strength.blocks[0].notes, "Sustitución observada en el bloque");
  assert.ok(d.insights.some((i) => i.kind === "modified_linked_plan"));
  assert.ok(d.insights.some((i) => i.kind === "unlinked_activity"));
});
test("Unknown is never grouped into an exercise PR or muscle-volume claim; quality is structured", () => {
  const { progress: p, weekly: d } = report({
    exercises: [
      exercise("unknown", "Fuerza", {
        reported_name: "Unknown",
        load_value: 45,
        reps_per_set: [8],
      }),
      exercise("known", "Fuerza", { reps_per_set: null }),
    ],
  });
  assert.equal(p.strength.length, 1);
  assert.equal(d.quality.unidentified_exercises, 1);
  assert.equal(d.quality.status, "partial");
  assert.equal(d.quality.volume, "missing");
  assert.equal(d.quality.comparison, "insufficient_data");
  assert.equal(d.days[3].activities[0].exercises.length, 1);
  assert.ok(d.insights.some((i) => i.kind === "unidentified_exercises"));
  assert.ok(d.insights.some((i) => i.kind === "partial_volume"));
  const partial = report({
    exercises: [
      exercise("a", "Fuerza"),
      exercise("b", "Fuerza", { load_value: null }),
    ],
  }).weekly;
  assert.equal(partial.quality.volume, "partial");
  assert.equal(partial.quality.volume_observations, 1);
});
test("bounded historical loader stays tenant-scoped and shares weekly cards/insights with Progress", async () => {
  const { db, tables } = createToolsDb();
  tables.training_sessions = [
    session("now", "2026-10-15"),
    session("old", "2026-05-01"),
    { ...session("foreign", "2026-05-01"), user_id: TOOL_USER_B },
  ];
  tables.session_exercises = [
    exercise("current", "now", { load_value: 25 }),
    exercise("baseline", "old"),
    exercise("private", "foreign", { load_value: 999 }),
  ];
  tables.session_blocks = [];
  tables.planned_training_sessions = [];
  const p = await loadProgress(db, {
    userId: TOOL_USER_A,
    calendar: { date: "2026-10-17", timezone: "Europe/Madrid" },
    period: "week",
  });
  assert.equal(matchesSchema(p, progressSchema), true);
  assert.equal(p.observed_records, 1);
  assert.equal(p.summary.sessions, 1);
  assert.equal(p.weekly_dashboard.observed_records, p.observed_records);
  assert.deepEqual(p.weekly_dashboard.highlights, p.highlights);
  assert.equal(p.strength[0].records[0].previous_session_id, "old");
  assert.ok(!JSON.stringify(p).includes("private"));
});

test("partial daily duration and structured zero never fabricate completeness", () => {
  const { weekly: d } = report({
    sessions: [
      session("Fuerza", "2026-10-15", 0),
      session("Pilates", "2026-10-15", null),
    ],
    exercises: [
      exercise("zero", "Fuerza", { load_value: 0, reps_per_set: [0] }),
    ],
  });
  assert.equal(d.days[3].chart_seconds, 0);
  assert.equal(d.days[3].time_state, "partial");
  assert.equal(d.days[3].activities[0].exercises[0].known_volume, 0);
  assert.equal(d.quality.status, "partial");
  assert.equal(d.quality.sessions_without_exercises, 1);
  assert.equal(d.quality.duration, "partial");
});
test("structured exercise identity wins over reported labels but never over a changed variant", () => {
  const input = {
    exercises: [
      exercise("now", "Fuerza", {
        exercise_id: "canonical-id",
        canonical_exercise_code: "bench_press",
        reported_name: "Press banca",
        reps_per_set: [10],
      }),
    ],
    baselineExercises: [
      exercise("before", "past", {
        exercise_id: "canonical-id",
        canonical_exercise_code: "bench_press",
        reported_name: "DB bench",
      }),
    ],
  };
  assert.equal(report(input).progress.strength[0].record_count, 1);
  assert.equal(
    report({
      ...input,
      baselineExercises: [{ ...input.baselineExercises[0], side: "left" }],
    }).progress.strength[0].record_count,
    0,
  );
});

test("historical comparison pages beyond 250 sessions without duplicating weekly activity", async () => {
  const { db, tables } = createToolsDb();
  const ids = Array.from(
    { length: 300 },
    (_, i) => `h${String(i).padStart(3, "0")}`,
  );
  tables.training_sessions = [
    session("current", "2026-10-15"),
    ...ids.map((id) => session(id, "2026-05-01")),
  ];
  tables.session_exercises = [
    exercise("current-e", "current", { load_value: 350 }),
    ...ids.map((id, i) => exercise(`${id}-e`, id, { load_value: i })),
  ];
  tables.session_blocks = [];
  tables.planned_training_sessions = [];
  const p = await loadProgress(db, {
    userId: TOOL_USER_A,
    calendar: { date: "2026-10-17", timezone: "Europe/Madrid" },
    period: "week",
  });
  assert.equal(p.summary.sessions, 1);
  assert.equal(p.weekly_dashboard.activity.sessions, 1);
  assert.equal(p.strength[0].records[0].previous, 299);
  assert.equal(p.strength[0].records[0].previous_session_id, "h299");
});

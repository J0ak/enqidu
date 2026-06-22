import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveExerciseAlias } from "../src/training/exerciseCatalog.js";
import { buildCalendarSessionViewModels, calendarSessionMatchesFilters } from "../src/training/liveWeek.js";
import { applyQuickEditToTrainingSession, buildUniversalSessionView, calculateSummaryMetrics, validateAndNormalizeTrainingSession } from "../src/training/metrics.js";
import { buildTrainingSessionCardView } from "../src/training/smartCardView.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(root, "fixtures", name), "utf8"));
}

test("all general fixtures validate against the AI contract", async () => {
  const names = (await readdir(path.join(root, "fixtures"))).filter((name) => name.endsWith(".json"));
  assert.equal(names.length, 14);
  for (const name of names) {
    const result = validateAndNormalizeTrainingSession(await fixture(name));
    assert.deepEqual(result.errors, [], name);
    assert.equal(result.ok, true, name);
  }
});

test("requested fixture families render the two-level smart card", async () => {
  const names = [
    "gym-strength.json",
    "functional-circuit.json",
    "crossfit-amrap.json",
    "emom-session.json",
    "running-intervals.json",
    "swim-main-set.json",
    "mobility-recovery.json",
    "skill-gymnastics.json",
  ];
  for (const name of names) {
    const result = validateAndNormalizeTrainingSession(await fixture(name));
    const view = buildTrainingSessionCardView(result.session, 0);
    assert.deepEqual(view.visible_levels, ["session_summary", "block_detail"], name);
    assert.ok(view.session_summary.blocks.length > 0, name);
    assert.equal(view.block_detail.order_index, 1, name);
  }
});

test("strength block calculates load volume from sets, reps and weight", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("gym-strength.json"));
  const summary = calculateSummaryMetrics(result.session);
  assert.equal(summary.total_load_volume_kg, 2780);
  assert.equal(summary.total_sets, 7);
  assert.equal(summary.total_reps, 44);
});

test("functional circuit keeps stations as block items", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("functional-circuit.json"));
  const block = result.session.blocks[0];
  assert.equal(block.block_format, "circuit");
  assert.equal(block.items.filter((item) => item.item_type === "station").length, 3);
});

test("AMRAP stores time cap and score", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("crossfit-amrap.json"));
  const block = result.session.blocks[0];
  assert.equal(block.block_format, "amrap");
  assert.equal(block.time_cap_s, 720);
  assert.equal(block.score, "7 rondas + 4 reps");
});

test("EMOM stores minute slots and tasks", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("emom-session.json"));
  const minutes = result.session.blocks[0].items.map((item) => item.minute_slot);
  assert.deepEqual(minutes, [1, 2, 3, 4]);
});

test("running intervals preserve interval distance and missing pace", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("running-intervals.json"));
  const interval = result.session.blocks[1].items[0].exercises[0];
  assert.equal(interval.target_distance_m, 400);
  assert.ok(interval.missing_fields.includes("pace_s_per_km"));
});

test("swim main set stores meters, repetitions and rest", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("swim-main-set.json"));
  const item = result.session.blocks[0].items[0];
  const exercise = item.exercises[0];
  assert.equal(item.rest_s, 20);
  assert.equal(exercise.target_reps, 10);
  assert.equal(exercise.target_distance_m, 100);
});

test("exercise normalizer maps aliases to canonical slugs", () => {
  assert.equal(resolveExerciseAlias("pres palof").canonical_slug, "pallof_press");
  assert.equal(resolveExerciseAlias("anti-rotacion con goma").canonical_slug, "pallof_press");
  assert.equal(resolveExerciseAlias("Pallof").canonical_slug, "pallof_press");
});

test("missing fields are explicit and completion is partial", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("general-fitness-basic.json"));
  const summary = calculateSummaryMetrics(result.session);
  assert.ok(summary.missing_fields_count > 0);
  assert.ok(summary.completion_score < 100);
});

test("smart card view model exposes only session summary and block detail", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("general-fitness-basic.json"));
  const view = buildTrainingSessionCardView(result.session, 1);
  assert.deepEqual(view.visible_levels, ["session_summary", "block_detail"]);
  assert.ok(view.session_summary.blocks.length > 0);
  assert.equal(view.block_detail.order_index, 2);
});

test("live week includes completed Garmin and Coach sessions without a plan", () => {
  const sessions = buildCalendarSessionViewModels({
    plannedSessions: [],
    completedSessions: [{
      id: "26a5b01a-7bb3-4500-bac6-948185922ae2",
      title: "HIIT",
      local_date: "2026-06-22",
      duration_seconds: 3484,
      source_id: "source-1",
      external_reference: "fit:abc",
      garminActivityTypeKey: "hiit",
      garminActivityTypeLabel: "HIIT",
      coach_blocks_count: 6,
      coach_exercises_count: 16,
      has_conversation: true,
    }],
    weekStart: "2026-06-22",
    weekEnd: "2026-06-28",
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].kind, "completed");
  assert.equal(sessions[0].date, "2026-06-22");
  assert.equal(sessions[0].durationSeconds, 3484);
  assert.equal(sessions[0].hasFit, true);
  assert.equal(sessions[0].hasCoachBlocks, true);
  assert.equal(sessions[0].blocksCount, 6);
  assert.equal(sessions[0].exercisesCount, 16);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "all", "all"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "garmin", "all"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "coach", "all"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "mixed", "all"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "all", "hiit"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "all", "strength"), false);
});

test("live week accepts pilot RPC completed session summaries", () => {
  const sessions = buildCalendarSessionViewModels({
    plannedSessions: [],
    completedSessions: [{
      session_id: "26a5b01a-7bb3-4500-bac6-948185922ae2",
      date: "2026-06-22",
      title: "HIIT",
      source_type: "garmin_fit",
      garmin_type_key: "hiit",
      garmin_type_label: "HIIT",
      duration_seconds: 3484,
      blocks_count: 6,
      exercises_count: 16,
      metrics_count: 2,
      has_fit: true,
      has_coach_blocks: true,
      status: "completed",
    }],
    weekStart: "2026-06-22",
    weekEnd: "2026-06-28",
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "completed-26a5b01a-7bb3-4500-bac6-948185922ae2");
  assert.equal(sessions[0].completedSessionId, "26a5b01a-7bb3-4500-bac6-948185922ae2");
  assert.equal(sessions[0].title, "HIIT");
  assert.equal(sessions[0].statusLabel, "Ejecutada + Coach");
  assert.equal(sessions[0].hasFit, true);
  assert.equal(sessions[0].hasCoachBlocks, true);
  assert.equal(sessions[0].blocksCount, 6);
  assert.equal(sessions[0].exercisesCount, 16);
  assert.equal(sessions[0].metricsCount, 2);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "garmin", "all"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "coach", "all"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "mixed", "all"), true);
});

test("live week merges planned week with completed monday and preserves source filters", () => {
  const completed = {
    id: "completed-1",
    title: "HIIT",
    local_date: "2026-06-22",
    duration_seconds: 3484,
    source_id: "source-1",
    external_reference: "fit:abc",
    garminActivityTypeKey: "hiit",
    garminActivityTypeLabel: "HIIT",
    coach_blocks_count: 6,
    coach_exercises_count: 16,
    has_conversation: true,
  };
  const planned = [
    ["2026-06-23", null, "Recuperacion activa", "recovery", "planned"],
    ["2026-06-24", "07:00", "Hibrido fuera de casa", "hybrid", "planned"],
    ["2026-06-25", "18:00", "Yoga", "yoga", "confirmed"],
    ["2026-06-26", null, "Fuerza tecnica en casa", "strength", "adaptable"],
    ["2026-06-27", null, "Funcional", "functional", "probable"],
    ["2026-06-28", null, "Descanso", "recovery", "recommended"],
  ].map(([planned_date, planned_time, title, session_type, status], index) => ({
    id: `planned-${index}`,
    planned_date,
    planned_time,
    title,
    session_type,
    status,
    objective: `${title} objetivo`,
    planned_session_blocks: [{
      id: `block-${index}`,
      block_order: 1,
      title: `${title} bloque`,
      objective: "Trabajo previsto",
      planned_exercises: [],
      constraints: [],
    }],
  }));
  const sessions = buildCalendarSessionViewModels({
    plannedSessions: planned,
    completedSessions: [completed],
    weekStart: "2026-06-22",
    weekEnd: "2026-06-28",
  });

  assert.equal(sessions.length, 7);
  assert.deepEqual(sessions.map((session) => session.date), [
    "2026-06-22",
    "2026-06-23",
    "2026-06-24",
    "2026-06-25",
    "2026-06-26",
    "2026-06-27",
    "2026-06-28",
  ]);
  assert.equal(sessions.filter((session) => calendarSessionMatchesFilters(session, "all", "all")).length, 7);
  assert.equal(sessions.filter((session) => calendarSessionMatchesFilters(session, "garmin", "all")).length, 1);
  assert.equal(sessions.filter((session) => calendarSessionMatchesFilters(session, "coach", "all")).length, 1);
  assert.equal(sessions.filter((session) => calendarSessionMatchesFilters(session, "mixed", "all")).length, 1);
  assert.equal(sessions.filter((session) => calendarSessionMatchesFilters(session, "all", "hiit")).length, 1);
  assert.equal(sessions.find((session) => session.status === "adaptable").statusLabel, "Adaptable");
  assert.equal(sessions.find((session) => session.status === "probable").statusLabel, "Probable");
  assert.equal(sessions.find((session) => session.status === "recommended").statusLabel, "Recomendada");
});

test("external adapter fixtures do not require Garmin/FIT as canonical model", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("hybrid-session.json"));
  assert.equal(result.session.source_links.length, 0);
  assert.equal(result.session.blocks[0].block_type, "strength_main");
});

test("legacy blocks adapt to canonical view but Garmin-only detail stays empty", () => {
  const legacy = buildUniversalSessionView({
    session: { id: "session-1", title: "Legacy", activity_type: "strength", duration_seconds: 600 },
    blocks: [
      {
        id: "block-1",
        block_type: "Fuerza",
        name: "Fuerza",
        exerciseDetails: [{ name: "Press banca", detailText: "4 series · reps pendientes · peso pendiente" }],
      },
    ],
  });
  assert.equal(legacy.blocks.length, 1);
  assert.equal(legacy.blocks[0].items[0].exercises[0].exercise_id, "bench_press");

  const garminOnly = buildUniversalSessionView({
    session: { id: "session-2", title: "Garmin only", activity_type: "running", duration_seconds: 1800 },
    garminBlocks: [{ id: "lap-1" }],
    blocks: [],
  });
  assert.equal(garminOnly.blocks.length, 0);
});

test("quick edit patch recalculates missing fields and completion", async () => {
  const result = validateAndNormalizeTrainingSession(await fixture("general-fitness-basic.json"));
  const exercise = result.session.blocks[1].items[1].exercises[0];
  const next = applyQuickEditToTrainingSession(result.session, exercise.exercise_id, {
    reps: 10,
    load_kg: 12,
  });
  const updated = next.blocks[1].items[1].exercises[0];
  assert.equal(updated.missing_fields.includes("reps"), false);
  assert.equal(updated.missing_fields.includes("load_kg"), false);
  assert.ok(next.summary_metrics.completion_score > result.session.summary_metrics.completion_score);
});

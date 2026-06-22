import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveExerciseAlias } from "../src/training/exerciseCatalog.js";
import { buildCalendarSessionViewModels, calendarSessionMatchesFilters } from "../src/training/liveWeek.js";
import { applyQuickEditToTrainingSession, buildUniversalSessionView, calculateSummaryMetrics, validateAndNormalizeTrainingSession } from "../src/training/metrics.js";
import { normalizeSessionDetailFromPilotRpc } from "../src/training/sessionDetail.js";
import { buildTrainingSessionCardView } from "../src/training/smartCardView.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(root, "fixtures", name), "utf8"));
}

function buildPilotDetailPayload() {
  const blockSpecs = [
    ["mobility", "Estiramientos y movilidad inicial", [["Movilidad y estiramientos generales"]]],
    ["warmup", "Calentamiento con kettlebell y escaladores", [
      ["Kettlebell high pull / remo alto", { rounds_completed: 2, load_value: 16, load_unit: "kg", side: "bilateral" }],
      ["Remo unilateral con kettlebell", { rounds_completed: 2, reps_per_set: [{ each_side: 10 }, { each_side: 10 }], load_value: 16, load_unit: "kg", side: "each_side" }],
      ["Escaladores", { rounds_completed: 2, reps_per_set: [10, 10], side: "alternating" }],
    ]],
    ["conditioning", "Híbrido A", [
      ["Lunge con press hacia arriba y vuelos laterales", { load_value: 5, load_unit: "kg", side: "alternating" }],
      ["Plancha con empuje y tracción de saco", { reps_per_set: [{ each_side: 6 }], side: "each_side" }],
      ["Step-up lateral al cajón con rodilla arriba y kettlebell en goblet", { reps_per_set: [{ each_side: 6 }], load_value: 20, load_unit: "kg", side: "each_side" }],
      ["Remo ergómetro", { duration_seconds: 30, load_value: 45, load_unit: "spm", side: "na" }],
    ]],
    ["conditioning", "Híbrido B", [
      ["Media wall ball / sentadilla con balón medicinal a media altura", { rounds_completed: 2, reps_per_set: [10, 10], load_value: 12, load_unit: "kg" }],
      ["Remo en anillas unilateral con brazo contrario extendido arriba", { rounds_completed: 2, reps_per_set: [{ each_side: 6 }, { each_side: 6 }], side: "each_side" }],
      ["Leñador con kettlebell", { rounds_completed: 2, reps_per_set: [{ each_side: 6 }, { each_side: 6 }], load_value: 12, load_unit: "kg", side: "each_side" }],
      ["Assault bike", { rounds_completed: 2, duration_seconds: 30, load_value: 77, load_unit: "rpm", side: "na" }],
    ]],
    ["metcon", "Finisher corto carrera / escaladores / salto sentadilla", [
      ["Shuttle run 8 m", { load_value: 8, load_unit: "m", side: "na" }],
      ["Escaladores", { reps_per_set: [10], side: "alternating" }],
      ["Sentadilla con salto", { reps_per_set: [8], side: "bilateral" }],
    ]],
    ["cooldown", "Vuelta a la calma", [["Estiramientos finales"]]],
  ];

  return {
    ok: true,
    session: {
      session_id: "26a5b01a-7bb3-4500-bac6-948185922ae2",
      date: "2026-06-22",
      title: "HIIT",
      status: "completed",
      session_kind: "completed",
      source_type: "garmin_fit",
      garmin_type_key: "hiit",
      garmin_type_label: "HIIT",
      has_fit: true,
      has_coach_blocks: true,
      duration_seconds: 3484,
      blocks_count: 6,
      exercises_count: 16,
      metrics_count: 2,
    },
    garmin_summary: {
      duration_seconds: 3484,
      active_seconds: 2507,
      rest_seconds: 978,
      calories_kcal: 486,
      heart_rate_avg_bpm: 113,
      heart_rate_max_bpm: 156,
      training_effect_aerobic: 3,
      training_effect_anaerobic: 0.5,
      respiration_avg: 26.79,
    },
    garmin_detail: {
      samples: {
        heart_rate: [
          { sample_order: 1, elapsed_seconds: 0, recorded_at: "2026-06-22T04:59:54.000Z", heart_rate_bpm: 72 },
          { sample_order: 2, elapsed_seconds: 120, recorded_at: "2026-06-22T05:01:54.000Z", heart_rate_bpm: 130 },
          { sample_order: 3, elapsed_seconds: 3484, recorded_at: "2026-06-22T05:57:58.000Z", heart_rate_bpm: 103 },
        ],
        respiration: [
          { sample_order: 1, elapsed_seconds: 0, recorded_at: "2026-06-22T04:59:54.000Z", respiration_brpm: 18.5 },
          { sample_order: 2, elapsed_seconds: 120, recorded_at: "2026-06-22T05:01:54.000Z", respiration_brpm: 28.2 },
        ],
        power: [],
        cadence: [],
        speed: [],
      },
      laps: [
        {
          lap_order: 1,
          duration_seconds: 3484,
          elapsed_seconds: 3484,
          distance_m: 0,
          calories_kcal: 486,
          heart_rate_avg_bpm: 113,
          heart_rate_max_bpm: 156,
          active_seconds: 2507,
          rest_seconds: 978,
        },
      ],
      zones: { heart_rate: [], power: [] },
      series_metadata: {
        source: "fit_records_sanitized",
        downsampled: true,
        max_points: 600,
      },
    },
    metrics: [],
    blocks: blockSpecs.map(([block_type, name, exercises], blockIndex) => ({
      id: `block-${blockIndex + 1}`,
      block_order: blockIndex + 1,
      block_type,
      name,
      execution_notes: `${name} notas`,
      data_confidence: "reported",
      exercises: exercises.map(([reported_name, rest = {}], exerciseIndex) => ({
        id: `exercise-${blockIndex + 1}-${exerciseIndex + 1}`,
        exercise_order: exerciseIndex + 1,
        reported_name,
        execution_type: "performed",
        equipment_snapshot: {},
        data_confidence: "reported",
        ...rest,
      })),
    })),
    source_warnings: [],
  };
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

test("pilot RPC detail normalizer preserves rich blocks, exercises and loads", () => {
  const payload = buildPilotDetailPayload();
  const detail = normalizeSessionDetailFromPilotRpc(payload);
  const exercises = detail.blocks.flatMap((block) => block.exerciseDetails);

  assert.equal(detail.session.id, "26a5b01a-7bb3-4500-bac6-948185922ae2");
  assert.equal(detail.session.duration_seconds, 3484);
  assert.equal(detail.session.hasFit, true);
  assert.equal(detail.blocks.length, 6);
  assert.equal(exercises.length, 16);
  assert.equal(detail.hasConversationBlocks, true);
  assert.equal(detail.session.avg_hr, 113);
  assert.equal(detail.session.training_effect_aerobic, 3);
  assert.equal(detail.session.calories_total, 486);
  assert.equal(detail.session.active_seconds, 2507);
  assert.equal(detail.session.rest_seconds, 978);
  assert.ok(exercises.find((exercise) => exercise.name === "Kettlebell high pull / remo alto").detailText.includes("16 kg"));
  assert.ok(exercises.find((exercise) => exercise.name.startsWith("Step-up lateral")).detailText.includes("20 kg"));
  assert.ok(exercises.find((exercise) => exercise.name.startsWith("Media wall ball")).detailText.includes("12 kg"));
  assert.ok(exercises.find((exercise) => exercise.name.startsWith("Leñador")).detailText.includes("12 kg"));
  assert.ok(exercises.find((exercise) => exercise.name === "Assault bike").detailText.includes("77 rpm"));
  assert.ok(exercises.find((exercise) => exercise.name === "Remo ergómetro").detailText.includes("45 spm"));
});

test("pilot RPC detail normalizer preserves real Garmin HR series", () => {
  const detail = normalizeSessionDetailFromPilotRpc(buildPilotDetailPayload());
  const hrValues = detail.samples.map((sample) => sample.heart_rate_bpm);

  assert.equal(detail.samples.length, 3);
  assert.deepEqual(detail.samples.map((sample) => sample.elapsed_seconds), [0, 120, 3484]);
  assert.deepEqual(hrValues, [72, 130, 103]);
  assert.equal(new Set(hrValues).size > 1, true);
  assert.equal(detail.samples[1].heartRateBpm, 130);
  assert.equal(detail.heartRateSamples.length, 3);
  assert.equal(detail.respirationSamples.length, 2);
});

test("pilot RPC detail normalizer does not create flat HR fallback without samples", () => {
  const payload = buildPilotDetailPayload();
  payload.garmin_detail.samples.heart_rate = [];
  payload.garmin_detail.laps = [];
  const detail = normalizeSessionDetailFromPilotRpc(payload);

  assert.equal(detail.session.avg_hr, 113);
  assert.equal(detail.session.max_hr, 156);
  assert.equal(detail.samples.length, 0);
  assert.equal(detail.garminBlocks.length, 0);
});

test("pilot RPC detail normalizer preserves old Garmin card zones and laps contract", () => {
  const detail = normalizeSessionDetailFromPilotRpc(buildPilotDetailPayload());

  assert.equal(detail.zones.length, 5);
  assert.equal(detail.heartRateZones.length, 5);
  assert.ok(detail.heartRateZones.find((zone) => zone.key === "Z3" && zone.seconds > 0));
  assert.equal(detail.garminBlocks.length, 1);
  assert.equal(detail.laps.length, 1);
  assert.equal(detail.laps[0].durationSeconds, 3484);
  assert.equal(detail.laps[0].heartRateMaxBpm, 156);
});

test("pilot RPC detail normalizer derives Garmin block windows from real samples when laps are missing", () => {
  const payload = buildPilotDetailPayload();
  payload.session.duration_seconds = 1400;
  payload.garmin_summary.duration_seconds = 1400;
  payload.garmin_detail.laps = [];
  payload.garmin_detail.samples.heart_rate = [
    { sample_order: 1, elapsed_seconds: 0, heart_rate_bpm: 95 },
    { sample_order: 2, elapsed_seconds: 120, heart_rate_bpm: 100 },
    { sample_order: 3, elapsed_seconds: 610, heart_rate_bpm: 130 },
    { sample_order: 4, elapsed_seconds: 720, heart_rate_bpm: 140 },
    { sample_order: 5, elapsed_seconds: 1210, heart_rate_bpm: 150 },
    { sample_order: 6, elapsed_seconds: 1320, heart_rate_bpm: 156 },
  ];
  const detail = normalizeSessionDetailFromPilotRpc(payload);

  assert.equal(detail.garminBlocks.length, 3);
  assert.equal(detail.garminBlocks[0].source, "garmin_fit_sample_window");
  assert.equal(detail.garminBlocks[0].zones.find((zone) => zone.key === "Z1").seconds > 0, true);
  assert.equal(detail.garminBlocks[1].zones.find((zone) => zone.key === "Z3").seconds > 0, true);
  assert.equal(detail.garminBlocks[2].zones.find((zone) => zone.key === "Z4").seconds > 0, true);
  assert.equal(detail.garminBlocks[1].heart_rate_max_bpm, 140);
});

test("pilot RPC detail normalizer preserves reps per side without flattening source data", () => {
  const detail = normalizeSessionDetailFromPilotRpc(buildPilotDetailPayload());
  const stepUp = detail.blocks.flatMap((block) => block.exerciseDetails).find((exercise) => exercise.name.startsWith("Step-up lateral"));

  assert.deepEqual(stepUp.repsPerSet, [{ each_side: 6 }]);
  assert.equal(stepUp.detailText.includes("6/lado"), true);
  assert.equal(stepUp.loadValue, 20);
  assert.equal(stepUp.loadUnit, "kg");
});

test("live week keeps Yoga as Yoga and filters it away from strength", () => {
  const sessions = buildCalendarSessionViewModels({
    plannedSessions: [],
    completedSessions: [{
      session_id: "472f5409-4e50-4374-9a8c-905ddadb16e7",
      date: "2026-06-18",
      title: "Yoga",
      source_type: "garmin_fit",
      garmin_type_key: "yoga",
      garmin_type_label: "Yoga",
      duration_seconds: 3570,
      blocks_count: 1,
      exercises_count: 1,
      has_fit: true,
      has_coach_blocks: true,
      status: "completed",
    }],
    weekStart: "2026-06-15",
    weekEnd: "2026-06-21",
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].typeKey, "yoga");
  assert.equal(sessions[0].typeLabel, "Yoga");
  assert.equal(sessions[0].chips.includes("Yoga"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "all", "yoga"), true);
  assert.equal(calendarSessionMatchesFilters(sessions[0], "all", "strength"), false);
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

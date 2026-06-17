import { resolveExerciseAlias } from "./exerciseCatalog.js";
import { validateTrainingSessionContract } from "./schema.js";

const measurementRequiredFields = {
  sets_reps_load: ["sets", "reps", "load_kg"],
  reps_only: ["reps"],
  reps_per_side: ["reps_per_side"],
  duration: ["duration_s"],
  distance: ["distance_m"],
  rounds: ["rounds"],
  rounds_for_time: ["rounds", "duration_s"],
  amrap_score: ["time_cap_s", "score"],
  emom: ["minute_slot", "reps"],
  intervals: ["distance_m", "duration_s", "rest_s"],
  swim_set: ["distance_m", "reps", "rest_s"],
  skill_attempts: ["sets", "attempts"],
  breathing: ["duration_s"],
  mobility_hold: ["duration_s"],
  cardio_duration_distance: ["duration_s", "distance_m"],
  calories: ["calories"],
  power: ["power_w"],
  pace: ["pace_s_per_km"],
  heart_rate_zone: ["heart_rate_zone"],
  mixed: [],
};

export function calculateSummaryMetrics(session) {
  const blocks = session?.blocks || [];
  const exercises = blocks.flatMap((block) => (block.items || []).flatMap((item) => item.exercises || []));
  const performedSets = exercises.flatMap((exercise) => exercise.performed_sets || []);
  const missingFields = collectMissingFields(session);
  const totalReps = sumNumbers(performedSets.map((set) => set.reps));
  const totalRepsPerSide = sumNumbers(performedSets.map((set) => set.reps_left)) + sumNumbers(performedSets.map((set) => set.reps_right));
  const totalLoadVolumeKg = sumNumbers(performedSets.map((set) => {
    const reps = Number(set.reps ?? 0) || (Number(set.reps_left ?? 0) + Number(set.reps_right ?? 0));
    const load = Number(set.load_kg ?? 0);
    return reps > 0 && load > 0 ? reps * load : 0;
  }));
  const durationByType = (types) => sumNumbers(blocks.filter((block) => types.includes(block.block_type)).map((block) => block.duration_s));

  const summary = {
    total_blocks: blocks.length,
    total_items: blocks.reduce((sum, block) => sum + (block.items?.length || 0), 0),
    total_exercises: exercises.length,
    total_duration_s: optionalNumber(session?.session?.total_duration_s) ?? sumNumbers(blocks.map((block) => block.duration_s)),
    total_rounds: sumNumbers(blocks.map((block) => block.rounds)),
    total_sets: performedSets.length || sumNumbers(exercises.map((exercise) => exercise.target_sets)),
    total_reps: totalReps,
    total_reps_per_side: totalRepsPerSide,
    total_load_volume_kg: totalLoadVolumeKg,
    total_distance_m: sumNumbers(performedSets.map((set) => set.distance_m)),
    total_cardio_duration_s: durationByType(["conditioning", "endurance", "intervals", "z2", "threshold", "bike_interval", "swim_main_set"]),
    total_strength_sets: blocks
      .filter((block) => ["strength_main", "strength_accessory", "hypertrophy", "power"].includes(block.block_type))
      .flatMap((block) => (block.items || []).flatMap((item) => item.exercises || []))
      .reduce((sum, exercise) => sum + (exercise.performed_sets?.length || optionalNumber(exercise.target_sets) || 0), 0),
    total_mobility_duration_s: durationByType(["mobility", "breathing", "cooldown", "rehab", "prehab"]),
    missing_fields_count: missingFields.length,
    completion_score: completionScore(session),
  };

  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value != null && value !== 0));
}

export function validateAndNormalizeTrainingSession(raw) {
  const validation = validateTrainingSessionContract(raw);
  if (!validation.ok) return { ok: false, errors: validation.errors, session: raw };
  const blocks = raw.blocks.map((block) => ({
    ...block,
    missing_fields: [...new Set([...(block.missing_fields || []), ...missingFieldsForBlock(block)])],
    items: (block.items || []).map((item) => ({
      ...item,
      exercises: (item.exercises || []).map((exercise) => {
        const catalogExercise = resolveExerciseAlias(exercise.display_name || exercise.exercise_id);
        const normalized = {
          ...exercise,
          exercise_id: catalogExercise?.canonical_slug || exercise.exercise_id,
          canonical_slug: catalogExercise?.canonical_slug || exercise.canonical_slug || exercise.exercise_id,
          display_name: exercise.display_name || catalogExercise?.display_name_es || exercise.exercise_id,
          missing_fields: [...new Set([...(exercise.missing_fields || []), ...missingFieldsForExercise(exercise)])],
        };
        return {
          ...normalized,
          summary_metrics: {
            ...(normalized.summary_metrics || {}),
            load_volume_kg: calculateExerciseVolume(normalized),
          },
        };
      }),
    })),
  }));
  const session = {
    ...raw,
    blocks,
  };
  return {
    ok: true,
    errors: [],
    session: {
      ...session,
      summary_metrics: {
        ...(session.summary_metrics || {}),
        ...calculateSummaryMetrics(session),
      },
    },
  };
}

export function buildUniversalSessionView(detail = {}) {
  const canonical = detail.canonicalTrainingSession || detail.session?.universal_training_session;
  const normalized = canonical ? validateAndNormalizeTrainingSession(canonical).session : legacyToCanonicalView(detail);
  const summary = {
    ...(normalized.summary_metrics || {}),
    ...(normalized.session?.summary_metrics || {}),
    ...calculateSummaryMetrics(normalized),
  };
  return {
    ...normalized,
    session: {
      ...(normalized.session || {}),
      title: normalized.session?.title || detail.session?.title || "Sesión",
      session_type: normalized.session?.session_type || detail.session?.activity_type || "mixed",
      total_duration_s: normalized.session?.total_duration_s ?? detail.session?.duration_seconds,
      summary_metrics: summary,
    },
    summary_metrics: summary,
  };
}

export function legacyToCanonicalView(detail = {}) {
  return fromActivityDetail(detail);
}

export function applyQuickEditToTrainingSession(session, itemExerciseId, values) {
  const blocks = (session?.blocks || []).map((block) => ({
    ...block,
    items: (block.items || []).map((item) => ({
      ...item,
      exercises: (item.exercises || []).map((exercise) => {
        const matches = [exercise.item_exercise_id, exercise.id, exercise.exercise_id].filter(Boolean).includes(itemExerciseId);
        if (!matches) return exercise;
        const nextSet = {
          ...(exercise.performed_sets?.[0] || { set_index: 1, completed: true }),
          ...performedSetPatch(values),
          completed: true,
        };
        const missingFields = (exercise.missing_fields || []).filter((field) => !fieldWasProvided(field, values));
        const nextExercise = {
          ...exercise,
          missing_fields: missingFields,
          performed_sets: [nextSet, ...(exercise.performed_sets || []).slice(1)],
        };
        return {
          ...nextExercise,
          summary_metrics: {
            ...(nextExercise.summary_metrics || {}),
            load_volume_kg: calculateExerciseVolume(nextExercise),
          },
        };
      }),
    })),
  }));
  const nextSession = { ...session, blocks };
  const summary = {
    ...(nextSession.summary_metrics || {}),
    ...calculateSummaryMetrics(nextSession),
  };
  return {
    ...nextSession,
    session: {
      ...(nextSession.session || {}),
      summary_metrics: summary,
    },
    summary_metrics: summary,
  };
}

export function blockMeasurementLabel(block) {
  const labels = new Set();
  (block.items || []).forEach((item) => {
    (item.exercises || []).forEach((exercise) => labels.add(measurementLabel(exercise.measurement_type)));
  });
  return [...labels].filter(Boolean).join(" / ") || measurementLabel(block.primary_measurement_type) || "medicion";
}

export function collectMissingFields(session) {
  const missing = [];
  (session?.blocks || []).forEach((block) => {
    (block.missing_fields || []).forEach((field) => missing.push(`block:${block.order_index}:${field}`));
    (block.items || []).forEach((item) => {
      (item.exercises || []).forEach((exercise) => {
        (exercise.missing_fields || missingFieldsForExercise(exercise)).forEach((field) => {
          missing.push(`${exercise.exercise_id}:${field}`);
        });
      });
    });
  });
  return missing;
}

export function calculateExerciseVolume(exercise) {
  return sumNumbers((exercise.performed_sets || []).map((set) => {
    const reps = Number(set.reps ?? 0) || Number(set.reps_left ?? 0) + Number(set.reps_right ?? 0);
    const load = Number(set.load_kg ?? 0);
    return reps > 0 && load > 0 ? reps * load : 0;
  }));
}

function fromActivityDetail(detail) {
  const blocks = (detail.blocks || []).map((block, blockIndex) => {
    const exercises = (block.exerciseDetails || []).length
      ? block.exerciseDetails
      : [{ name: block.name || block.summaryText || `Bloque ${blockIndex + 1}`, detailText: block.summaryText }];
    return {
      id: block.id,
      order_index: blockIndex + 1,
      block_type: normalizeBlockType(block.typeLabel || block.block_type || block.name),
      block_format: inferBlockFormat(block),
      primary_measurement_type: inferMeasurementType(block),
      duration_s: optionalNumber(block.duration_seconds),
      rounds: optionalNumber(block.rounds_completed),
      summary_metrics: {
        exercise_count: exercises.length,
        missing_fields_count: exercises.reduce((sum, exercise) => sum + missingFieldsForFreeText(exercise.detailText).length, 0),
      },
      items: exercises.map((exercise, exerciseIndex) => {
        const catalogExercise = resolveExerciseAlias(exercise.name);
        const measurement = inferExerciseMeasurement(exercise.detailText || block.summaryText || "");
        const missingFields = missingFieldsForFreeText(exercise.detailText, measurement);
        return {
          order_index: exerciseIndex + 1,
          item_type: inferItemType(block),
          station_label: block.block_format === "circuit" ? `Estación ${exerciseIndex + 1}` : undefined,
          item_name: exercise.name,
          exercises: [
            {
              exercise_id: catalogExercise?.canonical_slug || slugify(exercise.name),
              canonical_slug: catalogExercise?.canonical_slug || slugify(exercise.name),
              display_name: catalogExercise?.display_name_es || exercise.name || "Ejercicio",
              measurement_type: measurement,
              missing_fields: missingFields,
              notes: exercise.notes,
              summary_metrics: {},
            },
          ],
        };
      }),
    };
  });

  return {
    schema_version: "enqidu_training_session_v1",
    session: {
      id: detail.session?.id,
      title: detail.session?.title || "Sesión",
      session_type: detail.session?.activity_type || "mixed",
      total_duration_s: detail.session?.duration_seconds,
    },
    planned: {},
    performed: {},
    interpreted: {},
    blocks,
    missing_fields: [],
    summary_metrics: {},
    source_links: [],
  };
}

function missingFieldsForBlock(block) {
  if (block.block_format === "amrap" && !block.score) return ["score"];
  if (block.block_format === "emom" && !block.time_cap_s && !block.duration_s) return ["duration_s"];
  if (["rounds", "circuit"].includes(block.block_format) && !block.rounds) return ["rounds"];
  return [];
}

function missingFieldsForExercise(exercise) {
  const required = measurementRequiredFields[exercise.measurement_type] || [];
  return required.filter((field) => !hasMetric(exercise, field));
}

function missingFieldsForFreeText(text = "", measurement = "mixed") {
  const lower = `${text}`.toLowerCase();
  if (lower.includes("pendiente")) return [];
  if (measurement === "sets_reps_load") {
    return [
      /\b\d+\s*x\s*\d+|\b\d+\s*series/i.test(lower) ? null : "sets",
      /\b\d+\s*reps?|\b\d+\s*x\s*\d+/i.test(lower) ? null : "reps",
      /\b\d+([,.]\d+)?\s*kg/i.test(lower) ? null : "load_kg",
    ].filter(Boolean);
  }
  if (measurement === "duration") return /\d+\s*(s|min|')/.test(lower) ? [] : ["duration_s"];
  if (measurement === "cardio_duration_distance") {
    return [
      /\d+\s*(s|min|')/.test(lower) ? null : "duration_s",
      /\d+\s*(m|km)\b/.test(lower) ? null : "distance_m",
    ].filter(Boolean);
  }
  if (measurement === "reps_per_side") return /\d+/.test(lower) ? [] : ["reps_per_side"];
  return [];
}

function hasMetric(exercise, field) {
  if (exercise[field] != null) return true;
  if ((exercise.performed_sets || []).some((set) => set[field] != null)) return true;
  if (field === "sets" && (exercise.performed_sets || []).length) return true;
  if (field === "reps_per_side" && (exercise.performed_sets || []).some((set) => set.reps_left != null || set.reps_right != null)) return true;
  return false;
}

function performedSetPatch(values = {}) {
  const patch = {};
  if (values.reps != null) patch.reps = values.reps;
  if (values.reps_per_side != null) {
    patch.reps_left = values.reps_per_side;
    patch.reps_right = values.reps_per_side;
  }
  if (values.load_kg != null) patch.load_kg = values.load_kg;
  if (values.duration_s != null) patch.duration_s = values.duration_s;
  if (values.distance_m != null) patch.distance_m = values.distance_m;
  if (values.rpe != null) patch.rpe = values.rpe;
  if (values.rir != null) patch.rir = values.rir;
  return patch;
}

function fieldWasProvided(field, values = {}) {
  if (field === "sets") return ["reps", "reps_per_side", "load_kg", "duration_s", "distance_m"].some((key) => values[key] != null);
  if (field === "reps_per_side") return values.reps_per_side != null;
  return values[field] != null;
}

function completionScore(session) {
  const exercises = (session?.blocks || []).flatMap((block) => (block.items || []).flatMap((item) => item.exercises || []));
  const requiredCount = exercises.reduce((sum, exercise) => sum + (measurementRequiredFields[exercise.measurement_type]?.length || 0), 0);
  if (!requiredCount) return 100;
  const missingCount = exercises.reduce((sum, exercise) => sum + (exercise.missing_fields || missingFieldsForExercise(exercise)).length, 0);
  return Math.max(0, Math.min(100, Math.round(((requiredCount - missingCount) / requiredCount) * 100)));
}

function inferItemType(block) {
  const text = `${block.typeLabel || block.name || ""}`.toLowerCase();
  if (text.includes("estacion") || text.includes("circuit")) return "station";
  if (text.includes("emom")) return "emom_minute";
  if (text.includes("amrap")) return "amrap_task";
  if (text.includes("interval")) return "interval_task";
  return "exercise_direct";
}

function inferBlockFormat(block) {
  const text = `${block.typeLabel || block.name || block.summaryText || ""}`.toLowerCase();
  if (text.includes("emom")) return "emom";
  if (text.includes("amrap")) return "amrap";
  if (text.includes("circuit") || text.includes("estacion")) return "circuit";
  if (text.includes("interval")) return "interval";
  if (text.includes("movilidad") || text.includes("mobility")) return "mobility_flow";
  return "mixed";
}

function normalizeBlockType(text = "") {
  const lower = text.toLowerCase();
  if (lower.includes("fuerza") || lower.includes("strength")) return "strength_main";
  if (lower.includes("movilidad") || lower.includes("mobility")) return "mobility";
  if (lower.includes("cardio") || lower.includes("conditioning")) return "conditioning";
  if (lower.includes("cooldown") || lower.includes("vuelta")) return "cooldown";
  if (lower.includes("emom")) return "emom";
  if (lower.includes("amrap")) return "amrap";
  if (lower.includes("rehab")) return "rehab";
  return "mixed";
}

function inferMeasurementType(block) {
  const text = `${block.typeLabel || block.name || block.summaryText || ""}`.toLowerCase();
  if (text.includes("emom")) return "emom";
  if (text.includes("amrap")) return "amrap_score";
  if (text.includes("running") || text.includes("cardio") || text.includes("remo")) return "cardio_duration_distance";
  if (text.includes("movilidad") || text.includes("respir")) return "duration";
  if (text.includes("fuerza") || text.includes("series")) return "sets_reps_load";
  return "mixed";
}

function inferExerciseMeasurement(text = "") {
  const lower = text.toLowerCase();
  if (lower.includes("kg") || lower.includes("series")) return "sets_reps_load";
  if (lower.includes("lado")) return "reps_per_side";
  if (lower.includes("m ") || lower.includes("km") || lower.includes("cal")) return "cardio_duration_distance";
  if (lower.includes("seg") || lower.includes("min") || lower.includes('"') || lower.includes("'")) return "duration";
  return "mixed";
}

function measurementLabel(type) {
  return {
    sets_reps_load: "series/reps/peso",
    reps_only: "reps",
    reps_per_side: "reps/lado",
    duration: "tiempo",
    distance: "distancia",
    rounds: "rondas",
    rounds_for_time: "rondas/tiempo",
    amrap_score: "score",
    emom: "minuto/tarea",
    intervals: "intervalos",
    swim_set: "metros/descanso",
    skill_attempts: "intentos",
    breathing: "respiración",
    mobility_hold: "tiempo",
    cardio_duration_distance: "tiempo/distancia",
    calories: "calorías",
    power: "potencia",
    pace: "ritmo",
    heart_rate_zone: "zona FC",
    mixed: "mixto",
  }[type];
}

function slugify(value) {
  return `${value || "exercise"}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function sumNumbers(values) {
  return values.reduce((sum, value) => {
    const number = optionalNumber(value);
    return number == null ? sum : sum + number;
  }, 0);
}

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

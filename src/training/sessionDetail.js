export function normalizeSessionDetailFromPilotRpc(payload = {}) {
  const sourceSession = payload.session || {};
  const garminSummary = payload.garmin_summary || {};
  const garminDetail = payload.garmin_detail || {};
  const garminSamples = garminDetail.samples || {};
  const heartRateSamples = normalizeHeartRateSamples(garminSamples.heart_rate || []);
  const respirationSamples = normalizeRespirationSamples(garminSamples.respiration || []);
  const reportedZones = normalizeHeartRateZones(garminDetail.zones?.heart_rate || []);
  const durationSeconds = numberOrNull(sourceSession.duration_seconds ?? garminSummary.duration_seconds);
  const zones = reportedZones.length
    ? reportedZones
    : deriveHeartRateZonesFromSamples(heartRateSamples, durationSeconds);
  const garminBlocks = normalizeGarminLaps(garminDetail.laps || [], { heartRateSamples, respirationSamples, zones, durationSeconds });
  const blocks = (payload.blocks || []).map((block, blockIndex) => normalizePilotBlock(block, blockIndex));
  const exercises = blocks.flatMap((block) => block.exerciseDetails || []);
  const stats = buildSessionStats(blocks);

  return {
    session: {
      id: sourceSession.session_id,
      sessionId: sourceSession.session_id,
      title: cleanText(sourceSession.title || "Sesion"),
      garmin_original_title: cleanText(sourceSession.garmin_type_label || ""),
      session_status: sourceSession.status || "completed",
      session_kind: sourceSession.session_kind || "completed",
      source_type: sourceSession.source_type || "",
      hasFit: Boolean(sourceSession.has_fit),
      hasCoachBlocks: Boolean(sourceSession.has_coach_blocks),
      activity_type: sourceSession.garmin_type_key || "other",
      garminActivityTypeKey: sourceSession.garmin_type_key || "other",
      garminActivityTypeLabel: sourceSession.garmin_type_label || "",
      local_date: sourceSession.date,
      started_at: sourceSession.started_at || null,
      ended_at: sourceSession.ended_at || null,
      duration_seconds: numberOrNull(sourceSession.duration_seconds ?? garminSummary.duration_seconds),
      durationSeconds: numberOrNull(sourceSession.duration_seconds ?? garminSummary.duration_seconds),
      active_seconds: numberOrNull(garminSummary.active_seconds),
      rest_seconds: numberOrNull(garminSummary.rest_seconds),
      distance_meters: numberOrNull(sourceSession.distance_meters ?? garminSummary.distance_meters),
      distanceMeters: numberOrNull(sourceSession.distance_meters ?? garminSummary.distance_meters),
      calories_total: numberOrNull(garminSummary.calories_kcal),
      avg_hr: numberOrNull(garminSummary.heart_rate_avg_bpm),
      heartRateAvgBpm: numberOrNull(garminSummary.heart_rate_avg_bpm),
      max_hr: numberOrNull(garminSummary.heart_rate_max_bpm),
      heartRateMaxBpm: numberOrNull(garminSummary.heart_rate_max_bpm),
      training_effect_aerobic: numberOrNull(garminSummary.training_effect_aerobic),
      training_effect_anaerobic: numberOrNull(garminSummary.training_effect_anaerobic),
      respiration_avg_brpm: numberOrNull(garminSummary.respiration_avg),
      respiration_max_brpm: numberOrNull(garminSummary.respiration_max),
      respiration_min_brpm: numberOrNull(garminSummary.respiration_min),
      block_count: numberOrNull(sourceSession.blocks_count) ?? blocks.length,
      blocksCount: numberOrNull(sourceSession.blocks_count) ?? blocks.length,
      exercisesCount: numberOrNull(sourceSession.exercises_count) ?? exercises.length,
      metricsCount: numberOrNull(sourceSession.metrics_count),
      total_reps: stats.totalReps || undefined,
      total_sets: stats.totalSets || undefined,
      volume_total: stats.loadLabel || undefined,
    },
    exercises,
    blocks,
    garminBlocks,
    garminSeries: [],
    sessionStructure: {},
    enrichmentPayload: {},
    executiveSummaryTable: [],
    canonicalTrainingSession: { ready: false, session: null, reason: "pilot_rpc_detail" },
    universalTrainingIntegration: { ready: false, session: null, reason: "pilot_rpc_detail" },
    hasConversationBlocks: blocks.length > 0,
    samples: heartRateSamples,
    heartRateSamples,
    respirationSamples,
    zones,
    heartRateZones: zones,
    laps: garminBlocks,
    summary: {
      duration_elapsed_seconds: numberOrNull(garminSummary.duration_seconds),
      duration_total_seconds: numberOrNull(garminSummary.duration_seconds),
      duration_work_seconds: numberOrNull(garminSummary.active_seconds),
      duration_rest_seconds: numberOrNull(garminSummary.rest_seconds),
      calories: { total_kcal: numberOrNull(garminSummary.calories_kcal) },
      heart_rate: {
        avg_bpm: numberOrNull(garminSummary.heart_rate_avg_bpm),
        max_bpm: numberOrNull(garminSummary.heart_rate_max_bpm),
      },
      respiration: {
        avg_brpm: numberOrNull(garminSummary.respiration_avg),
        max_brpm: numberOrNull(garminSummary.respiration_max),
        min_brpm: numberOrNull(garminSummary.respiration_min),
      },
      training_effect: {
        aerobic: numberOrNull(garminSummary.training_effect_aerobic),
        anaerobic: numberOrNull(garminSummary.training_effect_anaerobic),
      },
    },
    metrics: payload.metrics || [],
    garminDetail: {
      ...garminDetail,
      samples: {
        ...garminSamples,
        heart_rate: heartRateSamples,
        respiration: respirationSamples,
      },
      laps: garminBlocks,
      zones: {
        ...(garminDetail.zones || {}),
        heart_rate: zones,
      },
    },
    sourceWarnings: payload.source_warnings || [],
  };
}

function normalizeHeartRateSamples(rows = []) {
  return rows
    .map((row, index) => {
      const elapsed = numberOrNull(row.elapsed_seconds);
      const heartRate = numberOrNull(row.heart_rate_bpm);
      return {
        sample_order: numberOrNull(row.sample_order) ?? index + 1,
        sampleOrder: numberOrNull(row.sample_order) ?? index + 1,
        recorded_at: row.recorded_at || null,
        recordedAt: row.recorded_at || null,
        elapsed_seconds: elapsed,
        elapsedSeconds: elapsed,
        heart_rate_bpm: heartRate,
        heartRateBpm: heartRate,
        speed_mps: numberOrNull(row.speed_mps),
        speedMps: numberOrNull(row.speed_mps),
        cadence_rpm: numberOrNull(row.cadence_rpm),
        cadenceRpm: numberOrNull(row.cadence_rpm),
        power_w: numberOrNull(row.power_w),
        powerW: numberOrNull(row.power_w),
        altitude_m: numberOrNull(row.altitude_m),
        altitudeM: numberOrNull(row.altitude_m),
        distance_m: numberOrNull(row.distance_m),
        distanceM: numberOrNull(row.distance_m),
        temperature_c: numberOrNull(row.temperature_c),
        temperatureC: numberOrNull(row.temperature_c),
      };
    })
    .filter((row) => row.elapsed_seconds != null && row.heart_rate_bpm != null)
    .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);
}

function normalizeRespirationSamples(rows = []) {
  return rows
    .map((row, index) => {
      const elapsed = numberOrNull(row.elapsed_seconds);
      const respiration = numberOrNull(row.respiration_brpm);
      return {
        sample_order: numberOrNull(row.sample_order) ?? index + 1,
        sampleOrder: numberOrNull(row.sample_order) ?? index + 1,
        recorded_at: row.recorded_at || null,
        recordedAt: row.recorded_at || null,
        elapsed_seconds: elapsed,
        elapsedSeconds: elapsed,
        respiration_brpm: respiration,
        respirationBrpm: respiration,
      };
    })
    .filter((row) => row.elapsed_seconds != null && row.respiration_brpm != null)
    .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);
}

function normalizeGarminLaps(rows = [], context = {}) {
  const normalized = rows.map((row, index) => {
    const order = numberOrNull(row.lap_order) ?? numberOrNull(row.lap_index) ?? index + 1;
    const duration = numberOrNull(row.duration_seconds);
    const start = numberOrNull(row.start_elapsed_seconds);
    const end = numberOrNull(row.end_elapsed_seconds) ?? numberOrNull(row.elapsed_seconds) ?? (start != null && duration != null ? start + duration : null);
    const windowSamples = samplesWithinWindow(context.heartRateSamples || [], start, end);
    const windowRespiration = samplesWithinWindow(context.respirationSamples || [], start, end);
    const windowDuration = duration ?? (start != null && end != null ? Math.max(0, end - start) : numberOrNull(context.durationSeconds));
    const zones = normalizeHeartRateZones(row.zones || []);
    const resolvedZones = zones.length ? zones : deriveHeartRateZonesFromSamples(windowSamples, windowDuration);
    const hrStats = heartRateStats(windowSamples);
    const respirationStats = respirationStatsForSamples(windowRespiration);
    return {
      id: row.id || `lap-${order}`,
      order,
      lapOrder: order,
      name: cleanText(row.label || row.name || `Bloque Garmin ${order}`),
      source: row.source || "garmin_fit_lap",
      start_elapsed_seconds: start,
      startElapsedSeconds: start,
      end_elapsed_seconds: end,
      endElapsedSeconds: end,
      duration_seconds: windowDuration,
      durationSeconds: windowDuration,
      elapsed_seconds: end,
      elapsedSeconds: end,
      distance_meters: numberOrNull(row.distance_m ?? row.distance_meters),
      distanceM: numberOrNull(row.distance_m ?? row.distance_meters),
      calories: numberOrNull(row.calories_kcal ?? row.calories),
      caloriesKcal: numberOrNull(row.calories_kcal ?? row.calories),
      heart_rate_avg_bpm: numberOrNull(row.heart_rate_avg_bpm) ?? hrStats.avg,
      heartRateAvgBpm: numberOrNull(row.heart_rate_avg_bpm) ?? hrStats.avg,
      heart_rate_max_bpm: numberOrNull(row.heart_rate_max_bpm) ?? hrStats.max,
      heartRateMaxBpm: numberOrNull(row.heart_rate_max_bpm) ?? hrStats.max,
      respiration_avg_brpm: numberOrNull(row.respiration_avg_brpm) ?? respirationStats.avg,
      respirationAvgBrpm: numberOrNull(row.respiration_avg_brpm) ?? respirationStats.avg,
      respiration_max_brpm: numberOrNull(row.respiration_max_brpm) ?? respirationStats.max,
      respirationMaxBrpm: numberOrNull(row.respiration_max_brpm) ?? respirationStats.max,
      active_seconds: numberOrNull(row.active_seconds),
      activeSeconds: numberOrNull(row.active_seconds),
      rest_seconds: numberOrNull(row.rest_seconds),
      restSeconds: numberOrNull(row.rest_seconds),
      zones: resolvedZones,
    };
  });

  return normalized.length ? normalized : deriveGarminBlocksFromSamples(context);
}

function normalizeHeartRateZones(rows = []) {
  return rows.map((row, index) => ({
    key: row.zone || row.label || `Z${index + 1}`,
    label: row.label || row.zone || `Z${index + 1}`,
    shortLabel: row.zone || row.short_label || row.label || `Z${index + 1}`,
    name: row.name || "",
    color: row.color || defaultHeartRateZoneColor(row.zone || row.label || `Z${index + 1}`),
    min: numberOrNull(row.min_bpm),
    max: numberOrNull(row.max_bpm) ?? Infinity,
    range: formatHeartRateZoneRange(numberOrNull(row.min_bpm), numberOrNull(row.max_bpm)),
    seconds: numberOrNull(row.seconds),
    percent: numberOrNull(row.percent),
  }));
}

const DEFAULT_GARMIN_HEART_RATE_ZONES = [
  { key: "Z1", label: "Zona 1", shortLabel: "Z1", name: "Calentamiento", min: 91, max: 108, color: "#a8b0b6" },
  { key: "Z2", label: "Zona 2", shortLabel: "Z2", name: "Suave", min: 109, max: 126, color: "#25a9ff" },
  { key: "Z3", label: "Zona 3", shortLabel: "Z3", name: "Aerobica", min: 127, max: 144, color: "#7bdc21" },
  { key: "Z4", label: "Zona 4", shortLabel: "Z4", name: "Umbral", min: 145, max: 162, color: "#ff981f" },
  { key: "Z5", label: "Zona 5", shortLabel: "Z5", name: "Maximo", min: 163, max: Infinity, color: "#ff3b35" },
];

function deriveHeartRateZonesFromSamples(samples = [], durationSeconds = null) {
  const validSamples = samples
    .map((sample) => ({
      elapsed_seconds: numberOrNull(sample.elapsed_seconds),
      heart_rate_bpm: numberOrNull(sample.heart_rate_bpm),
    }))
    .filter((sample) => sample.elapsed_seconds != null && sample.heart_rate_bpm != null && sample.heart_rate_bpm >= 30 && sample.heart_rate_bpm <= 230)
    .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);

  if (!validSamples.length) return [];

  const secondsByZone = new Map(DEFAULT_GARMIN_HEART_RATE_ZONES.map((zone) => [zone.key, 0]));
  const fallbackSeconds = estimateSampleSeconds(validSamples);
  validSamples.forEach((sample, index) => {
    const zone = DEFAULT_GARMIN_HEART_RATE_ZONES.find((item) => sample.heart_rate_bpm >= item.min && sample.heart_rate_bpm <= item.max);
    if (!zone) return;
    secondsByZone.set(zone.key, secondsByZone.get(zone.key) + sampleSecondsAt(validSamples, index, fallbackSeconds));
  });

  const totalSeconds = Math.max(1, numberOrNull(durationSeconds) ?? [...secondsByZone.values()].reduce((sum, value) => sum + value, 0));
  return DEFAULT_GARMIN_HEART_RATE_ZONES.map((zone) => {
    const seconds = Math.round(secondsByZone.get(zone.key) || 0);
    return {
      ...zone,
      range: formatHeartRateZoneRange(zone.min, zone.max),
      seconds,
      percent: Math.round((seconds / totalSeconds) * 100),
    };
  });
}

function deriveGarminBlocksFromSamples({ heartRateSamples = [], respirationSamples = [], durationSeconds = null } = {}) {
  const duration = numberOrNull(durationSeconds) ?? Math.max(0, ...heartRateSamples.map((sample) => numberOrNull(sample.elapsed_seconds) || 0));
  if (!duration || !heartRateSamples.length) return [];
  const windowSeconds = 600;
  const blockCount = Math.max(1, Math.ceil(duration / windowSeconds));
  return Array.from({ length: blockCount }, (_, index) => {
    const order = index + 1;
    const start = index * windowSeconds;
    const end = Math.min(duration, (index + 1) * windowSeconds);
    const windowSamples = samplesWithinWindow(heartRateSamples, start, end);
    const windowRespiration = samplesWithinWindow(respirationSamples, start, end);
    const hrStats = heartRateStats(windowSamples);
    const respirationStats = respirationStatsForSamples(windowRespiration);
    const blockDuration = Math.max(0, end - start);
    return {
      id: `garmin-sample-window-${order}`,
      order,
      lapOrder: order,
      name: `Bloque Garmin ${order}`,
      source: "garmin_fit_sample_window",
      start_elapsed_seconds: start,
      startElapsedSeconds: start,
      end_elapsed_seconds: end,
      endElapsedSeconds: end,
      duration_seconds: blockDuration,
      durationSeconds: blockDuration,
      active_seconds: blockDuration,
      activeSeconds: blockDuration,
      rest_seconds: null,
      restSeconds: null,
      heart_rate_avg_bpm: hrStats.avg,
      heartRateAvgBpm: hrStats.avg,
      heart_rate_max_bpm: hrStats.max,
      heartRateMaxBpm: hrStats.max,
      respiration_avg_brpm: respirationStats.avg,
      respirationAvgBrpm: respirationStats.avg,
      respiration_max_brpm: respirationStats.max,
      respirationMaxBrpm: respirationStats.max,
      zones: deriveHeartRateZonesFromSamples(windowSamples, blockDuration),
    };
  }).filter((block) => samplesWithinWindow(heartRateSamples, block.start_elapsed_seconds, block.end_elapsed_seconds).length > 1);
}

function samplesWithinWindow(samples = [], start, end) {
  return samples.filter((sample) => {
    const elapsed = numberOrNull(sample.elapsed_seconds);
    if (elapsed == null) return false;
    if (start != null && elapsed < start) return false;
    if (end != null && elapsed > end) return false;
    return true;
  });
}

function heartRateStats(samples = []) {
  const values = samples.map((sample) => numberOrNull(sample.heart_rate_bpm)).filter((value) => value != null && value >= 30 && value <= 230);
  return {
    avg: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    max: values.length ? Math.round(Math.max(...values)) : null,
  };
}

function respirationStatsForSamples(samples = []) {
  const values = samples.map((sample) => numberOrNull(sample.respiration_brpm)).filter((value) => value != null && value > 0);
  return {
    avg: values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null,
    max: values.length ? Math.round(Math.max(...values) * 100) / 100 : null,
  };
}

function estimateSampleSeconds(samples) {
  if (samples.length < 2) return 1;
  const deltas = samples
    .slice(1, 12)
    .map((sample, index) => Number(sample.elapsed_seconds || 0) - Number(samples[index].elapsed_seconds || 0))
    .filter((value) => value > 0);
  const averageDelta = deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : 1;
  return Math.max(1, Math.round(averageDelta || 1));
}

function sampleSecondsAt(samples, index, fallbackSeconds) {
  const current = Number(samples[index]?.elapsed_seconds);
  const next = Number(samples[index + 1]?.elapsed_seconds);
  const delta = next - current;
  if (Number.isFinite(delta) && delta > 0 && delta <= 30) return delta;
  return fallbackSeconds;
}

function formatHeartRateZoneRange(min, max) {
  if (min == null) return "";
  if (max == null || max === Infinity) return `> ${min - 1} ppm`;
  return `${min} - ${max} ppm`;
}

function defaultHeartRateZoneColor(key) {
  return DEFAULT_GARMIN_HEART_RATE_ZONES.find((zone) => zone.key === `${key}`.toUpperCase())?.color || "#a8b0b6";
}

function normalizePilotBlock(block = {}, blockIndex = 0) {
  const exercises = (block.exercises || []).map((exercise, exerciseIndex) => normalizePilotExercise(exercise, exerciseIndex, block));
  return {
    id: block.id,
    blockOrder: numberOrNull(block.block_order) ?? blockIndex + 1,
    orderText: `${numberOrNull(block.block_order) ?? blockIndex + 1}`,
    blockType: block.block_type || "",
    typeLabel: labelize(block.block_type || "Bloque"),
    name: cleanText(block.name || block.title || `Bloque ${blockIndex + 1}`),
    duration_seconds: numberOrNull(block.duration_seconds),
    durationSeconds: numberOrNull(block.duration_seconds),
    active_seconds: numberOrNull(block.active_seconds),
    rest_seconds: numberOrNull(block.rest_seconds),
    rounds_completed: numberOrNull(block.rounds_completed),
    roundsCompleted: numberOrNull(block.rounds_completed),
    executionNotes: cleanText(block.execution_notes || ""),
    executionText: cleanText(block.execution_notes || ""),
    temporal: {
      fcMedia: numberOrNull(block.heart_rate_avg_bpm) ?? "N/D",
      fcMax: numberOrNull(block.heart_rate_max_bpm) ?? "N/D",
    },
    temporalWindow: {
      start: numberOrNull(block.start_elapsed_seconds),
      end: numberOrNull(block.end_elapsed_seconds),
    },
    temporalReconciled: false,
    summaryText: cleanText(block.summary || block.execution_notes || exercises.map((exercise) => exercise.name).join(", ")),
    sensationText: cleanText(block.objective || ""),
    exerciseDetails: exercises,
    sourceText: block.data_confidence || "reported",
    warningText: "",
    dataConfidence: block.data_confidence || "",
  };
}

function normalizePilotExercise(exercise = {}, exerciseIndex = 0, block = {}) {
  const name = cleanText(exercise.reported_name || exercise.name || `Ejercicio ${exerciseIndex + 1}`);
  const detailText = formatSessionExerciseDetail({
    ...exercise,
    name,
    rounds_completed: exercise.rounds_completed ?? block.rounds_completed,
  });
  const loadValue = numberOrNull(exercise.load_value);
  const loadUnit = `${exercise.load_unit || ""}`.trim();
  const reps = repsTotal(exercise.reps_per_set);
  const sets = numberOrNull(exercise.sets_completed) || numberOrNull(exercise.rounds_completed) || numberOrNull(block.rounds_completed) || 0;
  return {
    id: exercise.id,
    exerciseOrder: numberOrNull(exercise.exercise_order) ?? exerciseIndex + 1,
    name,
    reportedName: name,
    detailText,
    executionType: exercise.execution_type || "",
    setsCompleted: numberOrNull(exercise.sets_completed),
    roundsCompleted: numberOrNull(exercise.rounds_completed),
    repsPerSet: exercise.reps_per_set,
    durationSeconds: numberOrNull(exercise.duration_seconds),
    loadValue,
    loadUnit,
    equipmentSnapshot: exercise.equipment_snapshot || {},
    tempoOrPause: exercise.tempo_or_pause || "",
    side: exercise.side || "",
    notes: cleanText(exercise.notes || ""),
    dataConfidence: exercise.data_confidence || "",
    stats: {
      sets,
      reps,
      repSets: reps,
      isometricSeconds: numberOrNull(exercise.duration_seconds) || 0,
      externalLoadKg: loadUnit === "kg" && loadValue ? loadValue * Math.max(1, sets || 1) : 0,
    },
  };
}

export function formatSessionExerciseDetail(exercise = {}) {
  return [
    formatRounds(exercise.rounds_completed),
    formatSets(exercise.sets_completed, exercise.rounds_completed),
    formatReps(exercise.reps_per_set, exercise.side, exercise.rounds_completed),
    formatDuration(exercise.duration_seconds),
    formatLoad(exercise.load_value, exercise.load_unit),
    formatEquipment(exercise.equipment_snapshot, exercise.name || exercise.reported_name),
  ].filter(Boolean).join(" · ");
}

export function formatLoad(loadValue, loadUnit) {
  const value = numberOrNull(loadValue);
  const unit = `${loadUnit || ""}`.trim();
  if (value == null || !unit) return "";
  return `${formatNumber(value)} ${unit}`;
}

function formatDuration(seconds) {
  const value = numberOrNull(seconds);
  if (value == null || value <= 0) return "";
  if (value < 60) return `${Math.round(value)} s`;
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${`${secs}`.padStart(2, "0")}`;
}

function formatRounds(rounds) {
  const value = numberOrNull(rounds);
  if (value == null || value <= 0) return "";
  return `${formatNumber(value)} ${value === 1 ? "ronda" : "rondas"}`;
}

function formatSets(sets, rounds) {
  const setsValue = numberOrNull(sets);
  const roundsValue = numberOrNull(rounds);
  if (setsValue == null || setsValue <= 0 || setsValue === roundsValue) return "";
  return `${formatNumber(setsValue)} ${setsValue === 1 ? "serie" : "series"}`;
}

function formatReps(value, side, rounds) {
  const normalized = normalizeRepsPerSet(value);
  if (!normalized.length) return "";
  const first = normalized[0];
  const same = normalized.every((item) => item.total === first.total && item.eachSide === first.eachSide);
  const roundsValue = numberOrNull(rounds);
  const prefix = roundsValue && normalized.length === roundsValue && same ? "" : normalized.length > 1 ? `${normalized.length}x` : "";
  if (first.eachSide != null && same) return `${prefix}${formatNumber(first.eachSide)}/lado`;
  if (first.total != null && same) return `${prefix}${formatNumber(first.total)} reps`;
  const total = normalized.reduce((sum, item) => sum + (item.total || (item.eachSide ? item.eachSide * 2 : 0)), 0);
  return total ? `${formatNumber(total)} reps` : "";
}

function normalizeRepsPerSet(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeRepsPerSet(item));
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(`${value}`)) return [{ total: numberOrNull(value) }];
  if (typeof value === "object") {
    if (value.each_side != null) return [{ eachSide: numberOrNull(value.each_side) }];
    if (value.eachSide != null) return [{ eachSide: numberOrNull(value.eachSide) }];
    if (value.total != null) return [{ total: numberOrNull(value.total) }];
    if (value.reps != null) return [{ total: numberOrNull(value.reps) }];
  }
  return [];
}

function formatEquipment(snapshot = {}, exerciseName = "") {
  const equipment = Array.isArray(snapshot?.equipment) ? snapshot.equipment : [];
  const compact = equipment
    .map((item) => labelize(item))
    .filter((item) => item && !exerciseName.toLowerCase().includes(item.toLowerCase()));
  return compact.slice(0, 2).join(" · ");
}

function buildSessionStats(blocks = []) {
  const details = blocks.flatMap((block) => block.exerciseDetails || []);
  const totalSets = details.reduce((sum, item) => sum + (numberOrNull(item.stats?.sets) || 0), 0);
  const totalReps = details.reduce((sum, item) => sum + (numberOrNull(item.stats?.reps) || 0), 0);
  const totalLoad = details.reduce((sum, item) => sum + (numberOrNull(item.stats?.externalLoadKg) || 0), 0);
  return {
    totalSets: Math.round(totalSets),
    totalReps: Math.round(totalReps),
    loadLabel: totalLoad ? `${formatNumber(totalLoad)} kg` : "",
  };
}

function repsTotal(value) {
  return normalizeRepsPerSet(value).reduce((sum, item) => sum + (item.total || (item.eachSide ? item.eachSide * 2 : 0)), 0);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  const number = numberOrNull(value);
  if (number == null) return "";
  return Number.isInteger(number) ? `${number}` : `${Number(number.toFixed(1))}`;
}

function cleanText(value) {
  return repairMojibakeText(value).replace(/\s+/g, " ").trim();
}

function labelize(value) {
  return cleanText(`${value || ""}`.replace(/_/g, " ")).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function repairMojibakeText(value) {
  if (value == null) return "";
  const replacements = [
    ["\u00c2\u00b7", "·"],
    ["\u00c3\u00a1", "á"],
    ["\u00c3\u00a9", "é"],
    ["\u00c3\u00ad", "í"],
    ["\u00c3\u00b3", "ó"],
    ["\u00c3\u00ba", "ú"],
    ["\u00c3\u00b1", "ñ"],
    ["\u00e2\u20ac\u201d", "—"],
    ["\u00c2", ""],
  ];
  return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), `${value}`);
}

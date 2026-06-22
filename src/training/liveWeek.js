const STATUS_META = {
  planned: { label: "Planificada", tone: "blue" },
  confirmed: { label: "Confirmada", tone: "blue" },
  modified: { label: "Modificada", tone: "amber" },
  completed: { label: "Ejecutada", tone: "green" },
  enriched: { label: "Ejecutada + Coach", tone: "green" },
  skipped: { label: "No realizada", tone: "gray" },
  rescheduled: { label: "Reprogramada", tone: "purple" },
};

const TYPE_LABELS = {
  hiit: "HIIT",
  hybrid: "Hibrido",
  functional: "Funcional",
  strength: "Fuerza",
  pilates: "Pilates",
  yoga: "Yoga",
  running: "Carrera",
  run: "Carrera",
  trail_running: "Trail running",
  trail: "Trail running",
  lap_swimming: "Natacion en piscina",
  pool_swimming: "Natacion en piscina",
  swimming: "Natacion",
  multisport: "Multideporte",
  cycling: "Ciclismo",
  recovery: "Recuperacion",
  other: "Otro",
};

const COMPATIBLE_TYPES = {
  hybrid: ["hiit", "functional", "hybrid"],
  functional: ["hiit", "functional", "hybrid"],
  hiit: ["hiit", "functional", "hybrid"],
  yoga: ["yoga", "pilates"],
  pilates: ["pilates", "yoga"],
  strength: ["strength"],
  running: ["running", "run"],
  run: ["running", "run"],
  trail: ["trail_running", "trail", "running", "run"],
  trail_running: ["trail_running", "trail", "running", "run"],
  swimming: ["lap_swimming", "pool_swimming", "swimming"],
  lap_swimming: ["lap_swimming", "pool_swimming", "swimming"],
};

export function buildCalendarSessionViewModels(input = [], legacyCompletedRows = []) {
  const params = Array.isArray(input)
    ? { plannedSessions: input, completedSessions: legacyCompletedRows }
    : input;
  const weekStart = params.weekStart ? toLocalDateKey(params.weekStart) : "";
  const weekEnd = params.weekEnd ? toLocalDateKey(params.weekEnd) : "";
  const plannedSessions = normalizePlannedSessions(params.plannedSessions || []);
  const completedSessions = normalizeCompletedSessions(params.completedSessions || []);
  const matches = matchPlannedToCompleted(plannedSessions, completedSessions);
  const usedCompletedIds = new Set();
  const items = [];

  plannedSessions.forEach((planned) => {
    const completed = matches.get(planned.id) || null;
    if (completed?.id) usedCompletedIds.add(completed.id);
    items.push(buildCalendarSessionCardViewModel({ planned, completed }));
  });

  completedSessions.forEach((completed) => {
    if (!usedCompletedIds.has(completed.id)) {
      items.push(buildCalendarSessionCardViewModel({ planned: null, completed }));
    }
  });

  return items
    .filter((item) => !weekStart || !weekEnd || isDateInInclusiveRange(item.date, weekStart, weekEnd))
    .sort(sortCalendarSessions);
}

export function normalizePlannedSessions(rows = []) {
  return rows.map((row) => {
    const typeKey = normalizeTypeKey(row.session_type);
    return {
      ...row,
      id: row.id,
      date: toLocalDateKey(row.planned_date),
      planned_date: toLocalDateKey(row.planned_date),
      planned_time: normalizeTime(row.planned_time),
      session_type: typeKey,
      typeKey,
      typeLabel: TYPE_LABELS[typeKey] || labelize(typeKey),
      status: normalizedStatus(row.status),
      constraints: toArray(row.constraints),
      planned_session_blocks: (row.planned_session_blocks || row.blocks || [])
        .map((block, index) => ({
          ...block,
          block_order: Number(block.block_order || index + 1),
          constraints: toArray(block.constraints),
          planned_exercises: toArray(block.planned_exercises),
        }))
        .sort((a, b) => Number(a.block_order || 0) - Number(b.block_order || 0)),
    };
  });
}

export function normalizeCompletedSessions(rows = []) {
  return rows.map((row) => {
    const typeKey = normalizeTypeKey(row.garminActivityTypeKey || row.garmin_type_key || row.activityType || row.session_kind || row.type);
    const durationSeconds = Number(row.duration_seconds || row.durationSeconds || 0);
    const blocksCount = Number(row.coach_blocks_count || row.blocks_count || row.block_count || row.coachBlockCount || 0);
    const exercisesCount = Number(row.coach_exercises_count || row.exercises_count || row.exercise_count || row.coachExerciseCount || 0);
    const metricsCount = Number(row.metrics_count || row.metricsCount || 0);
    const hasFit = Boolean(
      row.has_fit ||
      row.source_type === "garmin_fit" ||
      row.source_id ||
      row.external_reference ||
      row.fit_identity ||
      row.session_structure?.garmin_fit_summary ||
      row.garminActivityTypeKey ||
      row.garmin_type_key
    );
    const hasCoachBlocks = Boolean(row.has_coach_blocks || row.has_conversation || blocksCount > 0 || exercisesCount > 0);
    return {
      ...row,
      date: toLocalDateKey(row.local_date || row.date || row.started_at || row.created_at),
      local_date: toLocalDateKey(row.local_date || row.date || row.started_at || row.created_at),
      time: timeFromStartedAt(row.started_at),
      title: cleanTitle(row.title || row.garminActivityTypeLabel || row.garmin_type_label || TYPE_LABELS[typeKey] || "Sesion"),
      typeKey,
      typeLabel: row.garminActivityTypeLabel || row.garmin_type_label || TYPE_LABELS[typeKey] || labelize(typeKey),
      sourceKind: hasFit && hasCoachBlocks ? "mixed" : hasFit ? "garmin_fit" : hasCoachBlocks ? "coach" : "completed",
      durationSeconds,
      duration_seconds: durationSeconds,
      hasFit,
      hasCoachBlocks,
      blocksCount,
      exercisesCount,
      metricsCount,
      garminActivityTypeKey: typeKey,
      garminActivityTypeLabel: row.garminActivityTypeLabel || row.garmin_type_label || TYPE_LABELS[typeKey] || labelize(typeKey),
    };
  });
}

export function matchPlannedToCompleted(plannedSessions = [], completedSessions = []) {
  const result = new Map();
  const usedCompletedIds = new Set();

  plannedSessions.forEach((planned) => {
    if (!planned.linked_completed_session_id) return;
    const direct = completedSessions.find((completed) => completed.id === planned.linked_completed_session_id);
    if (!direct) return;
    result.set(planned.id, { ...direct, matchConfidence: "linked" });
    usedCompletedIds.add(direct.id);
  });

  plannedSessions.forEach((planned) => {
    if (result.has(planned.id)) return;
    const sameDay = completedSessions.filter((completed) => (
      !usedCompletedIds.has(completed.id) &&
      completed.date === planned.date
    ));
    const typed = sameDay.filter((completed) => compatibleSessionTypes(planned.typeKey, completed.typeKey));
    const timed = typed.filter((completed) => planned.planned_time && isNearPlannedTime(planned.planned_time, completed.started_at));
    const candidates = timed.length ? timed : typed.length ? typed : sameDay.length === 1 ? sameDay : [];
    if (candidates.length !== 1) return;
    result.set(planned.id, { ...candidates[0], matchConfidence: timed.length ? "time_type" : typed.length ? "same_day_type" : "same_day_unique" });
    usedCompletedIds.add(candidates[0].id);
  });

  return result;
}

export function buildCalendarSessionCardViewModel({ planned = null, completed = null } = {}) {
  const statusKey = completed?.hasCoachBlocks ? "enriched" : completed ? "completed" : normalizedStatus(planned?.status);
  const statusMeta = planned?.priority && !completed ? priorityStatusMeta(planned.priority, statusKey) : STATUS_META[statusKey] || STATUS_META.planned;
  const date = planned?.date || completed?.date || "";
  const time = planned?.planned_time || completed?.time || "";
  const typeKey = completed?.typeKey || planned?.typeKey || "other";
  const completedSummary = completed ? buildCompletedSummary(completed) : null;
  const plannedSummary = planned ? buildPlannedSummary(planned) : null;
  const comparison = planned && completed ? buildPlanActualComparison(planned, completed) : null;
  const hasFit = Boolean(completed?.hasFit);
  const hasCoachBlocks = Boolean(completed?.hasCoachBlocks);
  const chips = [
    hasFit ? "Garmin/FIT" : null,
    hasCoachBlocks ? "Coach" : null,
    TYPE_LABELS[typeKey] || labelize(typeKey),
    completedSummary?.duration,
    completed?.blocksCount ? `${completed.blocksCount} bloques` : null,
    completed?.exercisesCount ? `${completed.exercisesCount} ejercicios` : null,
    !completed && planned?.planned_intensity ? planned.planned_intensity : null,
    !completed && plannedSummary?.duration ? plannedSummary.duration : null,
  ].filter(Boolean);

  return {
    id: planned && completed ? `linked-${planned.id}-${completed.id}` : planned ? `planned-${planned.id}` : `completed-${completed.id}`,
    kind: planned && completed ? "linked" : planned ? "planned" : "completed",
    date,
    local_date: date,
    time,
    title: completed?.title || planned?.title || "Sesion",
    typeKey,
    typeLabel: TYPE_LABELS[typeKey] || labelize(typeKey),
    status: statusKey,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    sourceKind: completed?.sourceKind || "planned",
    durationSeconds: completed?.durationSeconds || 0,
    duration_seconds: completed?.durationSeconds || 0,
    hasFit,
    hasCoachBlocks,
    blocksCount: completed?.blocksCount || 0,
    exercisesCount: completed?.exercisesCount || 0,
    metricsCount: completed?.metricsCount || 0,
    completedSessionId: completed?.id || null,
    plannedSessionId: planned?.id || null,
    summary: completedSummary?.primary || plannedSummary?.primary || "",
    chips,
    planned: plannedSummary,
    completed: completedSummary,
    completedSession: completed || null,
    coach: hasCoachBlocks ? { label: completedSummary?.coach || "Coach" } : null,
    comparison,
    matchConfidence: completed?.matchConfidence || null,
    activityType: completed?.activityType || plannedTypeToActivityType(typeKey),
    garminActivityTypeKey: completed?.garminActivityTypeKey || typeKey,
    has_conversation: hasCoachBlocks,
  };
}

export function calendarSessionMatchesFilters(item, sourceFilter, typeFilter) {
  const sourceMatch = sourceFilter === "all" ||
    (sourceFilter === "garmin" && item.hasFit) ||
    (sourceFilter === "coach" && item.hasCoachBlocks) ||
    (sourceFilter === "mixed" && item.hasFit && item.hasCoachBlocks);
  if (!sourceMatch) return false;
  if (typeFilter === "all") return true;
  return normalizeTypeKey(typeFilter) === normalizeTypeKey(item.typeKey || item.garminActivityTypeKey || item.activityType);
}

export function toLocalDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (dateMatch) return dateMatch[0];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateInInclusiveRange(value, start, end) {
  const key = toLocalDateKey(value);
  const startKey = toLocalDateKey(start);
  const endKey = toLocalDateKey(end);
  return Boolean(key && startKey && endKey && key >= startKey && key <= endKey);
}

export function sessionDateKey(session = {}) {
  return toLocalDateKey(session.date || session.local_date || session.planned_date || session.started_at || session.created_at);
}

function buildPlannedSummary(planned) {
  const blocks = planned.planned_session_blocks || [];
  return {
    id: planned.id,
    objective: planned.objective || "",
    notes: planned.coach_notes || "",
    adaptationReason: planned.adaptation_reason || "",
    constraints: toArray(planned.constraints),
    intensity: planned.planned_intensity || "",
    duration: formatPlannedDuration(planned),
    blocks,
    primary: [planned.objective, planned.coach_notes].filter(Boolean)[0] || "",
  };
}

function buildCompletedSummary(completed) {
  const duration = completed.durationSeconds ? formatDurationClock(completed.durationSeconds) : "";
  const garmin = [completed.hasFit ? "Garmin/FIT" : null, completed.typeLabel, duration].filter(Boolean).join(" · ");
  const coach = [
    completed.blocksCount ? `${completed.blocksCount} bloques` : "",
    completed.exercisesCount ? `${completed.exercisesCount} ejercicios` : "",
  ].filter(Boolean).join(" · ");
  return {
    id: completed.id,
    garmin,
    coach,
    primary: [garmin, coach].filter(Boolean).join(" · "),
    duration,
    avgHr: completed.avg_hr || null,
    maxHr: completed.max_hr || null,
    calories: completed.calories_total || null,
    highlights: [],
  };
}

function buildPlanActualComparison(planned, completed) {
  const durationMinutes = completed.durationSeconds ? Math.round(completed.durationSeconds / 60) : null;
  const items = [];

  if (planned.planned_duration_min || planned.planned_duration_max || durationMinutes) {
    const min = Number(planned.planned_duration_min || 0);
    const max = Number(planned.planned_duration_max || 0);
    let status = "unknown";
    let result = "Sin dato suficiente";
    if (durationMinutes && (min || max)) {
      const upper = max || min;
      const lower = min || max;
      status = durationMinutes >= lower && durationMinutes <= upper ? "ok" : durationMinutes <= upper + 15 ? "warning" : "danger";
      result = status === "ok" ? "Dentro de rango" : status === "warning" ? "Algo superior" : "Fuera de rango";
    }
    items.push({
      key: "duration",
      label: "Duracion",
      plan: formatPlannedDuration(planned),
      actual: completed.durationSeconds ? formatDurationClock(completed.durationSeconds) : "",
      status,
      result,
    });
  }

  if (planned.planned_intensity || completed.typeLabel) {
    items.push({
      key: "intensity",
      label: "Intensidad",
      plan: planned.planned_intensity || "No definida",
      actual: completed.typeLabel || "Sin dato suficiente",
      status: "unknown",
      result: "Sin dato suficiente",
    });
  }

  const constraints = toArray(planned.constraints).join(" · ");
  if (constraints) {
    items.push({
      key: "constraints",
      label: "Restricciones",
      plan: constraints,
      actual: "Revision con bloques Coach",
      status: completed.hasCoachBlocks ? "unknown" : "unknown",
      result: "Sin dato suficiente",
    });
  }

  if (completed.hasCoachBlocks) {
    items.push({
      key: "coach",
      label: "Coach",
      plan: "Bloques previstos",
      actual: buildCompletedSummary(completed).coach || "Coach disponible",
      status: "ok",
      result: "Enriquecido",
    });
  }

  return {
    summary: comparisonSummary(items),
    items,
  };
}

function normalizedStatus(status) {
  return STATUS_META[status] ? status : "planned";
}

function priorityStatusMeta(priority, fallbackStatus) {
  const text = `${priority || ""}`.toLowerCase();
  if (text.includes("prob")) return { label: "Probable", tone: "gray" };
  if (text.includes("adapt")) return { label: "Adaptable", tone: "amber" };
  if (text.includes("recomend")) return { label: "Recomendado", tone: "gray" };
  return STATUS_META[fallbackStatus] || STATUS_META.planned;
}

function compatibleSessionTypes(plannedType, completedType) {
  const planned = normalizeTypeKey(plannedType);
  const completed = normalizeTypeKey(completedType);
  if (!planned || !completed) return false;
  if (planned === completed) return true;
  return (COMPATIBLE_TYPES[planned] || []).includes(completed);
}

function normalizeTypeKey(value) {
  const text = `${value || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!text) return "other";
  if (text.includes("hiit") || text.includes("interval")) return "hiit";
  if (text.includes("trail")) return "trail_running";
  if (text.includes("pool_swimming") || text.includes("lap_swimming") || text.includes("swimming") || text.includes("natacion")) return "lap_swimming";
  if (text.includes("strength") || text.includes("fuerza") || text.includes("weight")) return "strength";
  if (text.includes("pilates")) return "pilates";
  if (text.includes("yoga")) return "yoga";
  if (text.includes("running") || text === "run" || text.includes("carrera")) return "running";
  if (text.includes("cycling") || text.includes("ciclismo") || text.includes("bike")) return "cycling";
  if (text.includes("multisport")) return "multisport";
  if (text.includes("functional")) return "functional";
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("recovery") || text.includes("recuperacion")) return "recovery";
  return text;
}

function isNearPlannedTime(plannedTime, startedAt) {
  if (!plannedTime || !startedAt) return false;
  const [plannedHour, plannedMinute] = plannedTime.split(":").map(Number);
  const started = new Date(startedAt);
  const plannedMinutes = plannedHour * 60 + plannedMinute;
  const actualMinutes = started.getHours() * 60 + started.getMinutes();
  return Math.abs(plannedMinutes - actualMinutes) <= 120;
}

function sortCalendarSessions(a, b) {
  return `${a.date || ""}T${a.time || "23:59"}`.localeCompare(`${b.date || ""}T${b.time || "23:59"}`);
}

function normalizeTime(value) {
  if (!value) return "";
  return `${value}`.slice(0, 5);
}

function timeFromStartedAt(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatPlannedDuration(planned) {
  const min = planned?.planned_duration_min;
  const max = planned?.planned_duration_max;
  if (min && max) return `${min}-${max} min`;
  if (min) return `${min} min`;
  if (max) return `${max} min`;
  return "";
}

function formatDurationClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function comparisonSummary(items) {
  const warning = items.filter((item) => item.status === "warning").length;
  const danger = items.filter((item) => item.status === "danger").length;
  if (danger) return "Hay desviaciones claras que conviene revisar.";
  if (warning) return "Sesion cumplida con algun punto de atencion.";
  return "Plan ejecutado dentro de lo previsto.";
}

function plannedTypeToActivityType(type) {
  if (["hybrid", "functional", "hiit"].includes(type)) return "hiit";
  if (type === "yoga") return "pilates";
  if (type === "running") return "run";
  if (type === "trail_running") return "trail";
  return type || "hybrid";
}

function cleanTitle(value) {
  return `${value || ""}`.replace(/^Actividad Garmin\s*-\s*/i, "").trim() || "Sesion";
}

function labelize(value) {
  return `${value || "Sesion"}`.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== "");
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }
  return [value];
}

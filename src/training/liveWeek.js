export const LIVE_WEEK_PILOT_SESSION_ID = "26a5b01a-7bb3-4500-bac6-948185922ae2";

const STATUS_META = {
  planned: { label: "PLANIFICADA", tone: "blue" },
  confirmed: { label: "CONFIRMADA", tone: "blue" },
  modified: { label: "MODIFICADA", tone: "amber" },
  completed: { label: "EJECUTADA", tone: "green" },
  enriched: { label: "EJECUTADA + COACH", tone: "green" },
  skipped: { label: "NO REALIZADA", tone: "gray" },
  rescheduled: { label: "REPROGRAMADA", tone: "purple" },
};

const TYPE_LABELS = {
  hybrid: "Hibrido",
  functional: "Funcional",
  hiit: "HIIT",
  yoga: "Yoga",
  pilates: "Pilates",
  recovery: "Recuperacion",
  strength: "Fuerza",
  running: "Carrera",
  trail: "Trail",
  trail_running: "Trail",
  swimming: "Natacion",
  lap_swimming: "Natacion",
};

const TYPE_COMPATIBILITY = {
  hybrid: ["hiit", "workout", "cardio", "hybrid", "functional"],
  functional: ["hiit", "workout", "cardio", "functional", "hybrid"],
  hiit: ["hiit", "workout", "cardio", "hybrid", "functional"],
  yoga: ["yoga", "pilates", "mobility"],
  pilates: ["pilates", "yoga", "mobility"],
  running: ["running", "run"],
  trail: ["trail_running", "trail", "running"],
  trail_running: ["trail_running", "trail", "running"],
  swimming: ["lap_swimming", "pool_swimming", "swimming"],
  strength: ["strength", "strength_training", "fitness_equipment"],
  recovery: ["walking", "mobility", "other"],
};

const WEEK_PLAN = [
  {
    planned_date: "2026-06-22",
    planned_time: "07:00:00",
    title: "Hibrido fuera de casa",
    session_type: "hybrid",
    status: "enriched",
    planned_intensity: "RPE 7",
    planned_duration_min: 45,
    planned_duration_max: 60,
    objective: "Volver a intensidad controlada sin maximos, con fuerza funcional, cardio y core.",
    coach_notes: "Sesion vinculada a Garmin HIIT y enriquecida con Coach.",
    constraints: ["evitar bisagra pesada", "evitar maximos", "controlar saltos", "proteger lumbar"],
    linked_completed_session_id: LIVE_WEEK_PILOT_SESSION_ID,
    blocks: [
      ["Movilidad + activacion", "Preparar cadera, hombro y core"],
      ["Fuerza tecnica", "Fuerza funcional sin maximos"],
      ["Circuito hibrido", "Trabajo mixto controlado"],
      ["Core anti-lumbar", "Estabilidad bajo fatiga"],
      ["Vuelta a la calma", "Bajar pulsaciones y descargar lumbar"],
    ],
  },
  {
    planned_date: "2026-06-23",
    title: "Recuperacion activa",
    session_type: "recovery",
    status: "planned",
    priority: "recomendado",
    planned_intensity: "Muy suave",
    planned_duration_min: 30,
    planned_duration_max: 40,
    objective: "Descargar tras HIIT del lunes.",
    constraints: ["no fuerza pesada", "no impacto"],
    adaptation_reason: "Descargar tras HIIT del lunes",
    blocks: [
      ["Movilidad cadera/lumbar", "Restaurar rango sin fatiga"],
      ["Paseo o Z2 muy suave", "30-40 min nasal y facil"],
    ],
  },
  {
    planned_date: "2026-06-24",
    planned_time: "07:00:00",
    title: "Hibrido fuera de casa",
    session_type: "hybrid",
    status: "planned",
    planned_intensity: "RPE 7-8",
    planned_duration_min: 45,
    planned_duration_max: 60,
    objective: "Sesion hibrida RPE 7-8 sin repetir estres lumbar del lunes.",
    coach_notes: "Revisar sueno, lumbar y carga al levantarse.",
    constraints: ["evitar peso muerto pesado", "evitar maximos", "controlar saltos", "lumbar neutro"],
    blocks: [
      ["Movilidad + activacion", "Preparar patrones"],
      ["Empuje/traccion", "Fuerza limpia"],
      ["Pierna unilateral controlada", "Carga sin bisagra pesada"],
      ["Cardio remo/assault", "Motor con bajo impacto"],
      ["Core antirotacion", "Control lumbo-pelvico"],
    ],
  },
  {
    planned_date: "2026-06-25",
    planned_time: "18:00:00",
    title: "Yoga",
    session_type: "yoga",
    status: "confirmed",
    objective: "Movilidad, descarga lumbar, cadera y respiracion.",
    constraints: ["mantener intensidad baja"],
    blocks: [["Movilidad + respiracion", "Descarga y recuperacion"]],
  },
  {
    planned_date: "2026-06-26",
    title: "Fuerza tecnica en casa",
    session_type: "strength",
    status: "modified",
    priority: "adaptable",
    planned_intensity: "RPE 6-7",
    planned_duration_min: 40,
    planned_duration_max: 55,
    objective: "Meter fuerza sin romper recuperacion.",
    coach_notes: "Solo si lumbar 0-1/10 y sueno aceptable.",
    constraints: ["no peso muerto pesado", "no maximos"],
    adaptation_reason: "Adaptable segun lumbar y sueno",
    blocks: [
      ["Calentamiento lumbar seguro", "Activacion sin carga axial alta"],
      ["Front squat tecnico", "4-5x5 RPE 6-7"],
      ["Landmine press", "4x8/lado"],
      ["Ring row/dominadas", "4x6-8"],
      ["Split squat o step-up", "3x8/lado"],
      ["Pallof + side plank", "Core antirotacion"],
    ],
  },
  {
    planned_date: "2026-06-27",
    title: "Funcional",
    session_type: "functional",
    status: "planned",
    priority: "probable",
    planned_intensity: "RPE 6-8",
    objective: "Sesion funcional si hay disponibilidad.",
    coach_notes: "Si miercoles fue duro: RPE 6-7. Si lumbar >2/10: movilidad/core/cardio sin impacto.",
    constraints: ["adaptar impacto", "proteger lumbar"],
    blocks: [["Funcional adaptable", "Densidad segun carga del miercoles y sueno"]],
  },
  {
    planned_date: "2026-06-28",
    title: "Descanso",
    session_type: "recovery",
    status: "planned",
    priority: "recomendado",
    objective: "Absorber carga de la semana.",
    constraints: ["no intensidad"],
    blocks: [["Descanso", "Caminar suave si apetece"]],
  },
];

export function buildLocalPlannedWeek(completedSessions = []) {
  const pilotSession = completedSessions.find((session) => session.id === LIVE_WEEK_PILOT_SESSION_ID);
  if (!pilotSession) return [];
  return WEEK_PLAN.map((plan, index) => ({
    id: `local-week-plan-${plan.planned_date}-${index}`,
    user_id: pilotSession.user_id,
    source: "local_week_plan",
    ...plan,
    planned_session_blocks: plan.blocks.map(([title, objective], blockIndex) => ({
      id: `local-week-plan-${plan.planned_date}-${blockIndex}`,
      block_order: blockIndex + 1,
      title,
      objective,
      planned_exercises: [],
      constraints: [],
    })),
  }));
}

export function normalizePlannedSessions(rows = []) {
  return rows.map((row) => ({
    ...row,
    planned_time: normalizeTime(row.planned_time),
    constraints: toArray(row.constraints),
    planned_session_blocks: (row.planned_session_blocks || row.blocks || [])
      .map((block, index) => ({
        ...block,
        block_order: Number(block.block_order || index + 1),
        constraints: toArray(block.constraints),
        planned_exercises: toArray(block.planned_exercises),
      }))
      .sort((a, b) => Number(a.block_order || 0) - Number(b.block_order || 0)),
  }));
}

export function buildCalendarSessionViewModels(plannedRows = [], completedRows = []) {
  const plannedSessions = normalizePlannedSessions(plannedRows);
  const usedCompleted = new Set();
  const matches = matchPlannedToCompleted(plannedSessions, completedRows);
  const items = [];

  plannedSessions.forEach((planned) => {
    const completed = matches.get(planned.id) || null;
    if (completed?.id) usedCompleted.add(completed.id);
    items.push(buildCalendarSessionCardViewModel(planned, completed));
  });

  completedRows.forEach((completed) => {
    if (!usedCompleted.has(completed.id)) {
      items.push(buildCalendarSessionCardViewModel(null, completed));
    }
  });

  return items.sort(sortCalendarSessions);
}

export function matchPlannedToCompleted(plannedSessions = [], completedSessions = []) {
  const result = new Map();
  const used = new Set();

  plannedSessions.forEach((planned) => {
    if (!planned.linked_completed_session_id) return;
    const direct = completedSessions.find((completed) => completed.id === planned.linked_completed_session_id);
    if (direct) {
      result.set(planned.id, { ...direct, matchConfidence: "linked" });
      used.add(direct.id);
    }
  });

  plannedSessions.forEach((planned) => {
    if (result.has(planned.id)) return;
    const candidates = completedSessions
      .filter((completed) => !used.has(completed.id))
      .filter((completed) => sessionDateKey(completed) === planned.planned_date)
      .filter((completed) => compatibleSessionTypes(planned.session_type, completed.garminActivityTypeKey || completed.activityType));

    const nearTime = candidates.filter((completed) => planned.planned_time && isNearPlannedTime(planned.planned_time, completed.started_at));
    const finalCandidates = nearTime.length ? nearTime : candidates;
    if (finalCandidates.length === 1) {
      result.set(planned.id, { ...finalCandidates[0], matchConfidence: nearTime.length ? "time_type" : "same_day_unique" });
      used.add(finalCandidates[0].id);
    }
  });

  return result;
}

export function buildCalendarSessionCardViewModel(planned, completed) {
  const statusKey = completed?.has_conversation ? "enriched" : completed ? "completed" : normalizedStatus(planned?.status);
  const statusMeta = planned?.priority && !completed ? priorityStatusMeta(planned.priority, statusKey) : STATUS_META[statusKey] || STATUS_META.planned;
  const date = planned?.planned_date || sessionDateKey(completed);
  const time = planned?.planned_time || timeFromStartedAt(completed?.started_at);
  const title = planned?.title || completed?.title || "Sesion";
  const typeKey = planned?.session_type || completed?.garminActivityTypeKey || completed?.activityType || "hybrid";
  const completedSummary = completed ? buildCompletedSummary(completed) : null;
  const plannedSummary = planned ? buildPlannedSummary(planned) : null;
  const comparison = planned && completed ? buildPlanActualComparison(planned, completed) : null;
  const chips = [
    planned?.planned_intensity,
    plannedSummary?.duration,
    completedSummary?.garmin,
    completedSummary?.coach,
  ].filter(Boolean).slice(0, 4);

  return {
    id: planned && completed ? `linked-${planned.id}-${completed.id}` : planned ? `planned-${planned.id}` : `completed-${completed.id}`,
    kind: planned && completed ? "linked" : planned ? "planned" : "completed",
    date,
    local_date: date,
    time,
    title,
    typeKey,
    typeLabel: TYPE_LABELS[typeKey] || TYPE_LABELS[completed?.activityType] || labelize(typeKey),
    status: statusKey,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    summary: completedSummary?.primary || plannedSummary?.primary || "",
    chips,
    planned: plannedSummary,
    completed: completedSummary,
    completedSession: completed || null,
    coach: completedSummary?.coach ? { label: completedSummary.coach } : null,
    comparison,
    matchConfidence: completed?.matchConfidence || null,
    duration_seconds: Number(completed?.duration_seconds || completed?.durationSeconds || 0),
    activityType: completed?.activityType || plannedTypeToActivityType(typeKey),
    garminActivityTypeKey: completed?.garminActivityTypeKey || typeKey,
    has_conversation: Boolean(completed?.has_conversation),
  };
}

export function buildPlanActualComparison(planned, completed) {
  const durationSeconds = Number(completed.duration_seconds || completed.durationSeconds || 0);
  const durationMinutes = durationSeconds ? Math.round(durationSeconds / 60) : null;
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
      actual: durationSeconds ? formatDurationClock(durationSeconds) : "",
      status,
      result,
    });
  }

  items.push({
    key: "intensity",
    label: "Intensidad",
    plan: planned.planned_intensity || "No definida",
    actual: [completed.garminActivityTypeLabel || completed.activityType, completed.training_effect_aerobic ? `TE ${completed.training_effect_aerobic}` : ""].filter(Boolean).join(" · "),
    status: completed.garminActivityTypeKey === "hiit" && /6|7|8|moderad|control/i.test(planned.planned_intensity || "") ? "warning" : "unknown",
    result: completed.garminActivityTypeKey === "hiit" ? "Revisar coste real" : "Sin dato suficiente",
  });

  const executionText = executionSearchText(completed);
  const constraints = toArray(planned.constraints).join(" · ");
  const lumbarOk = !/(deadlift|peso muerto|bisagra pesada|1rm|maximo|maximos)/i.test(executionText);
  if (constraints) {
    items.push({
      key: "lumbar",
      label: "Lumbar",
      plan: constraints,
      actual: lumbarOk ? "Sin bisagra pesada detectada" : "Posible bisagra/maximo detectado",
      status: lumbarOk ? "ok" : "danger",
      result: lumbarOk ? "Cumplido" : "Revisar",
    });
  }

  const impactWarning = /(jump|salto|saltos|burpee|finisher)/i.test(executionText) || completed.id === LIVE_WEEK_PILOT_SESSION_ID;
  items.push({
    key: "impact",
    label: "Impacto",
    plan: constraints.includes("salt") ? "Controlar saltos" : "Bajo-moderado",
    actual: impactWarning ? "Finisher con saltos" : "Sin impacto alto detectado",
    status: impactWarning ? "warning" : "ok",
    result: impactWarning ? "Vigilar" : "Cumplido",
  });

  if (completed.has_conversation) {
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

export function calendarSessionMatchesFilters(item, sourceFilter, typeFilter) {
  const sourceMatch = sourceFilter === "all" ||
    (sourceFilter === "garmin" && Boolean(item.completed)) ||
    (sourceFilter === "coach" && Boolean(item.coach)) ||
    (sourceFilter === "mixed" && Boolean(item.completed && item.coach));
  if (!sourceMatch) return false;
  if (typeFilter === "all") return true;
  return [item.typeKey, item.garminActivityTypeKey, item.activityType].includes(typeFilter);
}

export function sessionDateKey(session = {}) {
  if (session.date) return session.date;
  if (session.local_date) return session.local_date;
  if (session.planned_date) return session.planned_date;
  if (session.started_at) return new Date(session.started_at).toISOString().slice(0, 10);
  if (session.created_at) return new Date(session.created_at).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
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
  const duration = formatDurationClock(completed.duration_seconds || completed.durationSeconds || 0);
  const garmin = [completed.garminActivityTypeLabel || completed.activityType, duration].filter(Boolean).join(" · ");
  const blockCount = Number(completed.coach_blocks_count || completed.block_count || completed.coachBlockCount || 0);
  const exerciseCount = Number(completed.coach_exercises_count || completed.exercise_count || completed.coachExerciseCount || 0);
  const coach = [
    blockCount ? `${blockCount} bloques` : "",
    exerciseCount ? `${exerciseCount} ejercicios` : "",
  ].filter(Boolean).join(" · ");
  return {
    id: completed.id,
    garmin,
    coach,
    primary: [garmin ? `Garmin ${garmin}` : "", coach].filter(Boolean).join(" · "),
    duration,
    avgHr: completed.avg_hr || null,
    maxHr: completed.max_hr || null,
    calories: completed.calories_total || null,
    highlights: completed.id === LIVE_WEEK_PILOT_SESSION_ID
      ? ["KB high pull 16 kg", "Step-up 20 kg", "Media wall ball 12 kg", "Assault bike 77 rpm"]
      : [],
  };
}

function normalizedStatus(status) {
  return STATUS_META[status] ? status : "planned";
}

function priorityStatusMeta(priority, fallbackStatus) {
  const text = `${priority || ""}`.toLowerCase();
  if (text.includes("prob")) return { label: "PROBABLE", tone: "gray" };
  if (text.includes("adapt")) return { label: "ADAPTABLE", tone: "amber" };
  if (text.includes("recomend")) return { label: "RECOMENDADO", tone: "gray" };
  return STATUS_META[fallbackStatus] || STATUS_META.planned;
}

function compatibleSessionTypes(plannedType, completedType) {
  const planned = normalizeType(plannedType);
  const completed = normalizeType(completedType);
  if (!planned || !completed) return false;
  if (planned === completed) return true;
  return (TYPE_COMPATIBILITY[planned] || []).includes(completed);
}

function normalizeType(value) {
  return `${value || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
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

function executionSearchText(completed = {}) {
  return [
    completed.title,
    completed.garminActivityTypeLabel,
    completed.activityType,
    completed.id === LIVE_WEEK_PILOT_SESSION_ID ? "finisher con saltos kb high pull step-up wall ball assault bike" : "",
    JSON.stringify(completed.session_structure || {}),
  ].filter(Boolean).join(" ");
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

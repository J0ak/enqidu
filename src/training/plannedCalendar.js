const PLANNED_STATUSES = new Set([
  "planned",
  "confirmed",
  "adaptable",
  "probable",
  "recommended",
  "modified",
  "skipped",
  "rescheduled",
]);

const STATUS_LABELS = {
  planned: "Planificada",
  completed: "Completada",
  confirmed: "Confirmada",
  adaptable: "Adaptable",
  probable: "Probable",
  recommended: "Recomendada",
  modified: "Modificada",
  skipped: "Omitida",
  rescheduled: "Reprogramada",
};

const TYPE_LABELS = {
  hiit: "HIIT",
  hybrid: "Híbrido",
  strength: "Fuerza",
  yoga: "Yoga",
  pilates: "Pilates",
  recovery: "Recovery",
  mobility: "Movilidad",
  run: "Correr",
  running: "Correr",
  trail: "Trail",
  cycling: "Ciclismo",
  swim: "Natación",
  swimming: "Natación",
  rest: "Descanso",
  other: "Otro",
};

export function normalizePlannedStatus(status) {
  const normalized = normalizeKey(status || "planned");
  return PLANNED_STATUSES.has(normalized) ? normalized : "planned";
}

export function normalizePlannedCalendarItem(row = {}, blocks = []) {
  const status = normalizePlannedStatus(row.status || row.session_status || row.planned_status);
  const typeKey = normalizePlannedTypeKey(row.type_key || row.session_type || row.activity_type || row.type || row.discipline || "other");
  const date = plannedDate(row);
  const time = plannedTime(row);
  const title = text(row.title || row.name || row.session_title || TYPE_LABELS[typeKey] || "Sesión planificada");
  const durationLabel = plannedDurationLabel(row);
  const intensityLabel = text(row.planned_intensity || row.intensity_label || row.intensity || row.rpe_target || row.target_rpe || row.rpe_range);
  const objective = text(row.objective || row.goal || row.session_goal || row.description);
  const restrictions = normalizeTextList(row.restrictions || row.constraints || row.limits || row.limitations);
  const coachNotes = text(row.coach_notes || row.notes || row.coach_note);
  const normalizedBlocks = normalizePlannedBlocks(blocks);
  const chips = [
    "Planificada",
    TYPE_LABELS[typeKey] || titleCase(typeKey),
    time,
    durationLabel,
    status !== "planned" ? STATUS_LABELS[status] : null,
  ].filter(Boolean);

  return {
    kind: "planned",
    id: String(row.id || row.planned_session_id || row.session_id || ""),
    linked_completed_session_id: stringOrNull(row.linked_completed_session_id),
    date,
    local_date: date,
    time,
    started_at: plannedStartedAt(date, time),
    title,
    typeKey,
    typeLabel: TYPE_LABELS[typeKey] || titleCase(typeKey),
    activityType: plannedTypeToActivityType(typeKey),
    status,
    statusLabel: STATUS_LABELS[status],
    plannedDurationLabel: durationLabel,
    durationSeconds: plannedDurationSeconds(row),
    objective,
    intensityLabel,
    restrictions,
    coachNotes,
    chips,
    blocks: normalizedBlocks,
    blocksCount: normalizedBlocks.length || numberOrNull(row.blocks_count) || 0,
    exercises: normalizeTextList(row.exercises || row.suggested_exercises || row.planned_exercises),
    raw: row,
  };
}

export function normalizeExecutedCalendarItem(row = {}) {
  const summary = row.session_structure?.garmin_fit_summary || {};
  const heartRate = summary.heart_rate || {};
  const calories = summary.calories || {};
  const trainingEffect = summary.training_effect || {};
  const summaryMetrics = row.summary_metrics || {};
  const durationSeconds = numberOrNull(row.duration_seconds ?? row.durationSeconds ?? summary.duration_total_seconds ?? summary.duration_elapsed_seconds);
  const normalized = {
    ...row,
    kind: "executed",
    duration_seconds: durationSeconds ?? Number(row.duration_seconds || row.durationSeconds || 0),
    avg_hr: numberOrNull(row.avg_hr ?? row.avg_heart_rate ?? row.average_heart_rate ?? row.average_heart_rate_bpm ?? summaryMetrics.avg_heart_rate ?? summaryMetrics.average_heart_rate ?? heartRate.avg_bpm),
    max_hr: numberOrNull(row.max_hr ?? row.max_heart_rate ?? row.maximum_heart_rate ?? row.maximum_heart_rate_bpm ?? summaryMetrics.max_heart_rate ?? summaryMetrics.maximum_heart_rate ?? heartRate.max_bpm),
    calories_total: numberOrNull(row.calories_total ?? row.total_calories ?? summaryMetrics.calories_total ?? summaryMetrics.total_calories ?? calories.total_kcal),
    training_effect_aerobic: numberOrNull(row.training_effect_aerobic ?? summaryMetrics.training_effect_aerobic ?? summaryMetrics.aerobic_training_effect ?? trainingEffect.aerobic),
    training_effect_anaerobic: numberOrNull(row.training_effect_anaerobic ?? summaryMetrics.training_effect_anaerobic ?? summaryMetrics.anaerobic_training_effect ?? trainingEffect.anaerobic),
  };
  return normalized;
}

export function mergeExecutedAndPlannedForCalendar(executed = [], planned = []) {
  const executedItems = executed.map(normalizeExecutedCalendarItem);
  const plannedItems = planned.map((item) => item.kind === "planned" ? item : normalizePlannedCalendarItem(item));
  const executedById = new Map(executedItems.map((item) => [String(item.id || ""), item]));
  const linkedExecutedIds = new Set();
  const items = [];

  plannedItems.forEach((plannedItem) => {
    const linkedId = plannedItem.linked_completed_session_id;
    const executedItem = linkedId ? executedById.get(linkedId) : null;
    if (!linkedId || !executedItem) return;
    linkedExecutedIds.add(String(executedItem.id));
    items.push(buildPlannedCompletedCalendarItem(plannedItem, executedItem));
  });

  executedItems.forEach((executedItem) => {
    if (!linkedExecutedIds.has(String(executedItem.id))) items.push(executedItem);
  });

  plannedItems.forEach((plannedItem) => {
    if (!plannedItem.linked_completed_session_id || !linkedExecutedIds.has(plannedItem.linked_completed_session_id)) {
      items.push(plannedItem);
    }
  });

  return items.sort(sortCalendarItemsChronological);
}

export function resolveCalendarItemRoute(item = {}) {
  return item.kind === "planned" ? "plannedSessionDetail" : "activityDetail";
}

export async function loadCalendarItemsWithTolerantPlanned({
  loadExecutedActivities,
  loadPlannedSessions,
  onPlannedError,
}) {
  const executed = await loadExecutedActivities();
  let planned = [];
  try {
    planned = await loadPlannedSessions();
  } catch (error) {
    if (onPlannedError) onPlannedError(error);
  }
  return mergeExecutedAndPlannedForCalendar(executed, planned);
}

export async function fetchReadonlyPlannedSessions(supabaseClient, userId) {
  if (!supabaseClient) return [];

  let sessionQuery = supabaseClient
    .from("planned_training_sessions")
    .select("*")
    .limit(100);

  if (userId) sessionQuery = sessionQuery.eq("user_id", userId);

  const sessionResult = await sessionQuery;
  if (sessionResult.error) throw sessionResult.error;

  const rows = sessionResult.data || [];
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return rows.map((row) => normalizePlannedCalendarItem(row));

  const blocksResult = await supabaseClient
    .from("planned_session_blocks")
    .select("*")
    .in("planned_session_id", ids);

  if (blocksResult.error) throw blocksResult.error;

  const blocksBySession = groupBy(blocksResult.data || [], "planned_session_id");
  return rows.map((row) => normalizePlannedCalendarItem(row, blocksBySession[row.id] || []));
}

function sortCalendarItemsChronological(a, b) {
  return calendarTimestamp(a).localeCompare(calendarTimestamp(b));
}

function calendarTimestamp(item = {}) {
  return item.started_at || item.planned_at || item.created_at || `${item.local_date || item.date || ""}T${item.time || "23:59"}:00`;
}

function buildPlannedCompletedCalendarItem(planned, executed) {
  const startedAt = executed.started_at || planned.started_at || planned.planned_at || "";
  const date = executed.local_date || executed.date || planned.date || planned.local_date || "";
  const displaySource = displaySourceLabel(executed);
  return {
    ...executed,
    kind: "planned_completed",
    id: `planned_completed:${planned.id}:${executed.id}`,
    executed_id: executed.id,
    planned_id: planned.id,
    planned,
    executed,
    title: planned.title,
    displayTitle: planned.title,
    displaySource,
    effectiveStatus: "completed",
    statusLabel: STATUS_LABELS.completed,
    garminTitle: executed.title,
    started_at: startedAt,
    local_date: date,
    date,
    time: planned.time,
    typeKey: planned.typeKey,
    typeLabel: planned.typeLabel,
    activityType: planned.activityType,
    garminActivityTypeKey: executed.garminActivityTypeKey,
    garminActivityTypeLabel: executed.garminActivityTypeLabel,
    plannedData: {
      objective: planned.objective,
      restrictions: planned.restrictions,
      blocks: planned.blocks,
      intensityLabel: planned.intensityLabel,
      durationLabel: planned.plannedDurationLabel,
    },
  };
}

function displaySourceLabel(executed = {}) {
  const sourceText = normalizeKey([
    executed.source,
    executed.source_id,
    executed.external_reference,
    executed.session_structure?.garmin_fit_summary?.fit_identity?.external_reference,
  ].filter(Boolean).join(" "));
  if (sourceText.includes("fit")) return "FIT";
  if (sourceText.includes("garmin")) return "Garmin";
  return executed.session_structure?.garmin_fit_summary ? "FIT" : "Garmin/FIT";
}

function plannedDate(row = {}) {
  const direct = row.local_date || row.planned_date || row.date || row.calendar_date || row.scheduled_date;
  if (direct) return String(direct).slice(0, 10);
  const stamped = row.planned_at || row.scheduled_at || row.starts_at || row.start_time || row.created_at;
  return stamped ? String(stamped).slice(0, 10) : "";
}

function plannedTime(row = {}) {
  const direct = row.local_time || row.planned_time || row.time || row.scheduled_time;
  if (direct) return String(direct).slice(0, 5);
  const stamped = row.planned_at || row.scheduled_at || row.starts_at || row.start_time;
  if (!stamped) return "";
  const date = new Date(stamped);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function plannedStartedAt(date, time) {
  if (!date) return "";
  return `${date}T${time || "23:59"}:00`;
}

function plannedDurationSeconds(row = {}) {
  const seconds = numberOrNull(row.planned_duration_seconds ?? row.duration_seconds ?? row.target_duration_seconds);
  if (seconds != null) return seconds;
  const minutes = numberOrNull(row.planned_duration_minutes ?? row.duration_minutes ?? row.target_duration_minutes);
  return minutes != null ? minutes * 60 : 0;
}

function plannedDurationLabel(row = {}) {
  const direct = text(row.planned_duration_label || row.duration_label || row.target_duration_label);
  if (direct) return direct;
  const min = numberOrNull(row.planned_duration_min ?? row.duration_min_minutes ?? row.min_duration_minutes);
  const max = numberOrNull(row.planned_duration_max ?? row.duration_max_minutes ?? row.max_duration_minutes);
  if (min && max) return `${min}-${max} min`;
  const seconds = plannedDurationSeconds(row);
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function normalizePlannedBlocks(blocks = []) {
  return blocks
    .slice()
    .sort((a, b) => Number(a.block_order ?? a.order_index ?? 0) - Number(b.block_order ?? b.order_index ?? 0))
    .map((block, index) => ({
      id: String(block.id || `${index + 1}`),
      order: Number(block.block_order ?? block.order_index ?? index + 1),
      title: text(block.title || block.name || block.block_type || `Bloque ${index + 1}`),
      description: text(block.objective || block.description || block.notes || block.prescription),
      exercises: normalizeTextList(block.planned_exercises || block.exercises || block.suggested_exercises || block.items),
    }));
}

function normalizePlannedTypeKey(value) {
  const key = normalizeKey(value || "other");
  if (key.includes("recover") || key.includes("recuperacion")) return "recovery";
  if (key.includes("mobil")) return "mobility";
  if (key.includes("strength") || key.includes("fuerza")) return "strength";
  if (key.includes("yoga")) return "yoga";
  if (key.includes("pilates")) return "pilates";
  if (key.includes("hiit")) return "hiit";
  if (key.includes("hybrid") || key.includes("hibrido")) return "hybrid";
  if (key.includes("trail")) return "trail";
  if (key.includes("run") || key.includes("correr")) return "run";
  if (key.includes("cycl") || key.includes("ciclismo")) return "cycling";
  if (key.includes("swim") || key.includes("natacion")) return "swim";
  if (key.includes("rest") || key.includes("descanso")) return "rest";
  return key || "other";
}

function plannedTypeToActivityType(typeKey) {
  if (["running", "run"].includes(typeKey)) return "run";
  if (["swimming", "swim"].includes(typeKey)) return "swim";
  if (["mobility", "recovery", "rest"].includes(typeKey)) return "pilates";
  if (["hiit", "hybrid", "strength", "yoga", "pilates", "trail", "cycling"].includes(typeKey)) return typeKey;
  return "hybrid";
}

function normalizeTextList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "string" ? item : text(item.name || item.title || item.label || item.description))
      .filter(Boolean);
  }
  if (typeof value === "object") {
    return normalizeTextList(value.items || value.list || Object.values(value));
  }
  return String(value)
    .split(/\n|;|\|/)
    .map((item) => text(item.replace(/^[-*]\s*/, "")))
    .filter(Boolean);
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key];
    if (!value) return acc;
    if (!acc[value]) acc[value] = [];
    acc[value].push(row);
    return acc;
  }, {});
}

function normalizeKey(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function titleCase(value) {
  return text(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function text(value) {
  return `${value ?? ""}`.trim();
}

function stringOrNull(value) {
  const clean = text(value);
  return clean || null;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

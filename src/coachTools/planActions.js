const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ENQIDU_WEEKDAYS = Object.freeze([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

const WEEKDAY_INDEX = new Map(ENQIDU_WEEKDAYS.map((name, index) => [name, index]));

export function isValidPlanCalendarDate(value) {
  if (!ISO_DATE_RE.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftPlanCalendarDate(sourceDate, days) {
  if (!isValidPlanCalendarDate(sourceDate)) return null;
  const delta = Number(days);
  if (!Number.isInteger(delta)) return null;
  const parsed = new Date(`${sourceDate}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

export function resolveNextWeekdayDate(sourceDate, targetWeekday) {
  if (!isValidPlanCalendarDate(sourceDate)) return null;
  const targetIndex = WEEKDAY_INDEX.get(String(targetWeekday || ""));
  if (targetIndex == null) return null;

  const parsed = new Date(`${sourceDate}T12:00:00Z`);
  const currentIndex = parsed.getUTCDay();
  const delta = ((targetIndex - currentIndex + 7) % 7) || 7;
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

export function isPlanDateOnOrAfter(value, referenceDate) {
  return isValidPlanCalendarDate(value)
    && isValidPlanCalendarDate(referenceDate)
    && value >= referenceDate;
}


export function scalePlannedBlockDurations(blocks = [], targetMinutes) {
  const target = Number(targetMinutes);
  if (!Number.isInteger(target) || target < 10 || target > 180) return null;
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > 12 || target < blocks.length) return null;

  const normalized = blocks.map((block, index) => {
    const seconds = Number(block?.planned_duration_seconds);
    const id = typeof block?.id === "string" ? block.id.trim() : "";
    if (!id || !Number.isFinite(seconds) || seconds <= 0) return null;
    return {
      ...block,
      id,
      index,
      weight: seconds,
    };
  });
  if (normalized.some((block) => !block)) return null;

  const totalWeight = normalized.reduce((sum, block) => sum + block.weight, 0);
  if (!(totalWeight > 0)) return null;

  const flexibleMinutes = target - normalized.length;
  const allocated = normalized.map((block) => {
    const raw = flexibleMinutes * (block.weight / totalWeight);
    return {
      ...block,
      base: Math.floor(raw),
      remainder: raw - Math.floor(raw),
    };
  });

  let remaining = flexibleMinutes - allocated.reduce((sum, block) => sum + block.base, 0);
  const priority = allocated
    .slice()
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const bonus = new Set(priority.slice(0, remaining).map((block) => block.index));

  return allocated
    .sort((a, b) => a.index - b.index)
    .map((block) => {
      const durationMinutes = 1 + block.base + (bonus.has(block.index) ? 1 : 0);
      return {
        id: block.id,
        block_order: block.block_order ?? block.index + 1,
        title: block.title || null,
        duration_minutes: durationMinutes,
        duration_seconds: durationMinutes * 60,
      };
    });
}


export function resolveRemainingWeekEndDate(sourceDate) {
  if (!isValidPlanCalendarDate(sourceDate)) return null;
  const parsed = new Date(`${sourceDate}T12:00:00Z`);
  const day = parsed.getUTCDay();
  const delta = day === 0 ? 0 : 7 - day;
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

const normalizedStatus = (value = "") => String(value || "").trim().toLowerCase();

export function planRemainingWeekReschedule({
  sessions = [],
  unavailableDates = [],
  fromDate,
  toDate,
} = {}) {
  if (!isValidPlanCalendarDate(fromDate) || !isValidPlanCalendarDate(toDate) || toDate < fromDate) {
    return { ok: false, error: "invalid_week_range", moves: [] };
  }

  const spanDays = Math.round(
    (Date.parse(`${toDate}T12:00:00Z`) - Date.parse(`${fromDate}T12:00:00Z`)) / 86400000,
  );
  if (!Number.isInteger(spanDays) || spanDays < 0 || spanDays > 6) {
    return { ok: false, error: "invalid_week_range", moves: [] };
  }

  const unavailable = new Set(
    (Array.isArray(unavailableDates) ? unavailableDates : [])
      .map((value) => String(value || ""))
      .filter((value) => isValidPlanCalendarDate(value) && value >= fromDate && value <= toDate),
  );

  const active = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session && session.status !== "cancelled")
    .filter((session) => {
      const date = String(session.planned_date || "");
      return isValidPlanCalendarDate(date) && date >= fromDate && date <= toDate;
    })
    .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)));

  const countsByDate = new Map();
  for (const session of active) {
    const date = String(session.planned_date);
    countsByDate.set(date, (countsByDate.get(date) || 0) + 1);
  }
  if ([...countsByDate.values()].some((count) => count > 1)) {
    return { ok: false, error: "remaining_week_plan_ambiguous", moves: [] };
  }

  const needsMove = active.filter((session) => unavailable.has(String(session.planned_date)));
  for (const session of needsMove) {
    if (session.source !== "enkidu_coach") {
      return { ok: false, error: "unsupported_plan_source", moves: [] };
    }
    if (session.linked_completed_session_id || normalizedStatus(session.status) === "skipped") {
      return { ok: false, error: "source_plan_not_adaptable", moves: [] };
    }
  }

  const movingIds = new Set(needsMove.map((session) => String(session.id || "")));
  if ([...movingIds].some((id) => !id)) {
    return { ok: false, error: "invalid_planned_session", moves: [] };
  }

  const occupied = new Set(
    active
      .filter((session) => !movingIds.has(String(session.id || "")))
      .map((session) => String(session.planned_date)),
  );

  const moves = [];
  for (const session of needsMove) {
    let targetDate = shiftPlanCalendarDate(String(session.planned_date), 1);
    while (targetDate && targetDate <= toDate) {
      if (!unavailable.has(targetDate) && !occupied.has(targetDate)) break;
      targetDate = shiftPlanCalendarDate(targetDate, 1);
    }
    if (!targetDate || targetDate > toDate) {
      return { ok: false, error: "remaining_week_capacity_exhausted", moves: [] };
    }

    occupied.add(targetDate);
    moves.push({
      planned_session_id: String(session.id),
      title: session.title || null,
      source_date: String(session.planned_date),
      target_date: targetDate,
    });
  }

  return {
    ok: true,
    moves,
    from_date: fromDate,
    to_date: toDate,
  };
}

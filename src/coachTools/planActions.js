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

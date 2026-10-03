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

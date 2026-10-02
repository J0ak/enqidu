const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCalendarDate(value) {
  if (!ISO_DATE_RE.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function calendarDateInTimeZone(date = new Date(), timeZone = "UTC") {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!isValidTimeZone(timeZone)) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const values = Object.fromEntries(
    parts
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, part.value]),
  );

  return values.year && values.month && values.day
    ? `${values.year}-${values.month}-${values.day}`
    : null;
}

export function resolveUserCalendar({
  explicitDate = null,
  explicitDateSource = null,
  profileTimezone = null,
  clientTimezone = null,
  now = new Date(),
} = {}) {
  const timezone = isValidTimeZone(profileTimezone)
    ? profileTimezone.trim()
    : isValidTimeZone(clientTimezone)
      ? clientTimezone.trim()
      : "UTC";

  if (explicitDateSource === "explicit") {
    if (!isValidCalendarDate(explicitDate)) {
      return {
        ok: false,
        error: "invalid_date",
        timezone,
        source: "explicit",
        date: null,
      };
    }
    return {
      ok: true,
      date: explicitDate,
      timezone,
      source: "explicit",
    };
  }

  return {
    ok: true,
    date: calendarDateInTimeZone(now, timezone),
    timezone,
    source: isValidTimeZone(profileTimezone)
      ? "profile_timezone"
      : isValidTimeZone(clientTimezone)
        ? "client_timezone_fallback"
        : "utc_fallback",
  };
}

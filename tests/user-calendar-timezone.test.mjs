import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calendarDateInTimeZone,
  isValidCalendarDate,
  isValidTimeZone,
  resolveUserCalendar,
} from "../src/time/userCalendar.js";

test("the same instant resolves to Madrid 2 Oct while a PDT browser is still on 1 Oct", () => {
  const instant = new Date("2026-10-02T06:20:00Z");
  assert.equal(calendarDateInTimeZone(instant, "Europe/Madrid"), "2026-10-02");
  assert.equal(calendarDateInTimeZone(instant, "America/Los_Angeles"), "2026-10-01");
});

test("profile timezone beats the browser timezone for relative calendar semantics", () => {
  const result = resolveUserCalendar({
    profileTimezone: "Europe/Madrid",
    clientTimezone: "America/Los_Angeles",
    now: new Date("2026-10-02T06:20:00Z"),
  });
  assert.deepEqual(result, {
    ok: true,
    date: "2026-10-02",
    timezone: "Europe/Madrid",
    source: "profile_timezone",
  });
});

test("client timezone is only a fallback when the profile has no valid timezone", () => {
  const result = resolveUserCalendar({
    profileTimezone: null,
    clientTimezone: "America/Los_Angeles",
    now: new Date("2026-10-02T06:20:00Z"),
  });
  assert.equal(result.date, "2026-10-01");
  assert.equal(result.source, "client_timezone_fallback");
});

test("explicit historical dates remain possible but must be declared and valid", () => {
  assert.deepEqual(resolveUserCalendar({
    explicitDate: "2026-09-28",
    explicitDateSource: "explicit",
    profileTimezone: "Europe/Madrid",
  }), {
    ok: true,
    date: "2026-09-28",
    timezone: "Europe/Madrid",
    source: "explicit",
  });

  assert.equal(resolveUserCalendar({
    explicitDate: "28/09/2026",
    explicitDateSource: "explicit",
    profileTimezone: "Europe/Madrid",
  }).ok, false);
});

test("timezone and ISO date validation reject invalid values", () => {
  assert.equal(isValidTimeZone("Europe/Madrid"), true);
  assert.equal(isValidTimeZone("PDT"), false);
  assert.equal(isValidCalendarDate("2026-10-02"), true);
  assert.equal(isValidCalendarDate("2026-02-31"), false);
});

test("profile timezone migration adds the field without widening client permissions", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261002062917_add_profile_timezone.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /alter table public\.profiles[\s\S]*add column if not exists timezone text/i);
  assert.match(sql, /set timezone = 'Europe\/Madrid'/i);
  assert.doesNotMatch(sql, /grant .* to (anon|authenticated)/i);
});

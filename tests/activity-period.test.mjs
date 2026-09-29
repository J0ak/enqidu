import assert from "node:assert/strict";
import test from "node:test";
import { isDateWithinPeriod } from "../src/training/activityPeriod.js";

test("includes the first, middle and last day of a weekly period", () => {
  const period = {
    start: new Date(2026, 6, 13, 0, 0, 0),
    end: new Date(2026, 6, 19, 0, 0, 0),
  };

  assert.equal(isDateWithinPeriod("2026-07-13", period), true);
  assert.equal(isDateWithinPeriod("2026-07-16", period), true);
  assert.equal(isDateWithinPeriod("2026-07-19", period), true);
  assert.equal(isDateWithinPeriod("2026-07-12", period), false);
  assert.equal(isDateWithinPeriod("2026-07-20", period), false);
});

test("includes the final calendar day of a month even when period end is midnight", () => {
  const period = {
    start: new Date(2026, 6, 1, 0, 0, 0),
    end: new Date(2026, 6, 31, 0, 0, 0),
  };

  assert.equal(isDateWithinPeriod("2026-07-31", period), true);
  assert.equal(isDateWithinPeriod("2026-08-01", period), false);
});

test("rejects malformed keys or invalid period boundaries", () => {
  assert.equal(isDateWithinPeriod("19/07/2026", {
    start: new Date(2026, 6, 13),
    end: new Date(2026, 6, 19),
  }), false);

  assert.equal(isDateWithinPeriod("2026-07-19", {
    start: new Date("invalid"),
    end: new Date(2026, 6, 19),
  }), false);
});

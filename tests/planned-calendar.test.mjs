import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadCalendarItemsWithTolerantPlanned,
  mergeExecutedAndPlannedForCalendar,
  normalizePlannedCalendarItem,
  normalizePlannedStatus,
  resolveCalendarItemRoute,
} from "../src/training/plannedCalendar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("executed items still render when planned loading fails", async () => {
  const warnings = [];
  const items = await loadCalendarItemsWithTolerantPlanned({
    loadExecutedActivities: async () => [{ id: "executed-22", title: "HIIT", local_date: "2026-06-22" }],
    loadPlannedSessions: async () => {
      throw new Error("planned_training_sessions missing");
    },
    onPlannedError: (error) => warnings.push(error.message),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "executed");
  assert.equal(items[0].id, "executed-22");
  assert.deepEqual(warnings, ["planned_training_sessions missing"]);
});

test("planned items normalize as kind planned with allowed status fallback", () => {
  const item = normalizePlannedCalendarItem({
    id: "planned-24",
    title: "Híbrido fuera de casa",
    planned_date: "2026-06-24",
    planned_time: "07:00",
    type_key: "hybrid",
    status: "unexpected",
    duration_min_minutes: 45,
    duration_max_minutes: 60,
  });

  assert.equal(item.kind, "planned");
  assert.equal(item.status, "planned");
  assert.equal(item.statusLabel, "Planificada");
  assert.equal(item.plannedDurationLabel, "45-60 min");
  assert.ok(item.chips.includes("Planificada"));
});

test("planned items read pilot migration duration and intensity columns", () => {
  const item = normalizePlannedCalendarItem({
    id: "planned-26",
    title: "Fuerza técnica en casa",
    planned_date: "2026-06-26",
    session_type: "strength",
    planned_intensity: "RPE 6-7",
    planned_duration_min: 45,
    planned_duration_max: 60,
  });

  assert.equal(item.intensityLabel, "RPE 6-7");
  assert.equal(item.plannedDurationLabel, "45-60 min");
});

test("planned is routed to planned detail, not ActivityView", () => {
  assert.equal(resolveCalendarItemRoute({ kind: "planned", id: "planned-1" }), "plannedSessionDetail");
});

test("executed is routed to ActivityView, not PlannedSessionDetail", () => {
  assert.equal(resolveCalendarItemRoute({ kind: "executed", id: "executed-1" }), "activityDetail");
  assert.equal(resolveCalendarItemRoute({ id: "legacy-executed" }), "activityDetail");
});

test("planned and executed on the same day coexist without merging", () => {
  const items = mergeExecutedAndPlannedForCalendar(
    [{ id: "executed-22", title: "HIIT", local_date: "2026-06-24", started_at: "2026-06-24T06:30:00" }],
    [{ id: "planned-24", title: "Yoga", planned_date: "2026-06-24", planned_time: "18:00", type_key: "yoga" }],
  );

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.kind), ["executed", "planned"]);
  assert.deepEqual(items.map((item) => item.id), ["executed-22", "planned-24"]);
});

test("Yoga planned sessions stay Yoga", () => {
  const item = normalizePlannedCalendarItem({
    id: "planned-yoga",
    title: "Yoga",
    planned_date: "2026-06-18",
    type_key: "yoga",
  });

  assert.equal(item.typeKey, "yoga");
  assert.equal(item.typeLabel, "Yoga");
  assert.equal(item.activityType, "yoga");
});

test("executed Yoga resolver remains mapped to Yoga", async () => {
  const source = await readFile(path.join(root, "src", "main.jsx"), "utf8");
  assert.match(source, /\["yoga", \["yoga"\]\]/);
  assert.match(source, /if \(text\.includes\("yoga"\)\) return "yoga";/);
});

test("missing planned_training_sessions does not break activities", async () => {
  const items = await loadCalendarItemsWithTolerantPlanned({
    loadExecutedActivities: async () => [{ id: "executed-yoga", title: "Yoga", local_date: "2026-06-18" }],
    loadPlannedSessions: async () => {
      const error = new Error("relation planned_training_sessions does not exist");
      error.code = "42P01";
      throw error;
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "executed");
  assert.equal(items[0].title, "Yoga");
});

test("only documented planned statuses are accepted", () => {
  assert.equal(normalizePlannedStatus("confirmed"), "confirmed");
  assert.equal(normalizePlannedStatus("rescheduled"), "rescheduled");
  assert.equal(normalizePlannedStatus("custom-status"), "planned");
});

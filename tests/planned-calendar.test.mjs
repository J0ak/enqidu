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

test("planned items preserve planned blocks from pilot migration columns", () => {
  const item = normalizePlannedCalendarItem(
    {
      id: "planned-24",
      title: "Híbrido fuera de casa",
      planned_date: "2026-06-24",
      session_type: "hybrid",
    },
    [
      {
        id: "block-1",
        block_order: 1,
        title: "Movilidad + activación",
        objective: "Preparar cadera, core y hombros.",
        planned_exercises: [{ name: "Dead bug" }, { name: "Band pull-apart" }],
      },
    ],
  );

  assert.equal(item.blocksCount, 1);
  assert.equal(item.blocks[0].title, "Movilidad + activación");
  assert.equal(item.blocks[0].description, "Preparar cadera, core y hombros.");
  assert.deepEqual(item.blocks[0].exercises, ["Dead bug", "Band pull-apart"]);
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

test("linked planned sessions render as one planned completed item with executed metrics", () => {
  const items = mergeExecutedAndPlannedForCalendar(
    [
      {
        id: "executed-22",
        title: "HIIT",
        local_date: "2026-06-22",
        started_at: "2026-06-22T07:00:00",
        duration_seconds: 1800,
      },
      {
        id: "0138b1aa-fc30-4f30-b7ba-2b69f3259a8b",
        title: "Fuerza",
        local_date: "2026-06-23",
        started_at: "2026-06-23T08:30:00",
        duration_seconds: 2071,
        avg_hr: 105,
        max_hr: 152,
        calories_total: 275,
        training_effect_aerobic: 2.0,
        training_effect_anaerobic: 0.9,
        source_id: "fit-import",
      },
    ],
    [
      {
        id: "06beb578-8b11-4525-b9de-c387e2bc9511",
        title: "Recuperacion activa",
        planned_date: "2026-06-23",
        planned_time: "09:00",
        session_type: "recovery",
        planned_intensity: "RPE 2-3",
        planned_duration_min: 25,
        planned_duration_max: 40,
        linked_completed_session_id: "0138b1aa-fc30-4f30-b7ba-2b69f3259a8b",
      },
      {
        id: "planned-24",
        title: "Yoga",
        planned_date: "2026-06-24",
        type_key: "yoga",
      },
    ],
  );

  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.kind), ["executed", "planned_completed", "planned"]);
  assert.ok(!items.some((item) => item.kind === "executed" && item.id === "0138b1aa-fc30-4f30-b7ba-2b69f3259a8b"));

  const linked = items.find((item) => item.kind === "planned_completed");
  assert.equal(linked.title, "Recuperacion activa");
  assert.equal(linked.displayTitle, "Recuperacion activa");
  assert.equal(linked.statusLabel, "Completada");
  assert.equal(linked.displaySource, "FIT");
  assert.equal(linked.garminTitle, "Fuerza");
  assert.equal(linked.duration_seconds, 2071);
  assert.equal(linked.avg_hr, 105);
  assert.equal(linked.max_hr, 152);
  assert.equal(linked.calories_total, 275);
  assert.equal(linked.training_effect_aerobic, 2.0);
  assert.equal(linked.training_effect_anaerobic, 0.9);
  assert.equal(resolveCalendarItemRoute(linked), "activityDetail");
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

test("planned backend migration creates safe planned-only RPC surface", async () => {
  const source = await readFile(path.join(root, "supabase", "migrations", "20260622_ai_planned_sessions_pilot_rpc.sql"), "utf8");

  assert.match(source, /create table if not exists public\.planned_training_sessions/);
  assert.match(source, /create table if not exists public\.planned_session_blocks/);
  assert.match(source, /create or replace function public\.chatgpt_pilot_apply_week_plan\(p_plan jsonb\)/);
  assert.match(source, /create or replace function public\.chatgpt_pilot_preview_week_plan\(p_plan jsonb\)/);
  assert.match(source, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(source, /alter table public\.planned_training_sessions enable row level security/);
  assert.match(source, /alter table public\.planned_session_blocks enable row level security/);
  assert.match(source, /revoke all on public\.planned_training_sessions from anon, authenticated/);
  assert.match(source, /grant select on public\.planned_training_sessions to authenticated/);
  assert.doesNotMatch(source, /grant select, insert, update, delete on public\.planned_training_sessions to authenticated/);
  assert.doesNotMatch(source, /delete from public\.training_sessions/);
  assert.doesNotMatch(source, /insert into public\.training_sessions/);
  assert.doesNotMatch(source, /update public\.training_sessions/);
  assert.doesNotMatch(source, /insert into public\.session_blocks/);
  assert.doesNotMatch(source, /insert into public\.session_exercises/);
  assert.doesNotMatch(source, /insert into public\.session_samples/);
  assert.doesNotMatch(source, /insert into public\.session_laps/);
  assert.doesNotMatch(source, /insert into public\.session_metrics/);
});

test("planned session writer migration exposes small ChatGPT RPCs without executed writes", async () => {
  const source = await readFile(path.join(root, "supabase", "migrations", "20260622_chatgpt_planned_session_writer_rpc.sql"), "utf8");

  assert.match(source, /create or replace function public\.chatgpt_pilot_preview_planned_session\(p_session jsonb\)/);
  assert.match(source, /create or replace function public\.chatgpt_pilot_apply_planned_session\(p_session jsonb\)/);
  assert.match(source, /create or replace function public\.chatgpt_pilot_preview_week_plan\(p_plan jsonb\)/);
  assert.match(source, /create or replace function public\.chatgpt_pilot_apply_week_plan\(p_plan jsonb\)/);
  assert.match(source, /public\.chatgpt_pilot_apply_planned_session/);
  assert.match(source, /grant execute on function public\.chatgpt_pilot_apply_planned_session\(jsonb\) to anon, authenticated, service_role/);
  assert.match(source, /grant execute on function public\.chatgpt_pilot_preview_planned_session\(jsonb\) to anon, authenticated, service_role/);
  assert.doesNotMatch(source, /insert into public\.training_sessions/);
  assert.doesNotMatch(source, /update public\.training_sessions/);
  assert.doesNotMatch(source, /delete from public\.training_sessions/);
  assert.doesNotMatch(source, /insert into public\.session_blocks/);
  assert.doesNotMatch(source, /insert into public\.session_exercises/);
  assert.doesNotMatch(source, /insert into public\.session_samples/);
  assert.doesNotMatch(source, /insert into public\.session_laps/);
  assert.doesNotMatch(source, /insert into public\.session_metrics/);
});

test("planned week contract documents ChatGPT pilot write flow", async () => {
  const source = await readFile(path.join(root, "docs", "planned-week-contract.md"), "utf8");

  assert.match(source, /chatgpt_pilot_preview_planned_session/);
  assert.match(source, /chatgpt_pilot_apply_planned_session/);
  assert.match(source, /chatgpt_pilot_preview_week_plan/);
  assert.match(source, /chatgpt_pilot_apply_week_plan/);
  assert.match(source, /Idempotencia/);
});

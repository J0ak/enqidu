import test from "node:test";
import assert from "node:assert/strict";
import { createToolsDb, TOOL_CALENDAR, TOOL_NOW } from "./support/enqiduToolsDb.mjs";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { buildDeterministicCoachReply } from "../src/coachContext/coachDeterministicReply.js";
import { applyToolResultsToCoachContext } from "../src/enqiduTools/coachAdapter.js";
const date = TOOL_CALENDAR.date;
async function brief(fixture) {
  const runtime = await createEnqiduToolRuntime({ db: fixture.db, now: TOOL_NOW, source: "mcp" });
  const result = await runtime.execute("get_morning_coach_brief", {});
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return { result, runtime };
}
test("good morning keeps persisted plan, current factors and no mutation", async () => {
  const fixture = createToolsDb(); const before = structuredClone(fixture.tables);
  const { result } = await brief(fixture);
  assert.equal(result.data.recommendation, "KEEP"); assert.equal(result.data.health_status, "fresh");
  assert.equal(result.data.applied, false); assert.deepEqual(fixture.tables, before);
  const context = applyToolResultsToCoachContext({}, [result]);
  const reply = buildDeterministicCoachReply({ message: "Buenos días", context });
  assert.equal(reply.llm_used, false); assert.match(reply.answer, /Mantendría/);
});
test("low sleep creates review request; preview never applies and MCP writes remain disabled", async () => {
  const fixture = createToolsDb(); fixture.tables.wearable_sleep_sessions.find((x) => x.calendar_date === date).total_duration_seconds = 14000;
  const before = structuredClone(fixture.tables);
  const { result, runtime } = await brief(fixture);
  assert.equal(result.data.recommendation, "REDUCE"); assert.equal(result.data.review_action.tool, "preview_adapt_duration");
  const preview = await runtime.execute(result.data.review_action.tool, result.data.review_action.arguments);
  assert.equal(preview.ok, true, JSON.stringify(preview.error));
  assert.deepEqual(fixture.tables, before);
  const denied = await runtime.execute("apply_adapt_duration", {});
  assert.equal(denied.error.code, "mcp_writes_disabled");
});
test("partial, stale, absent, unavailable and no plan never invent readiness or prescribe increases", async () => {
  for (const kind of ["partial", "stale", "absent", "unavailable", "no_plan"]) {
    const fixture = createToolsDb();
    if (kind === "partial") for (const key of Object.keys(fixture.tables).filter((k) => k.startsWith("wearable_") && k !== "wearable_sleep_sessions")) fixture.tables[key] = [];
    if (kind === "partial") for (const row of fixture.tables.wearable_sleep_sessions) delete row.hrv_last_night_avg_ms;
    if (["stale", "absent"].includes(kind)) for (const key of Object.keys(fixture.tables).filter((k) => k.startsWith("wearable_"))) fixture.tables[key] = kind === "absent" ? [] : fixture.tables[key].filter((row) => row.calendar_date && row.calendar_date < date);
    if (kind === "unavailable") fixture.tables.training_availability_overrides.push({ user_id: fixture.tables.profiles[0].id, calendar_date: date, availability_status: "unavailable" });
    if (kind === "no_plan") fixture.tables.planned_training_sessions = [];
    const { result } = await brief(fixture);
    if (["partial", "stale", "absent"].includes(kind)) { assert.equal(result.data.health_status, kind); assert.equal(result.data.readiness.score, null); }
    assert.equal(result.data.recommendation, kind === "no_plan" ? "NO_CHANGE" : "REVIEW_REQUIRED");
    assert.equal(result.data.review_action, null);
  }
});
test("ingestion status and morning reads are closed, owner scoped and payload free", async () => {
  const fixture = createToolsDb(); const { runtime } = await brief(fixture);
  for (const tool of ["get_morning_coach_brief", "get_health_ingestion_status"]) {
    const invalid = await runtime.execute(tool, { user_id: "another" }); assert.equal(invalid.ok, false);
    const result = await runtime.execute(tool, {}); assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.doesNotMatch(JSON.stringify(result), /RAW_SECRET|FOREIGN_SECRET|raw_payload/);
  }
});

test("existing Closed Loop is read and unavailable future target cannot get a review action", async () => {
  const fixture = createToolsDb();
  // Move only fixture calendar dates so yesterday's execution is exactly linked.
  fixture.tables.training_sessions[0].local_date = "2026-10-04";
  fixture.tables.training_sessions[0].started_at = "2026-10-04T08:00:00Z";
  fixture.tables.training_sessions[0].ended_at = "2026-10-04T08:50:00Z";
  // Keep planned_date on Oct 3: persisted link wins over same-day guessing.
  const { result } = await brief(fixture);
  assert.ok(result.data.adaptation_proposal);
  assert.equal(result.data.adaptation_proposal.applied, false);
  assert.equal(result.data.adaptation_proposal.requires_explicit_action, true);
  assert.equal(result.data.review_action.tool, "preview_closed_loop_proposal");
  const target = result.data.adaptation_proposal.affected_future_sessions[0];
  fixture.tables.training_availability_overrides.push({ user_id: fixture.tables.profiles[0].id, calendar_date: target.planned_date, availability_status: "unavailable" });
  const refreshed = (await brief(fixture)).result;
  assert.equal(refreshed.data.review_action, null);
  assert.equal(refreshed.data.recommendation, "REVIEW_REQUIRED");
  assert.equal(refreshed.data.applied, false);
});

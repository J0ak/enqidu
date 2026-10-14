import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createToolsDb, TOOL_NOW, TOOL_USER_A, TOOL_USER_B, toolId } from "./support/enqiduToolsDb.mjs";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { buildHealthTrend, dailyHealthState } from "../src/dailyCoach/healthTrend.js";
import { comparePlannedVsExecuted, compareTrainingDay } from "../src/closedLoop/plannedVsExecuted.js";
import { dailyCoachEvent, historyKey, projectDailyHistory } from "../src/dailyCoach/history.js";
import { assessClosedLoop } from "../src/closedLoop/closedLoopAssessment.js";
import { buildMorningCoachBrief } from "../src/health/morningCoachV1.js";
import { buildHealthEvidence } from "../src/health/healthEvidence.js";
import { openHealthDb, HEALTH_USER_A, HEALTH_USER_B } from "./support/healthFoundationDb.mjs";

const date = "2026-10-05";
const days = (scores) => scores.map((score, i) => {
  const day = `2026-${i < 2 ? `09-${29 + i}` : `10-0${i - 1}`}`;
  return { schema_version: "health_recovery_v1", calendar_date: day, evidence_quality: "complete", evidence_dates: [day],
    sleep: { calendar_date: day, freshness: "current", duration_seconds: 0 }, hrv: { calendar_date: day, freshness: "current", last_night_avg_ms: 0 },
    readiness: { schema_version: "readiness_v1", algorithm_version: "enqidu.readiness.v1.0.0", status: score === null ? "unavailable" : "available", score,
      evidence_dates: [day], factors: ["hrv", "sleep_duration"].map((metric) => ({ metric, evidence_date: day })) } };
});
for (const [direction, scores] of [["improving", [0, 0, null, 9, 20, 20, null]], ["declining", [80, 80, null, null, 60, 60, null]], ["stable", [40, 40, 40, 99, 44, 44, 44]], ["insufficient_data", [null, 40, null, 70, 90, null, 90]]]) {
  test(`seven-day readiness trend ${direction}: no interpolation and real zeros survive`, () => {
    const result = buildHealthTrend({ date, days: days(scores) });
    assert.equal(result.direction, direction);
    assert.equal(result.points.length, 7);
    assert.equal(result.points[0].readiness_score, scores[0]);
    assert.equal(result.points[0].sleep_seconds, 0);
  });
}
test("trend rejects differing factor sets, duplicated evidence dates and carried health metrics", () => {
  const history = days([20, 20, 20, 20, 80, 80, 80]);
  history[6].readiness.factors[0].metric = "body_battery";
  assert.equal(buildHealthTrend({ date, days: history }).direction, "insufficient_data");
  history.push(history[0]);
  assert.equal(buildHealthTrend({ date, days: history }).points[0].readiness_score, null);
  history[1].sleep.calendar_date = "2026-09-28";
  assert.equal(buildHealthTrend({ date, days: history }).points[1].sleep_seconds, null);
});
test("canonical health complete/partial/stale/missing are distinct and zeros remain observed", () => {
  assert.equal(dailyHealthState(days([0])[0], "2026-09-29").state, "complete");
  const partial = days([0])[0]; partial.evidence_quality = "partial";
  assert.equal(dailyHealthState(partial, "2026-09-29").state, "partial");
  assert.equal(dailyHealthState(partial, date).state, "stale");
  assert.equal(dailyHealthState(buildHealthEvidence({ userId: TOOL_USER_A, calendarDate: date, timezone: "Europe/Madrid" }), date).state, "missing");
});
const plan = { id: toolId(1), user_id: TOOL_USER_A, planned_date: date, title: "Plan", session_type: "strength", status: "planned", planned_duration_min: 50, planned_duration_max: 50, linked_completed_session_id: toolId(2) };
const execution = { id: toolId(2), user_id: TOOL_USER_A, title: "Manual or FIT", local_date: date, session_status: "completed", duration_seconds: 3000, modality_code: "functional_strength" };
function assessment(p = plan, e = execution, completion = "completed") {
  return assessClosedLoop({ userId: TOOL_USER_A, plannedSession: p, executedSession: e, userFeedback: e ? { confirmed: true, source: "user_confirmed", user_id: TOOL_USER_A, session_id: e.id, completion } : null, calendarDate: date, timezone: "Europe/Madrid" });
}
test("canonical comparison: exact linkage, changed duration/type, partial, explicit missed, rest, no plan", () => {
  assert.equal(assessment().planned_vs_executed.status, "completed_as_planned");
  assert.equal(assessment(plan, { ...execution, duration_seconds: 0 }).planned_vs_executed.status, "completed_modified");
  assert.equal(assessment(plan, { ...execution, modality_code: "running" }).planned_vs_executed.type_comparison, "different");
  assert.equal(assessment(plan, { ...execution, modality_code: "running" }).planned_vs_executed.status, "completed_modified");
  assert.equal(assessment(plan, execution, "partial").planned_vs_executed.status, "partial");
  assert.equal(assessment(plan, null).planned_vs_executed.status, "unknown");
  assert.equal(assessment({ ...plan, status: "skipped" }, null).planned_vs_executed.status, "missed");
  assert.equal(comparePlannedVsExecuted({ planned: { ...plan, session_type: "rest" } }).status, "no_session_planned");
  assert.equal(comparePlannedVsExecuted({ executed: execution }).executed_id, execution.id);
});
test("date/title coincidence cannot link; exact cross-day link wins; duplicate linkage stays unknown", () => {
  const unlinked = { ...plan, linked_completed_session_id: null, title: execution.title };
  const result = compareTrainingDay({ plans: [unlinked], executions: [execution], assessments: [assessment(unlinked)] });
  assert.equal(result.status, "unknown"); assert.equal(result.comparisons[0].executed_id, null);
  const cross = { ...plan, planned_date: "2026-10-04" };
  assert.equal(assessment(cross).planned_vs_executed.identity_match, "exact_persisted_link");
  const shared = compareTrainingDay({ plans: [plan, { ...plan, id: toolId(3) }], executions: [execution], assessments: [assessment()] });
  assert.equal(shared.status, "unknown"); assert.equal(shared.comparisons[0].executed_id, null);
  assert.equal(compareTrainingDay({ plans: [plan], assessments: [assessment()], hasMore: true }).status, "unknown");
});
async function operating(state, options = {}) {
  const runtime = await createEnqiduToolRuntime({ db: state.db, now: TOOL_NOW, ...options });
  const result = await runtime.execute("get_daily_coach_operating_brief");
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return { result, runtime };
}
test("closed daily read uses canonical policy, no auto apply, owner scope and read-only MCP", async () => {
  const fixture = createToolsDb(); const before = structuredClone(fixture.tables);
  const { result, runtime } = await operating(fixture, { source: "mcp", recordEvent: () => assert.fail("MCP must not record") });
  assert.equal(result.data.decision, "KEEP"); assert.equal(result.data.morning.review_action, null);
  assert.equal(result.data.applied, false); assert.equal(result.data.llm_used, false); assert.equal(result.data.usage, null);
  assert.equal((await runtime.execute("apply_adapt_duration", {})).error.code, "mcp_writes_disabled");
  assert.equal((await runtime.execute("get_daily_coach_operating_brief", { user_id: TOOL_USER_B })).error.code, "invalid_arguments");
  assert.doesNotMatch(JSON.stringify(result), /FOREIGN_SECRET|RAW_SECRET|raw_payload/);
  assert.deepEqual(fixture.tables, before);
});
test("Madrid midnight and DST use profile calendar, not host/browser timezone", async () => {
  for (const [now, expected] of [["2026-10-05T21:59:59Z", date], ["2026-10-05T22:00:00Z", "2026-10-06"], ["2026-10-25T22:59:59Z", "2026-10-25"], ["2026-10-25T23:00:00Z", "2026-10-26"]]) {
    const { result } = await operating(createToolsDb({ empty: true }), { now });
    assert.equal(result.data.date, expected); assert.equal(result.data.timezone, "Europe/Madrid");
    assert.equal(result.data.trend.points.at(-1).date, expected);
  }
});
test("REDUCE preview never changes plan; partial/stale/missing require review; rest is not reduced", async () => {
  const fixture = createToolsDb();
  fixture.tables.wearable_sleep_sessions.at(-1).total_duration_seconds = 0;
  const { result, runtime } = await operating(fixture);
  assert.equal(result.data.decision, "REDUCE"); const before = structuredClone(fixture.tables);
  const action = result.data.morning.review_action;
  assert.equal((await runtime.execute(action.tool, action.arguments)).ok, true);
  assert.deepEqual(fixture.tables, before);
  fixture.tables.planned_training_sessions.find((p) => p.planned_date === date).session_type = "rest";
  const rest = (await operating(fixture)).result.data;
  assert.equal(rest.decision, "KEEP"); assert.equal(rest.morning.review_action, null);
  for (const key of Object.keys(fixture.tables).filter((k) => k.startsWith("wearable_"))) fixture.tables[key] = [];
  fixture.tables.planned_training_sessions.find((p) => p.planned_date === date).session_type = "strength";
  const missing = (await operating(fixture)).result.data;
  assert.equal(missing.decision, "REVIEW_REQUIRED"); assert.equal(missing.health_today.state, "missing");
});
test("RECOVERY_BIAS is reused from exact Closed Loop and remains a review-only action", () => {
  const today = { sessions: [{ ...plan, linked_completed_session_id: null }], availability: [] };
  const closed = assessment(); closed.adaptation_proposal = { action: "recovery_bias", reasons: ["multiple_subsequent_personal_baseline_signals"], applied: false, requires_explicit_action: true, affected_future_sessions: [{ id: plan.id, planned_date: date }] };
  const result = buildMorningCoachBrief({ date, timezone: "Europe/Madrid", today, health: null, yesterday: { has_more: false }, closedLoop: [closed] });
  assert.equal(result.recommendation, "RECOVERY_BIAS"); assert.equal(result.review_action.tool, "preview_closed_loop_proposal"); assert.equal(result.applied, false);
});
test("history records only structured server results, deduplicates deterministically and never invents rejected/applied", async () => {
  const events = [];
  const { result, runtime } = await operating(createToolsDb(), { recordEvent: (event) => events.push(event) });
  await runtime.execute("get_daily_coach_operating_brief");
  assert.equal(events[0].event_key, events[1].event_key);
  assert.equal(events[0].user_id, TOOL_USER_A);
  assert.equal(await historyKey({ b: 2, a: 1 }), await historyKey({ a: 1, b: 2 }));
  const proposed = { ...events[0], proposal_key: "p", proposal: { tool: "preview_adapt_duration", arguments: { source_date: date, duration_minutes: 40 } } };
  const previewed = { ...proposed, event_type: "previewed", fingerprint: "sha256:test", expires_at: TOOL_NOW };
  let history = projectDailyHistory([proposed, previewed], TOOL_NOW);
  assert.equal(history.entries[0].proposal_status, "previewed"); assert.equal(history.entries[0].preview_expired, true);
  history = projectDailyHistory([proposed, previewed, { ...previewed, event_type: "applied" }], TOOL_NOW);
  assert.equal(history.entries[0].proposal_status, "applied"); assert.equal(history.entries[0].preview_expired, false);
  assert.equal((await operating(createToolsDb(), { recordEvent: () => { throw new Error("database offline"); } })).result.warnings[0], "daily_coach_history_not_recorded");
  assert.equal(await dailyCoachEvent("get_today_plan", {}, {}, {}), null);
});
test("actual SQL migration isolates tenants and denies all client writes, including TRUNCATE; backend is append-only", async () => {
  const db = await openHealthDb();
  try {
    await db.exec(await readFile(new URL("../supabase/migrations/20261014044007_daily_coach_events.sql", import.meta.url), "utf8"));
    for (const user of [HEALTH_USER_A, HEALTH_USER_B]) await db.query("insert into daily_coach_events(user_id,calendar_date,timezone,occurred_at,event_key,event_type,decision) values ($1,'2026-10-05','Europe/Madrid',now(),repeat('a',64),'decision','KEEP')", [user]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [HEALTH_USER_A]); await db.exec("set role authenticated");
    assert.deepEqual((await db.query("select user_id from daily_coach_events")).rows.map((r) => r.user_id), [HEALTH_USER_A]);
    await assert.rejects(db.exec("delete from daily_coach_events"), /permission denied/);
    await assert.rejects(db.exec("truncate daily_coach_events"), /permission denied/);
    await db.exec("reset role");
    for (const role of ["anon", "authenticated", "service_role"]) for (const privilege of ["UPDATE", "DELETE", "TRUNCATE", "TRIGGER", "REFERENCES"]) {
      assert.equal((await db.query("select has_table_privilege($1,'daily_coach_events',$2) as allowed", [role, privilege])).rows[0].allowed, false);
    }
    for (const role of ["anon", "authenticated"]) assert.equal((await db.query("select has_table_privilege($1,'daily_coach_events','INSERT') as allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query("select has_table_privilege('service_role','daily_coach_events','INSERT') as allowed")).rows[0].allowed, true);
  } finally { await db.close(); }
});

test("Daily read retains partial/stale states and current metric dates; history truncation is explicit", async () => {
  for (const mode of ["partial", "stale"]) {
    const f = createToolsDb();
    for (const key of Object.keys(f.tables).filter((k) => k.startsWith("wearable_"))) {
      f.tables[key] = mode === "stale" ? f.tables[key].filter((r) => r.calendar_date && r.calendar_date < date)
        : key === "wearable_sleep_sessions" ? f.tables[key].map((r) => ({ ...r, hrv_last_night_avg_ms: null })) : [];
    }
    const { result } = await operating(f);
    assert.equal(result.data.health_today.state, mode);
    assert.equal(result.data.decision, "REVIEW_REQUIRED");
    assert.equal(result.data.morning.review_action, null);
    if (mode === "stale") assert.equal(result.data.trend.points.at(-1).sleep_seconds, null);
  }
  const rows = Array.from({ length: 15 }, () => ({ event_type: "decision", calendar_date: date, occurred_at: TOOL_NOW, decision: "KEEP", reasons: [], proposal: null, evidence: {} }));
  assert.equal(projectDailyHistory(rows, TOOL_NOW).has_more, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { loadHome } from "../src/home/loadHome.js";
const brief = {
  date: "2026-10-15",
  timezone: "Europe/Madrid",
  readiness_score: 0,
  morning: { today_plan: { sessions: [] } },
};
const week = {
  calendar_date: brief.date,
  timezone: brief.timezone,
  weekly_dashboard: { activity: { sessions: 8, seconds: 27687 }, planning: {
    planned_count: 3,
    completed_linked_count: 1,
    upcoming_count: 1,
    past_unlinked_count: 1,
  } },
};
const request = ({ tool }) => ({
  ok: true,
  data: tool === "get_progress_performance_v1" ? week : brief,
});
test("Home coordinates exactly two existing reads, no identity/client clock or writers", async () => {
  const calls = [];
  const result = await loadHome((a) => {
    calls.push(a);
    return request(a);
  });
  assert.deepEqual(calls, [
    { tool: "get_daily_coach_operating_brief", arguments: {} },
    { tool: "get_progress_performance_v1", arguments: { period: "week" } },
  ]);
  assert.equal(result.status, "available");
  assert.equal(result.brief, brief);
  assert.equal(result.week, week.weekly_dashboard);
  assert.equal(result.brief.readiness_score, 0);
  assert.deepEqual(result.week.activity, week.weekly_dashboard.activity);
});
test("week failure preserves daily brief as partial without manufacturing progress", async () => {
  const result = await loadHome((a) =>
    a.tool === "get_progress_performance_v1"
      ? Promise.reject(Error("private error"))
      : request(a),
  );
  assert.equal(result.status, "partial");
  assert.equal(result.brief, brief);
  assert.equal(result.week, null);
});
test("brief failure is explicit and preserves independently available weekly progress", async () => {
  const result = await loadHome((a) =>
    a.tool === "get_progress_performance_v1" ? request(a) : { ok: false },
  );
  assert.equal(result.status, "error");
  assert.equal(result.brief, null);
  assert.equal(result.week, week.weekly_dashboard);
});
test("hanging requests terminate in an error, never an infinite skeleton", async () => {
  const result = await loadHome(() => new Promise(() => {}), { timeoutMs: 10 });
  assert.equal(result.status, "error");
});
test("do not mix dates or profile timezones across coordinated reads", async () => {
  for (const override of [
    { calendar_date: "2026-10-16" },
    { timezone: "America/Los_Angeles" },
  ]) {
    const result = await loadHome((a) =>
      a.tool === "get_progress_performance_v1"
        ? { ok: true, data: { ...week, ...override } }
        : request(a),
    );
    assert.equal(result.status, "partial");
    assert.equal(result.week, null);
  }
});
test("a timed-out week cannot mutate a completed snapshot when it eventually arrives", async () => {
  let resolve;
  const result = await loadHome(
    (a) =>
      a.tool === "get_progress_performance_v1"
        ? new Promise((r) => (resolve = r))
        : request(a),
    { timeoutMs: 10 },
  );
  resolve({ ok: true, data: week });
  await Promise.resolve();
  assert.equal(result.status, "partial");
  assert.equal(result.week, null);
});

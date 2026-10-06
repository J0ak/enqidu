import { test, expect } from "@playwright/test";
import { createEnqiduToolRuntime } from "../src/enqiduTools/runtime.js";
import { listEnqiduTools } from "../src/enqiduTools/registry.js";
import { connectEnqiduMcp } from "../tests/support/enqiduMcp.mjs";
import { createToolsFixture, TOOLS_SECRET_MARKER } from "./tools-fixture.js";

const domainValue = (value) => {
  if (Array.isArray(value)) return value.map(domainValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "generated_at").map(([key, item]) => [key, domainValue(item)]));
  return value;
};
const acceptance = (preview, args) => ({ ...args, fingerprint: preview.fingerprint, expires_at: preview.expires_at, confirmation: true });
const persistedHistory = ({ executions, fit, sources, metrics, executionBlocks, exercises }) => ({ executions, fit, sources, metrics, executionBlocks, exercises });
const successful = (result) => { expect(result, result.error?.safe_message).toMatchObject({ ok: true, timezone: "Europe/Madrid" }); expect(JSON.stringify(result)).not.toContain(TOOLS_SECRET_MARKER); return result.data; };

test("local Auth → canonical Health/baseline → Closed Loop → preview → explicit apply → exact App/Coach/MCP domain", async ({ request }) => {
  test.setTimeout(120000);
  const fixture = await createToolsFixture("vertical");
  const { db, adminDb, now, identities, date } = fixture;
  const app = await createEnqiduToolRuntime({ db, adminDb, now, source: "app" });
  const coach = await createEnqiduToolRuntime({ db, adminDb, now, source: "coach" });
  const mcp = await connectEnqiduMcp({ db, now });
  try {
    const before = await fixture.snapshot();
    const toolList = await mcp.client.listTools();
    expect(toolList.tools.map((tool) => tool.name).sort()).toEqual(listEnqiduTools({ includeWrites: false }).map((tool) => tool.id).sort());
    const argsFor = (tool) => ["get_training_session", "get_closed_loop_assessment", "get_adaptation_proposal"].includes(tool) ? { session_id: identities.execution.id } : {};
    for (const definition of listEnqiduTools().filter((tool) => tool.access === "read")) {
      const args = argsFor(definition.id);
      const appResult = await app.execute(definition.id, args);
      const coachResult = await coach.execute(definition.id, args);
      const mcpResult = (await mcp.client.callTool({ name: definition.id, arguments: args })).structuredContent;
      const data = successful(appResult);
      expect(successful(coachResult)).toEqual(data);
      expect(successful(mcpResult)).toEqual(data);
      expect(appResult.calendar_date).toBe(date());
      if (definition.id === "get_today_plan") expect(data.sessions.map((session) => session.id)).toEqual([identities.todayPlan.id]);
      if (definition.id === "get_health_status") expect(data).toMatchObject({ schema_version: "health_recovery_v1", hrv: { last_night_avg_ms: 42 }, sleep: { duration_seconds: 25200 } });
      if (definition.id === "get_readiness") expect(data).toMatchObject({ schema_version: "readiness_v1", status: "available", score: expect.any(Number) });
      if (definition.id === "get_closed_loop_assessment") expect(data.assessments[0]).toMatchObject({ identity_match: "exact_persisted_link", executed_session: { id: identities.execution.id }, user_feedback: { rpe: 9 }, adaptation_proposal: { action: "reduce", applied: false, requires_explicit_action: true } });
    }
    const proposalArgs = { session_id: identities.execution.id };
    const preview = successful(await app.execute("preview_closed_loop_proposal", proposalArgs));
    expect(preview).toMatchObject({ schema_version: "enqidu_action_preview_v1", requires_confirmation: true, before: [{ id: identities.futurePlan.id, date: date(1), duration_minutes: 50 }], after: [{ id: identities.futurePlan.id, date: date(1), duration_minutes: 40 }] });
    expect(successful(await coach.execute("preview_closed_loop_proposal", proposalArgs))).toEqual(preview);
    expect(successful((await mcp.client.callTool({ name: "preview_closed_loop_proposal", arguments: proposalArgs })).structuredContent)).toEqual(preview);
    expect(successful(await app.execute("preview_closed_loop_proposal", proposalArgs))).toEqual(preview);
    expect(await fixture.snapshot()).toEqual(before);
    const remoteApply = await mcp.client.callTool({ name: "apply_closed_loop_proposal", arguments: acceptance(preview, proposalArgs) });
    expect(remoteApply.structuredContent).toMatchObject({ ok: false, error: { code: "mcp_writes_disabled" } });
    expect(await fixture.snapshot()).toEqual(before);
    const applied = successful(await app.execute("apply_closed_loop_proposal", acceptance(preview, proposalArgs)));
    expect(applied).toMatchObject({ adapted: true, persistence_verified: true, planned_session: { duration_minutes: 40 } });
    const after = await fixture.snapshot();
    expect(persistedHistory(after)).toEqual(persistedHistory(before));
    expect(after.plans.find((plan) => plan.id === identities.futurePlan.id)).toMatchObject({ planned_duration_min: 40, planned_duration_max: 40 });
    expect(after.blocks.find((block) => block.planned_session_id === identities.futurePlan.id).planned_duration_seconds).toBe(2400);
    expect(after.plans.filter((plan) => plan.id !== identities.futurePlan.id)).toEqual(before.plans.filter((plan) => plan.id !== identities.futurePlan.id));
    expect(successful(await app.execute("get_week_plan"))).toEqual(applied.persisted_plan);
    expect(successful((await mcp.client.callTool({ name: "get_week_plan", arguments: {} })).structuredContent)).toEqual(applied.persisted_plan);

    // Exercise the actual JWT Edge boundaries in addition to the in-process domain.
    const httpResponse = await request.post(`${fixture.url}/functions/v1/enqidu-tools`, { headers: fixture.headers, data: { tool: "get_today_plan", arguments: {} } });
    expect(httpResponse.ok()).toBe(true);
    const httpTool = await httpResponse.json();
    expect(domainValue(successful(httpTool))).toEqual(domainValue(successful(await app.execute("get_today_plan"))));
    const replyResponse = await request.post(`${fixture.url}/functions/v1/coach-reply`, { headers: fixture.headers, data: { message: "¿Qué entreno hoy?" } });
    expect(replyResponse.ok()).toBe(true);
    const reply = await replyResponse.json();
    expect(reply).toMatchObject({ ok: true, response_mode: "deterministic", llm_used: false, usage: null, calendar_timezone: "Europe/Madrid" });
    expect(reply.answer).toContain(identities.todayPlan.title);
    expect(JSON.stringify(reply)).not.toContain(TOOLS_SECRET_MARKER);
  } finally { await mcp.close(); await fixture.dispose(); }
});

test("real JWT/RLS isolates every read family, preview and apply; intervening state fails closed", async () => {
  test.setTimeout(120000);
  const owner = await createToolsFixture("owner");
  const stranger = await createToolsFixture("stranger", { health: false, plans: false });
  const ownerRuntime = await createEnqiduToolRuntime({ db: owner.db, adminDb: owner.adminDb, now: owner.now });
  const strangerRuntime = await createEnqiduToolRuntime({ db: stranger.db, adminDb: stranger.adminDb, now: owner.now });
  try {
    const initial = await owner.snapshot();
    expect(successful(await strangerRuntime.execute("get_today_plan")).sessions).toEqual([]);
    expect(successful(await strangerRuntime.execute("get_week_plan")).sessions).toEqual([]);
    expect(successful(await strangerRuntime.execute("get_recent_training")).sessions).toEqual([]);
    expect(successful(await strangerRuntime.execute("get_health_status")).status).toBe("unavailable");
    expect(successful(await strangerRuntime.execute("get_readiness")).status).toBe("unavailable");
    for (const tool of ["get_training_session", "get_closed_loop_assessment", "get_adaptation_proposal", "preview_closed_loop_proposal"]) {
      const result = await strangerRuntime.execute(tool, { session_id: owner.identities.execution.id });
      expect(result).toMatchObject({ ok: false, error: { code: "session_not_found" } });
      expect(JSON.stringify(result)).not.toContain(owner.identities.execution.title);
    }
    for (const tool of ["get_today_plan", "get_health_status", "get_closed_loop_assessment"]) expect(await strangerRuntime.execute(tool, { user_id: owner.user.id })).toMatchObject({ ok: false, error: { code: "invalid_arguments" } });
    const args = { source_date: owner.date(1), duration_minutes: 30 };
    const preview = successful(await ownerRuntime.execute("preview_adapt_duration", args));
    expect((await strangerRuntime.execute("preview_adapt_duration", args)).ok).toBe(false);
    expect((await strangerRuntime.execute("apply_adapt_duration", acceptance(preview, args))).ok).toBe(false);
    expect(await ownerRuntime.execute("apply_adapt_duration", { ...acceptance(preview, args), confirmation: false })).toMatchObject({ ok: false, error: { code: "explicit_confirmation_required" } });
    const directWrite = await owner.db.from("planned_training_sessions").update({ planned_duration_min: 10 }).eq("id", owner.identities.futurePlan.id);
    expect(directWrite.error).not.toBeNull();
    expect(await owner.snapshot()).toEqual(initial);
    // A genuine competing local write, after preview and before acceptance.
    const changed = await owner.adminDb.from("planned_training_sessions").update({ planned_duration_min: 45, planned_duration_max: 45 }).eq("id", owner.identities.futurePlan.id);
    expect(changed.error).toBeNull();
    const changedSnapshot = await owner.snapshot();
    expect(await ownerRuntime.execute("apply_adapt_duration", acceptance(preview, args))).toMatchObject({ ok: false, error: { code: "preview_stale" } });
    expect(await owner.snapshot()).toEqual(changedSnapshot);
    expect(persistedHistory(changedSnapshot)).toEqual(persistedHistory(initial));
  } finally { await stranger.dispose(); await owner.dispose(); }
});

test("profile Madrid calendar survives caller timezone, UTC midnight, and both DST transitions with actual Auth", async () => {
  const fixture = await createToolsFixture("timezone", { health: false, plans: false });
  const cases = [
    ["2026-03-28T23:30:00Z", "2026-03-29"], ["2026-03-29T22:30:00Z", "2026-03-30"],
    ["2026-10-24T22:30:00Z", "2026-10-25"], ["2026-10-25T23:30:00Z", "2026-10-26"],
    ["2026-06-30T22:00:00Z", "2026-07-01"], ["2026-07-01T00:00:00Z", "2026-07-01"],
  ];
  try {
    for (const [at, expectedDate] of cases) {
      const now = new Date(at);
      const app = await createEnqiduToolRuntime({ db: fixture.db, now, source: "app" });
      const mcp = await connectEnqiduMcp({ db: fixture.db, now });
      try {
        const result = await app.execute("get_today_plan");
        expect(result.calendar_date).toBe(expectedDate);
        expect(result.timezone).toBe("Europe/Madrid");
        expect(successful((await mcp.client.callTool({ name: "get_today_plan", arguments: {} })).structuredContent)).toEqual(successful(result));
        expect(await app.execute("get_today_plan", { timezone: "America/Los_Angeles", date: "2000-01-01" })).toMatchObject({ ok: false, error: { code: "invalid_arguments" } });
      } finally { await mcp.close(); }
    }
  } finally { await fixture.dispose(); }
});

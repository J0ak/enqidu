import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FitnessAiGarminSource } from "../src/health/fitnessAiGarminSource.js";
import { ingestGarminDaily, dailyWindow } from "../supabase/functions/_shared/garminDailyIngestion.js";
import { createGarminDailySyncHandler } from "../supabase/functions/_shared/garminDailySyncHandler.js";
import { openHealthDb, createHealthServiceClient, HEALTH_USER_A } from "./support/healthFoundationDb.mjs";
import { healthCalendarUtcBounds } from "../src/health/healthEvidence.js";
const timezone = "Europe/Madrid", now = "2026-10-05T06:00:00Z";
const identity = { id: HEALTH_USER_A };
const dto = (patch = {}) => ({ provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector", data_type: "sleep", calendar_date: "2026-10-05", timezone, retrieved_at: now, measurements: { sleep_score: { value: 80, unit: "score" } }, ...patch });
const source = (records) => ({ getHealthRecords: async () => ({ records, next_cursor: null }) });
const config = (records, patch = {}) => ({ authenticatedUser: identity, timezone, now, days: 1, source: source(records), db: { rpc: async () => ({ data: { status: "inserted" } }) }, sleep: async () => {}, ...patch });

test("real RPC: live shape, duplicate, newer retrieval, correction, stale and partial families", async () => {
  const db = await openHealthDb();
  try {
    const payload = JSON.parse(await readFile(new URL("./fixtures/fitness-ai-garmin/live-shape.json", import.meta.url)));
    let retrieved = "2026-10-04T10:00:00Z";
    const live = new FitnessAiGarminSource({ clock: () => new Date(retrieved), transport: { getHealthSummary: async (request) => request.from_date === "2026-10-04" ? structuredClone(payload) : { data_status: "no_data" } } });
    const args = { db: createHealthServiceClient(db), authenticatedUser: identity, source: live, timezone, now };
    const first = await ingestGarminDaily(args);
    assert.equal(first.inserted, 8); assert.equal(first.failed, 0);
    assert.equal(first.family_results.filter((x) => x.date === "2026-10-05" && x.status === "no_data").length, 8);
    assert.equal((await ingestGarminDaily(args)).unchanged, 8);
    retrieved = "2026-10-04T11:00:00Z";
    assert.equal((await ingestGarminDaily(args)).unchanged, 8);
    payload.data.daily.steps = 0;
    retrieved = "2026-10-04T12:00:00Z";
    assert.equal((await ingestGarminDaily(args)).updated, 1);
    payload.data.daily.steps = 77; retrieved = "2026-10-04T09:00:00Z";
    assert.ok((await ingestGarminDaily(args)).ignored_stale >= 1);
    assert.equal((await db.query("select steps from wearable_health_daily")).rows[0].steps, 0);
    const before = (await db.query("select count(*)::int as n from wearable_health_imports")).rows[0].n;
    const partial = await ingestGarminDaily(config([dto({ calendar_date: "2026-10-04", retrieved_at: "2026-10-04T13:00:00Z" })], { db: createHealthServiceClient(db), now: "2026-10-04T14:00:00Z" }));
    assert.equal(partial.updated, 1);
    assert.equal((await db.query("select count(*)::int as n from wearable_health_imports")).rows[0].n, before);
    assert.equal((await db.query("select steps from wearable_health_daily")).rows[0].steps, 0);
  } finally { await db.close(); }
});

test("validation/provenance failures are isolated, safe and never retried", async () => {
  let calls = 0;
  const records = [dto(), dto({ provider_mode: "official_api", ingestion_channel: "garmin_health_api" }), dto({ measurements: { sleep_score: { value: -1, unit: "score" } } }), dto({ raw: { token: "SECRET_TOKEN" } })];
  const events = [];
  const result = await ingestGarminDaily(config(records, { db: { rpc: async (name, args) => { calls++; assert.equal(name, "ingest_garmin_health_record"); assert.equal(args.p_user_id, HEALTH_USER_A); return { data: { status: "inserted" } }; } }, observe: (event) => events.push(event) }));
  assert.equal(calls, 1); assert.equal(result.failed, 3); assert.equal(result.inserted, 1);
  assert.doesNotMatch(JSON.stringify([result, events]), /SECRET_TOKEN|sleep_score|measurements|11111111/);
});

test("transient connector and RPC retry bounded; auth and unknown errors fail closed", async () => {
  for (const status of [503, 401]) {
    let calls = 0;
    const result = await ingestGarminDaily(config([], { source: { getHealthRecords: async () => { calls++; throw Object.assign(new Error("SQL AUTH_TOKEN"), { status }); } } }));
    assert.equal(calls, status === 503 ? 3 : 1); assert.equal(result.failed, 1);
    assert.doesNotMatch(JSON.stringify(result), /SQL|AUTH_TOKEN/);
  }
  let calls = 0;
  const result = await ingestGarminDaily(config([dto()], { db: { rpc: async () => ++calls < 3 ? { error: { code: "40001", message: "SQL" } } : { data: { status: "unchanged" } } } }));
  assert.equal(calls, 3); assert.equal(result.unchanged, 1);
});

test("pagination, record, day and browser boundaries are bounded", async () => {
  let calls = 0;
  const result = await ingestGarminDaily(config([], { source: { getHealthRecords: async () => { calls++; return { records: [], next_cursor: "same" }; } } }));
  assert.equal(calls, 2); assert.ok(result.warnings.includes("source_limit"));
  assert.equal((await ingestGarminDaily(config([dto({ calendar_date: "2026-10-04" })]))).failed, 1);
  assert.throws(() => dailyWindow({ timezone, now, days: 8 }));
  assert.throws(() => dailyWindow({ now }));
  const prior = process.env.TZ; process.env.TZ = "America/Los_Angeles";
  try {
    for (const [instant, date] of [["2026-10-04T21:59:59Z", "2026-10-04"], ["2026-10-04T22:00:00Z", "2026-10-05"], ["2026-10-05T00:00:00Z", "2026-10-05"], ["2026-10-04T15:00:00-07:00", "2026-10-05"], ["2026-03-28T23:00:00Z", "2026-03-29"], ["2026-10-24T22:00:00Z", "2026-10-25"]]) assert.equal(dailyWindow({ timezone, now: instant }).to, date);
    for (const [date, hours] of [["2026-03-29", 23], ["2026-10-25", 25]]) { const b = healthCalendarUtcBounds(date, timezone); assert.equal((Date.parse(b.end_utc) - Date.parse(b.start_utc)) / 3600000, hours); }
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

test("HTTP rejects cross-user/RPC/table/transport injection before any privileged client exists", async () => {
  let admin = 0;
  const handler = createGarminDailySyncHandler({ createReadDb: () => ({ auth: { getUser: async () => ({ data: { user: identity } }) } }), createServiceDb: () => { admin++; throw new Error("unexpected"); } });
  const request = (body, auth = true) => new Request("http://localhost/sync", { method: "POST", headers: auth ? { Authorization: "Bearer TEST" } : {}, body: JSON.stringify(body) });
  assert.equal((await handler(request({}, false))).status, 401);
  for (const body of [{ user_id: "another" }, { rpc: "evil" }, { table: "wearable_health_daily" }, { timezone: "UTC" }, { transport: "https://evil" }]) assert.equal((await handler(request(body))).status, 400);
  const disabled = await handler(request({})); assert.equal(disabled.status, 503); assert.equal((await disabled.json()).error, "connector_runtime_unavailable"); assert.equal(admin, 0);
});


test("prototype names and source identity injection cannot select a writer or pollute family accounting", async () => {
  const report = await ingestGarminDaily(config([dto({ data_type: "__proto__" }), dto({ user_id: "other-user" }), dto({ rpc: "evil" }), dto()]));
  assert.equal(report.failed, 3); assert.equal(report.inserted, 1);
  assert.equal(Object.prototype.status, undefined); assert.equal(Object.prototype.failed, undefined);
});


test("Supabase response-level HTTP status survives the persistence boundary for bounded retry", async () => {
  let calls = 0;
  const result = await ingestGarminDaily(config([dto()], { db: { rpc: async () => ++calls === 1
    ? { status: 503, error: { code: "", message: "private proxy detail" }, data: null }
    : { status: 200, data: { status: "inserted" }, error: null } } }));
  assert.equal(calls, 2); assert.equal(result.inserted, 1); assert.equal(result.failed, 0);
  assert.equal(result.retry_count, 1); assert.ok(result.warnings.includes("transient_retry"));
  assert.doesNotMatch(JSON.stringify(result), /private proxy detail/);
});

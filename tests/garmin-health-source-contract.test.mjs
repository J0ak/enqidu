import assert from "node:assert/strict";
import test from "node:test";
import { GarminSource } from "../src/health/garminSource.js";
import { getGarminHealthNaturalKey } from "../src/health/garminAdapter.js";
import { ingestGarminHealthPage } from "../supabase/functions/_shared/ingestGarminHealthPage.js";
import { openHealthDb, createHealthServiceClient, HEALTH_USER_B } from "./support/healthFoundationDb.mjs";

const authenticatedUser = { id: "11111111-1111-4111-8111-111111111111" };
const request = { from_date: "2026-10-03", to_date: "2026-10-04", timezone: "Europe/Madrid" };
const daily = (overrides = {}) => ({
  data_type: "daily_health", provider: "garmin", provider_mode: "aggregator",
  ingestion_channel: "fitness_ai_connector", calendar_date: "2026-10-04",
  timezone: "Europe/Madrid", retrieved_at: "2026-10-04T12:00:00Z",
  source_identifier: "provider-day-1", measurements: { distance_m: { value: 3, unit: "km" } },
  raw: { additional_vendor_field: { still_preserved: true } }, ...overrides,
});

class FixtureSource extends GarminSource {
  constructor(page) { super(); this.page = page; this.requests = []; }
  async getHealthRecords(value) { this.requests.push(value); return this.page; }
}

function recordingDb() {
  const calls = [];
  return { calls, async rpc(name, args) {
    calls.push({ name, args });
    return { data: { status: "inserted", health_import_id: "safe-record-id" }, error: null };
  } };
}

test("source contract: a validated page flows through normalization and the sole server RPC", async () => {
  const source = new FixtureSource({ records: [daily({ user_id: "untrusted-provider-owner" })], next_cursor: "opaque/page-2" });
  const db = recordingDb();
  const result = await ingestGarminHealthPage({ db, authenticatedUser, source, request });
  assert.deepEqual(source.requests, [{ ...request, cursor: null }]);
  assert.equal(result.processed_count, 1);
  assert.equal(result.next_cursor, "opaque/page-2");
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].name, "ingest_garmin_health_record");
  assert.equal(db.calls[0].args.p_user_id, authenticatedUser.id);
  const record = db.calls[0].args.p_record;
  assert.equal(record.metrics.distance_m, 3000);
  assert.equal(record.metrics.resting_heart_rate_bpm, null);
  assert.equal(record.observed_at, null);
  assert.equal(record.provenance.ingestion_channel, "fitness_ai_connector");
  assert.equal(record.evidence.source_dto.user_id, "untrusted-provider-owner");
  assert.deepEqual(record.evidence.raw, { additional_vendor_field: { still_preserved: true } });
  assert.equal(Object.hasOwn(result, "raw"), false);
});

test("source contract: provisional and official transports share metrics, domain and canonical identity", async () => {
  const db = recordingDb();
  for (const sourceRecord of [daily(), daily({
    provider_mode: "official_api", ingestion_channel: "garmin_health_api", source_identifier: "different-official-id",
  })]) {
    await ingestGarminHealthPage({ db, authenticatedUser,
      source: new FixtureSource({ records: [sourceRecord], next_cursor: null }), request });
  }
  const [provisional, official] = db.calls.map(({ args }) => args.p_record);
  assert.equal(provisional.schema_version, official.schema_version);
  assert.deepEqual(provisional.metrics, official.metrics);
  assert.equal(getGarminHealthNaturalKey(authenticatedUser.id, provisional),
    getGarminHealthNaturalKey(authenticatedUser.id, official));
  assert.notEqual(provisional.provenance.ingestion_channel, official.provenance.ingestion_channel);
});

test("source contract: an invalid later DTO prevents every write in the page", async () => {
  const db = recordingDb();
  await assert.rejects(ingestGarminHealthPage({ db, authenticatedUser, request,
    source: new FixtureSource({ records: [daily(), daily({ provider: "fitness_ai" })], next_cursor: "must-not-advance" }),
  }), /provider/);
  assert.equal(db.calls.length, 0);
});

test("source contract: identity, request and page bounds fail before persistence", async () => {
  const db = recordingDb();
  const source = new FixtureSource({ records: [], next_cursor: null });
  await assert.rejects(ingestGarminHealthPage({ db, authenticatedUser: null, source, request }), /identity/);
  await assert.rejects(ingestGarminHealthPage({ db, authenticatedUser, source, request: { ...request, timezone: null } }), /timezone/);
  assert.equal(source.requests.length, 0);
  await assert.rejects(ingestGarminHealthPage({ db, authenticatedUser, request,
    source: new FixtureSource({ records: Array.from({ length: 101 }, () => daily()), next_cursor: null }),
  }), /100/);
  await assert.rejects(ingestGarminHealthPage({ db, authenticatedUser, request,
    source: new FixtureSource({ records: [], next_cursor: undefined }),
  }), /next_cursor/);
  await assert.rejects(ingestGarminHealthPage({ db, authenticatedUser, request,
    source: new FixtureSource({ records: [daily({ calendar_date: "2026-10-02" })], next_cursor: null }),
  }), /requested range/);
  assert.equal(db.calls.length, 0);
});

test("source contract: a failed write prevents cursor advance and later writes", async () => {
  let calls = 0;
  const db = { async rpc() {
    calls++;
    return calls === 1 ? { data: { status: "inserted" }, error: null }
      : { data: null, error: { message: "temporary database failure" } };
  } };
  const records = [daily(), daily({ calendar_date: "2026-10-03" }), daily()];
  await assert.rejects(ingestGarminHealthPage({ db, authenticatedUser, request,
    source: new FixtureSource({ records, next_cursor: "must-not-advance" }),
  }), /temporary database failure/);
  assert.equal(calls, 2);
});

test("source contract: browser execution is rejected before source access", async () => {
  const oldWindow = globalThis.window;
  const source = new FixtureSource({ records: [], next_cursor: null });
  try {
    globalThis.window = {};
    await assert.rejects(ingestGarminHealthPage({ db: recordingDb(), authenticatedUser, source, request }), /server runtime/);
    assert.equal(source.requests.length, 0);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test("source → SQL: retry after partial page failure, correction and official source produce zero duplicate canonical rows", async () => {
  const pg = await openHealthDb();
  try {
    const actualDb = createHealthServiceClient(pg);
    let attempts = 0;
    const temporaryFailureDb = { async rpc(...args) {
      if (++attempts === 2) return { data: null, error: { message: "transient failure" } };
      return actualDb.rpc(...args);
    } };
    const records = [daily({ calendar_date: "2026-10-03" }), daily()];
    const source = new FixtureSource({ records, next_cursor: "next-page" });
    await assert.rejects(ingestGarminHealthPage({ db: temporaryFailureDb, authenticatedUser, request, source }), /transient failure/);
    const retry = await ingestGarminHealthPage({ db: actualDb, authenticatedUser, request, source });
    assert.deepEqual(retry.results.map((item) => item.status), ["unchanged", "inserted"]);
    assert.equal(retry.next_cursor, "next-page");

    const retrievedAgain = records.map((record) => ({ ...record, retrieved_at: "2026-10-04T13:00:00Z" }));
    await ingestGarminHealthPage({ db: actualDb, authenticatedUser, request,
      source: new FixtureSource({ records: retrievedAgain, next_cursor: null }) });
    assert.equal((await pg.query("select count(*)::int as n from wearable_provider_raw_payloads")).rows[0].n, 2);

    const corrected = daily({ retrieved_at: "2026-10-04T14:00:00Z",
      measurements: { distance_m: { value: 4, unit: "km" }, steps: { value: 7000, unit: "count" } } });
    const correction = await ingestGarminHealthPage({ db: actualDb, authenticatedUser, request,
      source: new FixtureSource({ records: [corrected], next_cursor: null }) });
    assert.equal(correction.results[0].health_import_id, retry.results[1].health_import_id);
    const official = { ...corrected, retrieved_at: "2026-10-04T15:00:00Z",
      provider_mode: "official_api", ingestion_channel: "garmin_health_api", source_identifier: "official-different-id" };
    const switched = await ingestGarminHealthPage({ db: actualDb, authenticatedUser, request,
      source: new FixtureSource({ records: [official], next_cursor: null }) });
    assert.equal(switched.results[0].health_import_id, retry.results[1].health_import_id);
    await ingestGarminHealthPage({ db: actualDb, authenticatedUser: { id: HEALTH_USER_B }, request,
      source: new FixtureSource({ records: [official], next_cursor: null }) });

    assert.equal((await pg.query("select count(*)::int as n from wearable_health_imports")).rows[0].n, 3);
    assert.equal((await pg.query("select count(*)::int as n from wearable_health_daily")).rows[0].n, 3);
    assert.equal((await pg.query("select count(*)::int as n from wearable_provider_raw_payloads")).rows[0].n, 5);
    const stored = (await pg.query("select distance_m,steps,ingestion_channel from wearable_health_daily where user_id=$1 and calendar_date='2026-10-04'", [authenticatedUser.id])).rows;
    assert.deepEqual(stored, [{ distance_m: "4000", steps: 7000, ingestion_channel: "garmin_health_api" }]);
  } finally {
    await pg.close();
  }
});

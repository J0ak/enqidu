import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGarminHealthRecord } from "../src/health/garminAdapter.js";
import { persistGarminHealthRecord } from "../supabase/functions/_shared/garminHealthPersistence.js";
import { openHealthDb, ingestHealthRecord, createHealthServiceClient, HEALTH_USER_A, HEALTH_USER_B } from "./support/healthFoundationDb.mjs";

const source = (overrides = {}) => ({
  provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector",
  data_type: "daily_health", calendar_date: "2026-10-04", timezone: "Europe/Madrid",
  retrieved_at: "2026-10-04T12:00:00.000Z", source_identifier: "upstream-42",
  measurements: { steps: { value: 1234, unit: "count" } },
  raw: { upstream_unused: { nested: true } }, ...overrides,
});
const normalized = (overrides) => normalizeGarminHealthRecord(source(overrides));
const count = async (db, table) => Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
async function withDb(run) { const db = await openHealthDb(); try { await run(db); } finally { await db.close(); } }

// These tests execute real PostgreSQL functions/constraints/RLS, not an in-memory
// approximation of UPSERT or assertions against SQL text.
test("actual migration: exact retry and later retrieval preserve one canonical record and one raw revision", () => withDb(async (db) => {
  const first = await ingestHealthRecord(db, HEALTH_USER_A, normalized());
  assert.equal(first.status, "inserted");
  const retry = await ingestHealthRecord(db, HEALTH_USER_A, normalized());
  assert.equal(retry.status, "unchanged");
  assert.equal(retry.health_import_id, first.health_import_id);
  const later = await ingestHealthRecord(db, HEALTH_USER_A, normalized({ retrieved_at: "2026-10-04T13:00:00.000Z" }));
  assert.equal(later.status, "unchanged");
  assert.equal(later.raw_payload_id, first.raw_payload_id);
  assert.equal(await count(db, "wearable_health_imports"), 1);
  assert.equal(await count(db, "wearable_health_daily"), 1);
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 1);
  const raw = (await db.query("select raw_payload from wearable_provider_raw_payloads")).rows[0].raw_payload;
  assert.deepEqual(raw.raw, { upstream_unused: { nested: true } });
  assert.equal(raw.source_dto.source_identifier, "upstream-42");
}));

test("late correction replaces the same fact, stale delivery preserves evidence without reverting it", () => withDb(async (db) => {
  const first = await ingestHealthRecord(db, HEALTH_USER_A, normalized({ source_updated_at: "2026-10-04T10:00:00Z" }));
  const correction = await ingestHealthRecord(db, HEALTH_USER_A, normalized({
    source_updated_at: "2026-10-04T11:00:00Z", retrieved_at: "2026-10-05T12:00:00Z",
    measurements: { steps: { value: 1400, unit: "count" } },
  }));
  assert.equal(correction.status, "updated");
  assert.equal(correction.health_import_id, first.health_import_id);
  const stale = await ingestHealthRecord(db, HEALTH_USER_A, normalized({
    source_updated_at: "2026-10-04T09:00:00Z", retrieved_at: "2026-10-06T12:00:00Z",
    measurements: { steps: { value: 100, unit: "count" } },
  }));
  assert.equal(stale.status, "ignored_stale");
  assert.equal((await db.query("select steps from wearable_health_daily")).rows[0].steps, 1400);
  assert.equal(await count(db, "wearable_health_imports"), 1);
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 3);
  assert.equal(await count(db, "wearable_health_daily"), 1);
}));

test("retrieval chronology fallback and explicit unknown/null correction do not invent or retain observations", () => withDb(async (db) => {
  await ingestHealthRecord(db, HEALTH_USER_A, normalized());
  assert.equal((await ingestHealthRecord(db, HEALTH_USER_A, normalized({
    retrieved_at: "2026-10-04T11:00:00Z", measurements: { steps: { value: 99, unit: "count" } },
  }))).status, "ignored_stale");
  const result = await ingestHealthRecord(db, HEALTH_USER_A, normalized({
    retrieved_at: "2026-10-04T13:00:00Z", measurements: { steps: { value: null, unit: "count" } },
  }));
  assert.equal(result.status, "updated");
  const row = (await db.query("select steps,resting_heart_rate_bpm from wearable_health_daily")).rows[0];
  assert.equal(row.steps, null);
  assert.equal(row.resting_heart_rate_bpm, null);
}));

test("two users and two dates do not collide; mutable provider IDs cannot duplicate a day", () => withDb(async (db) => {
  const a = await ingestHealthRecord(db, HEALTH_USER_A, normalized());
  await ingestHealthRecord(db, HEALTH_USER_B, normalized());
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ calendar_date: "2026-10-05" }));
  const newId = await ingestHealthRecord(db, HEALTH_USER_A, normalized({ source_identifier: "upstream-renamed" }));
  assert.equal(newId.health_import_id, a.health_import_id);
  assert.equal(await count(db, "wearable_health_imports"), 3);
  assert.equal(await count(db, "wearable_health_daily"), 3);
}));

test("provisional Fitness AI and future official Garmin update the same canonical projection", () => withDb(async (db) => {
  const provisional = await ingestHealthRecord(db, HEALTH_USER_A, normalized());
  const official = await ingestHealthRecord(db, HEALTH_USER_A, normalized({
    provider_mode: "official_api", ingestion_channel: "garmin_health_api", source_identifier: "official-id-999",
    retrieved_at: "2026-10-04T13:00:00Z",
  }));
  assert.equal(official.health_import_id, provisional.health_import_id);
  assert.equal(await count(db, "wearable_health_daily"), 1);
  const current = (await db.query("select ingestion_channel,normalized_payload from wearable_health_imports")).rows[0];
  assert.equal(current.ingestion_channel, "garmin_health_api");
  assert.equal(current.normalized_payload.provenance.provider, "garmin");
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 2);
}));

test("body composition measurement timestamps and vendor facts remain stable across source IDs and database timezone", () => withDb(async (db) => {
  const body = { data_type: "body_composition", measured_at: "2026-10-04T08:00:00Z", measurements: { weight_kg: { value: 75, unit: "kg" } } };
  await ingestHealthRecord(db, HEALTH_USER_A, normalized(body));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...body, source_identifier: null }));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...body, source_identifier: "new", measured_at: "2026-10-04T09:00:00Z" }));
  const correctedDay = await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...body, source_identifier: 'renamed', calendar_date: '2026-10-03', timezone: 'America/New_York' }));
  assert.equal((await db.query('select observation_date::text as date from wearable_health_imports where id=$1',[correctedDay.health_import_id])).rows[0].date,'2026-10-03');
  assert.equal(await count(db, "wearable_body_composition_measurements"), 2);
  const insight = { data_type: "vendor_insight", observed_at: "2026-10-04T08:00:00Z", insight: { code: "vo2max", domain: "fitness", value_numeric: 48 } };
  const first = await ingestHealthRecord(db, HEALTH_USER_A, normalized(insight));
  await db.exec("set timezone='America/New_York'; set datestyle='SQL, DMY'");
  const alias = await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...insight, source_identifier: "official-new" }));
  assert.equal(alias.health_import_id, first.health_import_id);
  assert.equal(await count(db, "wearable_vendor_insights"), 1);
}));

test("all series use global timestamp/context identities; reingestion/correction/day overlap never duplicate samples", () => withDb(async (db) => {
  for (const [type, unit, table, field] of [
    ["heart_rate", "bpm", "wearable_heart_rate_samples", "heart_rate_bpm"],
    ["hrv", "ms", "wearable_hrv_nightly_samples", "hrv_ms"],
    ["stress", "score", "wearable_stress_samples", "stress_value"],
    ["body_battery", "score", "wearable_body_battery_samples", "body_battery_value"],
    ["respiration", "brpm", "wearable_respiration_samples", "breaths_per_minute"],
    ["spo2", "%", "wearable_spo2_samples", "spo2_percent"],
  ]) {
    const input = { data_type: type, measurements: {}, samples: [{ recorded_at: "2026-10-04T07:00:00Z", measurement: { value: 60, unit }, context: "daily" }] };
    await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
    await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
    await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, retrieved_at: "2026-10-04T13:00:00Z", samples: [{ ...input.samples[0], measurement: { value: 61, unit } }] }));
    await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-05" }));
    assert.equal(await count(db, table), 1, type);
    assert.equal(Number((await db.query(`select ${field} as value from ${table}`)).rows[0].value), 61);
  }
}));

test("unknown samples preserve raw evidence; complete snapshot correction removes only its previous managed samples", () => withDb(async (db) => {
  const input = { data_type: "heart_rate", measurements: {}, samples: [{ recorded_at: "2026-10-04T07:00:00Z", measurement: { value: 70, unit: "bpm" } }] };
  await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, retrieved_at: "2026-10-04T13:00:00Z", samples: [{ ...input.samples[0], measurement: { value: null, unit: "bpm" }, raw: { missing: true } }] }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 0);
  const current = (await db.query("select normalized_payload from wearable_health_imports")).rows[0].normalized_payload;
  assert.equal(current.samples[0].heart_rate_bpm, null);
  assert.deepEqual(current.samples[0].raw_payload.raw, { missing: true });
}));

test("single legacy summary and sample are adopted once with original evidence archived", () => withDb(async (db) => {
  await db.query("insert into wearable_health_daily(user_id,ingestion_channel,calendar_date,steps,raw_payload) values ($1,'chatgpt_assisted_capture','2026-10-04',999,'{\"legacy_marker\":\"daily\"}')", [HEALTH_USER_A]);
  await db.query("insert into wearable_heart_rate_samples(user_id,ingestion_channel,context,recorded_at,heart_rate_bpm,raw_payload) values ($1,'chatgpt_assisted_capture','daily','2026-10-04T07:00:00Z',72,'{\"legacy_marker\":\"sample\"}')", [HEALTH_USER_A]);
  await ingestHealthRecord(db, HEALTH_USER_A, normalized());
  const heart = normalized({ data_type: "heart_rate", measurements: {}, samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "daily", measurement: { value: 75, unit: "bpm" } }] });
  await ingestHealthRecord(db, HEALTH_USER_A, heart);
  await ingestHealthRecord(db, HEALTH_USER_A, heart);
  assert.equal(await count(db, "wearable_health_daily"), 1);
  assert.equal(await count(db, "wearable_heart_rate_samples"), 1);
  const snapshots = (await db.query("select raw_payload from wearable_provider_raw_payloads where payload_type='legacy_foundation_snapshot'")).rows.map((r) => r.raw_payload.raw_payload.legacy_marker).sort();
  assert.deepEqual(snapshots, ["daily", "sample"]);
}));

test("sleep stages retain generated duration and preserve legacy evidence when adopted", () => withDb(async (db) => {
  const sleepId = (await db.query("insert into wearable_sleep_sessions(user_id,ingestion_channel,calendar_date) values ($1,'chatgpt_assisted_capture','2026-10-04') returning id", [HEALTH_USER_A])).rows[0].id;
  await db.query("insert into wearable_sleep_stage_intervals(user_id,sleep_session_id,ingestion_channel,stage_code,interval_start_at,interval_end_at,raw_payload) values ($1,$2,'chatgpt_assisted_capture','light','2026-10-03T22:00:00Z','2026-10-03T23:00:00Z','{\"old_stage\":true}')", [HEALTH_USER_A, sleepId]);
  const sleep = normalized({ data_type: "sleep", measurements: {}, sleep_start_at: "2026-10-03T22:00:00Z", sleep_end_at: "2026-10-04T06:00:00Z", stages: [{ stage_code: "deep", start_at: "2026-10-03T22:00:00Z", end_at: "2026-10-03T23:00:00Z", duration: { value: 1, unit: "h" } }] });
  await ingestHealthRecord(db, HEALTH_USER_A, sleep);
  await ingestHealthRecord(db, HEALTH_USER_A, sleep);
  assert.equal(await count(db, "wearable_sleep_sessions"), 1);
  assert.equal(await count(db, "wearable_sleep_stage_intervals"), 1);
  const stage = (await db.query("select stage_code,duration_seconds from wearable_sleep_stage_intervals")).rows[0];
  assert.deepEqual(stage, { stage_code: "deep", duration_seconds: 3600 });
  assert.equal((await db.query("select count(*) as n from wearable_provider_raw_payloads where raw_payload->'raw_payload'->>'old_stage'='true'")).rows[0].n, 1);
}));

test("ambiguous legacy channel summaries and duplicate samples fail atomically instead of guessing/deleting", () => withDb(async (db) => {
  await db.query("insert into wearable_health_daily(user_id,ingestion_channel,calendar_date) values ($1,'chatgpt_assisted_capture','2026-10-04'),($1,'garmin_health_api','2026-10-04')", [HEALTH_USER_A]);
  await assert.rejects(ingestHealthRecord(db, HEALTH_USER_A, normalized()), /ambiguous legacy/);
  assert.equal(await count(db, "wearable_health_imports"), 0);
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 0);
  assert.equal(await count(db, "wearable_health_daily"), 2);
  await db.query("insert into wearable_heart_rate_samples(user_id,ingestion_channel,context,recorded_at,heart_rate_bpm) values ($1,'chatgpt_assisted_capture','daily','2026-10-04T07:00:00Z',72),($1,'garmin_health_api','daily','2026-10-04T07:00:00Z',72)", [HEALTH_USER_A]);
  await assert.rejects(ingestHealthRecord(db, HEALTH_USER_A, normalized({ data_type: "heart_rate", measurements: {}, samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "daily", measurement: { value: 75, unit: "bpm" } }] })), /ambiguous legacy sample/);
  assert.equal(await count(db, "wearable_health_imports"), 0);
}));

test("database rejects malformed records independently of server helper", () => withDb(async (db) => {
  const canonical = normalized();
  for (const mutate of [
    (r) => { r.metrics.user_id = HEALTH_USER_B; },
    (r) => { r.provenance.source_identifier = { forged: true }; },
    (r) => { r.metrics.steps = -1; },
    (r) => { r.metrics.steps = "123"; },
    (r) => { r.metrics.spo2_avg_pct = 101; },
    (r) => { r.calendar_date = "2026-02-30"; },
    (r) => { r.timezone = "not/a_timezone"; },
    (r) => { r.provenance.retrieved_at = "2026-10-04T12:00:00"; },
    (r) => { r.provenance.ingestion_channel = "garmin_health_api"; },
    (r) => { r.data_type = "daily_health;drop table auth.users"; },
    (r) => { r.samples = [{ recorded_at: "2026-10-04T12:00:00Z" }]; },
    (r) => { r.stages = [{ stage_code: "deep" }]; },
  ]) {
    const record = structuredClone(canonical); mutate(record);
    await assert.rejects(ingestHealthRecord(db, HEALTH_USER_A, record));
  }
  assert.equal(await count(db, "wearable_health_imports"), 0);
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 0);
}));

test("server helper validates canonical evidence, authenticated identity, and database errors", () => withDb(async (db) => {
  const dbClient = createHealthServiceClient(db);
  const saved = await persistGarminHealthRecord({ db: dbClient, authenticatedUser: { id: HEALTH_USER_A }, record: normalized() });
  assert.equal(saved.status, "inserted");
  const tampered = normalized(); tampered.metrics.steps = 42;
  await assert.rejects(persistGarminHealthRecord({ db: dbClient, authenticatedUser: { id: HEALTH_USER_A }, record: tampered }), /normalized source evidence/);
  await assert.rejects(persistGarminHealthRecord({ db: dbClient, authenticatedUser: { id: "unverified" }, record: normalized() }), /authenticated user UUID/);
  await assert.rejects(persistGarminHealthRecord({ db: { rpc: async () => ({ data: null, error: { message: "unavailable" } }) }, authenticatedUser: { id: HEALTH_USER_A }, record: normalized() }), /unavailable/);
}));

test("duplicate timestamps are rejected transactionally and distinct sample days/users remain separate", () => withDb(async (db) => {
  const input = { data_type: "heart_rate", measurements: {}, samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "daily", measurement: { value: 60, unit: "bpm" } }] };
  const duplicate = normalized(input); duplicate.samples.push(structuredClone(duplicate.samples[0]));
  await assert.rejects(ingestHealthRecord(db, HEALTH_USER_A, duplicate), /duplicate canonical sample/);
  assert.equal(await count(db, "wearable_health_imports"), 0);
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 0);
  await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
  await ingestHealthRecord(db, HEALTH_USER_B, normalized(input));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-05", samples: [{ ...input.samples[0], recorded_at: "2026-10-05T07:00:00Z" }] }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 3);
}));

test("global sample ignores older source versions even when a different day is retrieved later", () => withDb(async (db) => {
  const input = { data_type: "heart_rate", measurements: {}, source_updated_at: "2026-10-04T11:00:00Z", samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "daily", measurement: { value: 61, unit: "bpm" } }] };
  await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-05", source_updated_at: "2026-10-04T10:00:00Z", retrieved_at: "2026-10-06T12:00:00Z", samples: [{ ...input.samples[0], measurement: { value: 60, unit: "bpm" } }] }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 1);
  assert.equal(Number((await db.query("select heart_rate_bpm from wearable_heart_rate_samples")).rows[0].heart_rate_bpm), 61);
}));

test("legacy FIT/activity evidence is never rewritten through the health adapter", () => withDb(async (db) => {
  await db.query("insert into wearable_heart_rate_samples(user_id,ingestion_channel,context,recorded_at,heart_rate_bpm,raw_payload) values ($1,'fit_manual_upload','activity','2026-10-04T07:00:00Z',72,'{\"fit_marker\":true}')", [HEALTH_USER_A]);
  await assert.rejects(ingestHealthRecord(db, HEALTH_USER_A, normalized({ data_type: "heart_rate", measurements: {}, samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "activity", measurement: { value: 75, unit: "bpm" } }] })), /FIT\/activity evidence cannot be adopted/);
  assert.equal(await count(db, "wearable_health_imports"), 0);
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 0);
  const fit = (await db.query("select heart_rate_bpm,raw_payload,foundation_record_key from wearable_heart_rate_samples")).rows[0];
  assert.equal(Number(fit.heart_rate_bpm), 72);
  assert.deepEqual(fit.raw_payload, { fit_marker: true });
  assert.equal(fit.foundation_record_key, null);
}));

test("fresh cross-day null withdraws a sample and durable canonical evidence prevents stale resurrection", () => withDb(async (db) => {
  const input = { data_type: "heart_rate", measurements: {}, source_updated_at: "2026-10-04T10:00:00Z", samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "daily", measurement: { value: 70, unit: "bpm" } }] };
  await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-05", source_updated_at: "2026-10-04T11:00:00Z", samples: [{ ...input.samples[0], measurement: { value: null, unit: "bpm" } }] }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 0);
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, source_identifier: "new-old-source-id", retrieved_at: "2026-10-06T12:00:00Z" }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 0);
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, source_updated_at: "2026-10-04T12:00:00Z", retrieved_at: "2026-10-07T12:00:00Z", samples: [{ ...input.samples[0], measurement: { value: 72, unit: "bpm" } }] }));
  assert.equal(Number((await db.query("select heart_rate_bpm from wearable_heart_rate_samples")).rows[0].heart_rate_bpm), 72);
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-06", retrieved_at: "2026-10-08T12:00:00Z", samples: [{ ...input.samples[0], measurement: { value: null, unit: "bpm" } }] }));
  assert.equal(Number((await db.query("select heart_rate_bpm from wearable_heart_rate_samples")).rows[0].heart_rate_bpm), 72);
}));

test("identical facts retrieved later can restore the freshest retrieval-only global projection without another revision", () => withDb(async (db) => {
  const input = { data_type: "heart_rate", measurements: {}, samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "daily", measurement: { value: 70, unit: "bpm" } }] };
  await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-05", retrieved_at: "2026-10-05T12:00:00Z", samples: [{ ...input.samples[0], measurement: { value: null, unit: "bpm" } }] }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 0);
  const later = await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, retrieved_at: "2026-10-06T12:00:00Z" }));
  assert.equal(later.status, "unchanged");
  assert.equal(await count(db, "wearable_provider_raw_payloads"), 2);
  assert.equal(Number((await db.query("select heart_rate_bpm from wearable_heart_rate_samples")).rows[0].heart_rate_bpm), 70);
}));

test("omitted sample keys remain durable withdrawals across empty snapshots and overlapping days", () => withDb(async (db) => {
  const input = { data_type: "heart_rate", measurements: {}, source_updated_at: "2026-10-04T10:00:00Z", samples: [{ recorded_at: "2026-10-04T07:00:00Z", context: "daily", measurement: { value: 70, unit: "bpm" } }] };
  await ingestHealthRecord(db, HEALTH_USER_A, normalized(input));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, source_updated_at: "2026-10-04T11:00:00Z", samples: [] }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 0);
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, source_updated_at: "2026-10-04T12:00:00Z", samples: [] }));
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-05", retrieved_at: "2026-10-06T12:00:00Z" }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 0);
  const ledger = (await db.query("select source_asset_metadata->'foundation_sample_keys' as keys from wearable_health_imports where observation_date='2026-10-04'")).rows[0].keys;
  assert.deepEqual(ledger, ["heart_rate:2026-10-04 07:00:00:daily"]);
  await ingestHealthRecord(db, HEALTH_USER_A, normalized({ ...input, calendar_date: "2026-10-05", source_updated_at: "2026-10-04T13:00:00Z", retrieved_at: "2026-10-06T13:00:00Z" }));
  assert.equal(await count(db, "wearable_heart_rate_samples"), 1);
}));

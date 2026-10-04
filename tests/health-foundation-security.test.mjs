import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGarminHealthRecord } from "../src/health/garminAdapter.js";
import { openHealthDb, ingestHealthRecord, HEALTH_USER_A, HEALTH_USER_B } from "./support/healthFoundationDb.mjs";

const record = () => normalizeGarminHealthRecord({
  data_type: "daily_health", provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector",
  calendar_date: "2026-10-04", retrieved_at: "2026-10-04T12:00:00Z",
  measurements: { steps: { value: 1000, unit: "count" } },
});
async function withDb(run) { const db = await openHealthDb(); try { await run(db); } finally { await db.close(); } }
async function asRole(db, role, userId, run) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || ""]);
  await db.exec(`set role ${role}`);
  try { await run(); } finally { await db.exec("reset role"); }
}

const TABLES = [
  "wearable_health_imports", "wearable_health_observations", "wearable_health_daily", "wearable_sleep_sessions",
  "wearable_sleep_stage_intervals", "wearable_hrv_nightly_summaries", "wearable_hrv_nightly_samples",
  "wearable_heart_rate_samples", "wearable_stress_samples", "wearable_body_battery_samples",
  "wearable_respiration_samples", "wearable_spo2_samples", "wearable_body_composition_measurements", "wearable_vendor_insights",
];

test("actual migration revokes general browser mutation and bypass privileges, keeps RLS and service-only invoker RPC", () => withDb(async (db) => {
  for (const table of TABLES) {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass", [`public.${table}`])).rows[0].relrowsecurity, true);
    for (const role of ["anon", "authenticated"]) for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const allowed = (await db.query("select has_table_privilege($1,$2,$3) as allowed", [role, `public.${table}`, privilege])).rows[0].allowed;
      assert.equal(allowed, false, `${role} ${table} ${privilege}`);
    }
  }
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,'public.ingest_garmin_health_record(uuid,jsonb)','EXECUTE') as allowed", [role])).rows[0].allowed, false);
    for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER"]) assert.equal((await db.query("select has_table_privilege($1,'public.wearable_provider_raw_payloads',$2) as allowed", [role, privilege])).rows[0].allowed, false);
  }
  const fn = (await db.query("select prosecdef,proconfig from pg_proc where oid='public.ingest_garmin_health_record(uuid,jsonb)'::regprocedure")).rows[0];
  assert.equal(fn.prosecdef, false);
  assert.ok(fn.proconfig.some((value) => value.startsWith("search_path=")));
  assert.ok(fn.proconfig.includes("TimeZone=UTC"));
  assert.equal((await db.query("select has_function_privilege('service_role','public.ingest_garmin_health_record(uuid,jsonb)','EXECUTE') as allowed")).rows[0].allowed, true);
}));

test("authenticated owner can read only their own canonical records and cannot write or call ingestion", () => withDb(async (db) => {
  await ingestHealthRecord(db, HEALTH_USER_A, record());
  await ingestHealthRecord(db, HEALTH_USER_B, record());
  await asRole(db, "authenticated", HEALTH_USER_A, async () => {
    const users = (await db.query("select user_id from wearable_health_daily")).rows.map((row) => row.user_id);
    assert.deepEqual(users, [HEALTH_USER_A]);
    assert.equal((await db.query("select count(*) as n from wearable_health_imports where user_id=$1", [HEALTH_USER_B])).rows[0].n, 0);
    await assert.rejects(db.query("select public.ingest_garmin_health_record($1,$2::jsonb)", [HEALTH_USER_A, JSON.stringify(record())]), /permission denied/);
    await assert.rejects(db.query("insert into wearable_health_daily(user_id,ingestion_channel,calendar_date) values ($1,'fitness_ai_connector','2026-10-05')", [HEALTH_USER_A]), /permission denied/);
    await assert.rejects(db.query("update wearable_health_daily set steps=0"), /permission denied/);
    await assert.rejects(db.query("delete from wearable_health_daily"), /permission denied/);
    await assert.rejects(db.exec("truncate wearable_health_daily"), /permission denied/);
  });
  await asRole(db, "anon", null, async () => {
    await assert.rejects(db.query("select * from wearable_health_daily"), /permission denied/);
    await assert.rejects(db.query("select public.ingest_garmin_health_record($1,$2::jsonb)", [HEALTH_USER_A, JSON.stringify(record())]), /permission denied/);
  });
}));

test("shared raw assisted/FIT contract remains usable while browser cannot poison foundation keys or mutate protected evidence", () => withDb(async (db) => {
  await asRole(db, "authenticated", HEALTH_USER_A, async () => {
    await db.query("insert into wearable_provider_raw_payloads(user_id,provider_mode,ingestion_channel,api_product,payload_type,raw_payload) values ($1,'assisted_capture','chatgpt_assisted_capture','ui_evidence','legacy','{}')", [HEALTH_USER_A]);
    await assert.rejects(db.query("insert into wearable_provider_raw_payloads(user_id,provider_mode,ingestion_channel,api_product,payload_type,raw_payload,foundation_record_key,foundation_revision_hash) values ($1,'assisted_capture','chatgpt_assisted_capture','health','daily_health','{\"poisoned\":true}','daily_health:2026-10-04','fake-hash')", [HEALTH_USER_A]), /foundation evidence is server-owned/);
    await assert.rejects(db.query("update wearable_provider_raw_payloads set foundation_record_key='daily_health:2026-10-04',foundation_revision_hash='fake-hash'"), /foundation evidence is server-owned/);
  });
  const saved = await ingestHealthRecord(db, HEALTH_USER_A, record());
  // A protected assisted row tests the trigger even under the existing assisted
  // UPDATE/DELETE policies. Ordinary fitness_ai rows also remain RLS-protected.
  await db.exec("set role service_role");
  await db.query("insert into wearable_provider_raw_payloads(user_id,provider_mode,ingestion_channel,api_product,payload_type,raw_payload,foundation_record_key,foundation_revision_hash) values ($1,'assisted_capture','chatgpt_assisted_capture','health','legacy_foundation_snapshot','{}','legacy:test','audit-hash')", [HEALTH_USER_A]);
  await db.exec("reset role");
  await asRole(db, "authenticated", HEALTH_USER_A, async () => {
    await assert.rejects(db.query("update wearable_provider_raw_payloads set foundation_record_key=null,foundation_revision_hash=null where foundation_record_key='legacy:test'"), /foundation evidence is server-owned/);
    await assert.rejects(db.query("delete from wearable_provider_raw_payloads where foundation_record_key='legacy:test'"), /foundation evidence is server-owned/);
    await assert.rejects(db.exec("truncate wearable_provider_raw_payloads"), /permission denied/);
    assert.equal((await db.query("select raw_payload from wearable_provider_raw_payloads where id=$1", [saved.raw_payload_id])).rows[0].raw_payload.source_dto.provider, "garmin");
  });
}));

test("database ownership constraints reject unknown users and metric/envelope injection without partial writes", () => withDb(async (db) => {
  const unknown = "33333333-3333-4333-8333-333333333333";
  await assert.rejects(ingestHealthRecord(db, unknown, record()), /foreign key/);
  for (const mutate of [
    (r) => { r.metrics.user_id = HEALTH_USER_B; },
    (r) => { r.metrics.health_import_id = HEALTH_USER_B; },
    (r) => { r.user_id = HEALTH_USER_B; },
    (r) => { r.metrics['steps);drop table auth.users;--'] = 42; },
  ]) {
    const malicious = record(); mutate(malicious);
    await assert.rejects(ingestHealthRecord(db, HEALTH_USER_A, malicious), /unexpected/);
  }
  assert.equal((await db.query("select count(*) as n from wearable_health_imports")).rows[0].n, 0);
  assert.equal((await db.query("select count(*) as n from wearable_provider_raw_payloads")).rows[0].n, 0);
}));

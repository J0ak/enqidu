import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FitnessAiGarminSource } from "../src/health/fitnessAiGarminSource.js";
import { GarminAdapter } from "../src/health/garminAdapter.js";
import { ingestGarminHealthPage } from "../supabase/functions/_shared/ingestGarminHealthPage.js";
import { openHealthDb, createHealthServiceClient, HEALTH_USER_A, HEALTH_USER_B } from "./support/healthFoundationDb.mjs";

const request = { from_date: "2026-10-04", to_date: "2026-10-05", timezone: "Europe/Madrid" };
const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/fitness-ai-garmin/${name}.json`, import.meta.url)));
class FixtureTransport {
  constructor(response) { this.response = response; this.calls = []; }
  async getHealthSummary(value) { this.calls.push(value); return structuredClone(this.response); }
}
const makeSource = (response) => {
  const transport = new FixtureTransport(response);
  return { source: new FitnessAiGarminSource({ transport }), transport };
};

test("Fitness AI source maps observed summaries, explicit units and immutable aggregator provenance", async () => {
  const response = await fixture("complete-day");
  const { source, transport } = makeSource(response);
  const page = await source.getHealthRecords(request);
  assert.deepEqual(transport.calls, [{ ...request, cursor: null }]);
  assert.equal(page.records.length, 8);
  assert.equal(page.next_cursor, "synthetic-page-2");
  assert.deepEqual(page.records.map((record) => record.data_type), [
    "daily_health", "sleep", "hrv", "stress", "body_battery", "respiration", "spo2", "heart_rate",
  ]);
  for (const record of page.records) {
    assert.equal(record.provider, "garmin");
    assert.equal(record.provider_mode, "aggregator");
    assert.equal(record.ingestion_channel, "fitness_ai_connector");
    assert.equal(record.timezone, "Europe/Madrid");
    assert.equal(record.calendar_date, "2026-10-04");
    assert.equal(JSON.stringify(record.raw).includes("must-not-persist"), false);
  }
  const daily = page.records[0];
  assert.deepEqual(daily.measurements.distance_m, { value: 4321.5, unit: "m" });
  assert.deepEqual(daily.measurements.moderate_intensity_seconds, { value: 1200, unit: "s" });
  assert.deepEqual(daily.measurements.intensity_goal_seconds, { value: 9000, unit: "s" });
  assert.equal(Object.hasOwn(daily.measurements, "intensity_minutes"), false);
  assert.deepEqual(daily.measurements.steps, { value: 0, unit: "count" });
  assert.equal(page.source_metadata.data_status, "available");
  assert.equal(page.source_metadata.limitations.history_window_limited, true);
  assert.equal(JSON.stringify(page.source_metadata).includes("authorization"), false);
});

test("series offsets become UTC instants while calendar date remains connector date in profile timezone", async () => {
  const { source } = makeSource(await fixture("complete-day"));
  const page = new GarminAdapter().normalizePage(await source.getHealthRecords(request));
  const heartRate = page.records.find((record) => record.data_type === "heart_rate");
  assert.equal(heartRate.samples[0].recorded_at, "2026-10-03T22:30:00.000Z");
  assert.equal(heartRate.samples[1].recorded_at, "2026-10-03T22:35:00.000Z");
  assert.equal(heartRate.samples[0].nominal_resolution_seconds, 300);
  assert.equal(heartRate.samples[0].resolution_status, "documented_by_derived_export");
  assert.equal(heartRate.samples[1].heart_rate_bpm, null);
  assert.equal(heartRate.calendar_date, "2026-10-04");
  assert.equal(heartRate.timezone, "Europe/Madrid");
  assert.deepEqual(heartRate.evidence.raw.connector.series_meta.basis, {
    t0_utc: "2026-10-03T22:30:00Z", tz_offset_s: 7200, description: "synthetic local-day basis",
  });
  const respiration = page.records.find((record) => record.data_type === "respiration");
  assert.deepEqual(respiration.samples.map((sample) => [sample.recorded_at, sample.context]), [
    ["2026-10-03T22:30:00.000Z", "daily"], ["2026-10-03T22:31:00.000Z", "sleep"],
  ]);
  const sleep = page.records.find((record) => record.data_type === "sleep");
  assert.deepEqual(sleep.stages.map((stage) => [stage.stage_code, stage.interval_start_at, stage.duration_seconds]), [
    ["deep", "2026-10-03T22:00:00.000Z", 1800], ["light", "2026-10-03T22:30:00.000Z", 1800],
  ]);
});

test("partial and no-data are successful absence; empty/missing series never fabricate samples", async () => {
  const partial = await new FitnessAiGarminSource({ transport: new FixtureTransport(await fixture("partial-day")) }).getHealthRecords(request);
  assert.equal(partial.source_metadata.data_status, "partial");
  assert.deepEqual(partial.records.map((record) => record.data_type), ["daily_health", "heart_rate"]);
  const normalized = new GarminAdapter().normalizePage(partial);
  assert.equal(normalized.records[0].metrics.steps, 12);
  assert.equal(normalized.records[0].metrics.distance_m, null);
  assert.deepEqual(normalized.records[1].samples, []);
  assert.equal(normalized.records[1].metrics.resting_heart_rate_bpm, null);

  const noData = await new FitnessAiGarminSource({ transport: new FixtureTransport(await fixture("no-data")) }).getHealthRecords(request);
  assert.deepEqual(noData.records, []);
  assert.equal(noData.source_metadata.data_status, "no_data");
  assert.equal(noData.source_metadata.limitations.reason, "outside_current_history_window");
});

test("transport is replaceable and malformed or dishonest connector evidence fails explicitly", async () => {
  assert.throws(() => new FitnessAiGarminSource(), /injected transport/);
  const replacement = { invocations: 0, async getHealthSummary() { this.invocations++; return {
    data_status: "available", retrieved_at: "2026-10-05T08:00:00Z",
    daily: [{ calendar_date: "2026-10-04", steps: 1 }], series: {}, series_meta: {},
  }; } };
  const page = await new FitnessAiGarminSource({ transport: replacement }).getHealthRecords(request);
  assert.equal(replacement.invocations, 1);
  assert.equal(page.records[0].measurements.steps.value, 1);
  for (const response of [
    { data_status: "unknown" },
    { data_status: "available", heart_rate: [], series: { heart_rate: [{ calendar_date: "2026-10-04", points: [] }] }, series_meta: {} },
    { data_status: "available", daily: [{ calendar_date: "2026-10-03" }], series: {}, series_meta: {} },
  ]) {
    await assert.rejects(new FitnessAiGarminSource({ transport: new FixtureTransport(response), clock: () => new Date("2026-10-05T08:00:00Z") }).getHealthRecords(request));
  }
});

test("source ingestion uses foundation identity for retries, correction, stale delivery, null removal, users and dates", async () => {
  const pg = await openHealthDb();
  try {
    const db = createHealthServiceClient(pg);
    const base = await fixture("partial-day");
    const req = { ...request, from_date: "2026-10-05" };
    const ingest = (payload, user = HEALTH_USER_A) => ingestGarminHealthPage({
      db, authenticatedUser: { id: user }, request: req,
      source: new FitnessAiGarminSource({ transport: new FixtureTransport(payload) }),
    });
    const first = await ingest(base);
    const retry = await ingest(base);
    assert.deepEqual(first.results.map((result) => result.status), ["inserted", "inserted"]);
    assert.deepEqual(retry.results.map((result) => result.status), ["unchanged", "unchanged"]);

    const corrected = structuredClone(base);
    corrected.retrieved_at = "2026-10-06T09:00:00Z";
    corrected.daily[0].source_updated_at = "2026-10-06T08:50:00Z";
    corrected.daily[0].steps = 0;
    corrected.daily[0].distance_m = 2500;
    const update = await ingest(corrected);
    assert.equal(update.results[0].status, "updated");
    assert.equal(update.results[0].health_import_id, first.results[0].health_import_id);

    const removed = structuredClone(corrected);
    removed.retrieved_at = "2026-10-06T10:00:00Z";
    removed.daily[0].source_updated_at = "2026-10-06T09:50:00Z";
    removed.daily[0].distance_m = null;
    assert.equal((await ingest(removed)).results[0].status, "updated");
    const stale = await ingest(corrected);
    assert.equal(stale.results[0].status, "ignored_stale");

    await ingest(removed, HEALTH_USER_B);
    const secondDate = structuredClone(removed);
    secondDate.daily[0].calendar_date = "2026-10-04";
    secondDate.series.heart_rate[0].calendar_date = "2026-10-04";
    secondDate.series_meta.heart_rate[0].calendar_date = "2026-10-04";
    await ingestGarminHealthPage({ db, authenticatedUser: { id: HEALTH_USER_A }, request,
      source: new FitnessAiGarminSource({ transport: new FixtureTransport(secondDate) }) });

    const rows = (await pg.query("select user_id,calendar_date::text,steps,distance_m from wearable_health_daily order by user_id,calendar_date")).rows;
    assert.deepEqual(rows, [
      { user_id: HEALTH_USER_A, calendar_date: "2026-10-04", steps: 0, distance_m: null },
      { user_id: HEALTH_USER_A, calendar_date: "2026-10-05", steps: 0, distance_m: null },
      { user_id: HEALTH_USER_B, calendar_date: "2026-10-05", steps: 0, distance_m: null },
    ]);
    assert.equal((await pg.query("select count(*)::int n from wearable_health_imports")).rows[0].n, 6);
  } finally { await pg.close(); }
});

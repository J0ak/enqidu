import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FitnessAiGarminSource } from "../src/health/fitnessAiGarminSource.js";
import { GarminAdapter } from "../src/health/garminAdapter.js";

const request = { from_date: "2026-10-04", to_date: "2026-10-05", timezone: "Europe/Madrid" };
const fixture = async () => JSON.parse(await readFile(new URL("./fixtures/fitness-ai-garmin/live-shape.json", import.meta.url)));
class FixtureTransport {
  constructor(response) { this.response = response; }
  async getHealthSummary() { return structuredClone(this.response); }
}

test("live Fitness AI connector shape maps into canonical records without a synthetic transport envelope", async () => {
  const source = new FitnessAiGarminSource({ transport: new FixtureTransport(await fixture()) });
  const rawPage = await source.getHealthRecords(request);
  assert.deepEqual(rawPage.records.map((record) => record.data_type), [
    "daily_health", "sleep", "hrv", "stress", "body_battery", "respiration", "spo2", "heart_rate",
  ]);
  assert.equal(rawPage.next_cursor, null);

  const page = new GarminAdapter().normalizePage(rawPage);
  const daily = page.records.find((record) => record.data_type === "daily_health");
  assert.equal(daily.metrics.distance_m, 4250);
  assert.equal(daily.metrics.active_time_seconds, 2730);
  assert.equal(daily.metrics.moderate_intensity_seconds, 1200);
  assert.equal(daily.metrics.vigorous_intensity_seconds, 600);
  assert.equal(daily.metrics.intensity_goal_seconds, 9000);

  const sleep = page.records.find((record) => record.data_type === "sleep");
  assert.equal(sleep.metrics.total_duration_seconds, 27000);
  assert.equal(sleep.metrics.deep_sleep_seconds, 4320);
  assert.deepEqual(sleep.stages.map((stage) => [stage.stage_code, stage.interval_start_at, stage.interval_end_at]), [
    ["deep", "2026-10-03T22:00:00.000Z", "2026-10-03T22:30:00.000Z"],
    ["light", "2026-10-03T22:30:00.000Z", "2026-10-03T23:00:00.000Z"],
  ]);

  const heartRate = page.records.find((record) => record.data_type === "heart_rate");
  assert.equal(heartRate.samples[0].recorded_at, "2026-10-03T22:30:00.000Z");
  assert.equal(heartRate.samples[1].recorded_at, "2026-10-03T22:35:00.000Z");
  assert.equal(heartRate.samples[1].heart_rate_bpm, null);

  const respiration = page.records.find((record) => record.data_type === "respiration");
  assert.deepEqual(respiration.samples.map((sample) => sample.context), ["unknown", "sleep"]);
  assert.equal(page.source_metadata.data_status, "available");
});

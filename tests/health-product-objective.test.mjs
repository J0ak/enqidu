import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Health Product never fabricates readiness or fallback health measurements", () => {
  assert.doesNotMatch(source, /function\s+computeHealthReadiness\s*\(/);
  assert.doesNotMatch(source, /Ready to build|Train, but narrow|Recovery bias/);
  assert.doesNotMatch(source, /health\.body_battery_current\s*\?\?\s*72/);
  assert.doesNotMatch(source, /health\.average_stress_level\s*\?\?\s*31/);
  assert.doesNotMatch(source, /health\.steps\s*\?\?\s*8740/);
  assert.doesNotMatch(source, /\[44, 48, 46, 51, 54, 58, 61, 63, 59, 46, 39, 35, 32\]/);
  assert.doesNotMatch(source, /\["Deep", "Light", "Awake", "Light", "REM", "Light", "REM"\]/);
});

test("Health Product scopes daily health to the authenticated athlete", () => {
  const dailyStart = source.indexOf("const dailyQuery = userId");
  const dailyEnd = source.indexOf("const sessionQuery", dailyStart);
  assert.ok(dailyStart >= 0 && dailyEnd > dailyStart, "daily health query block must exist");
  const dailyQuery = source.slice(dailyStart, dailyEnd);
  assert.match(dailyQuery, /\.from\("wearable_health_daily"\)/);
  assert.match(dailyQuery, /\.eq\("user_id", userId\)/);
});

test("Health Product exposes observed provenance and canonical fields without synthetic score semantics", () => {
  assert.match(source, /Garmin · Fitness AI Connector/);
  assert.match(source, /ingestion_channel/);
  assert.match(source, /body_battery_charged/);
  assert.match(source, /body_battery_drained/);
  assert.match(source, /min_heart_rate_bpm/);
  assert.match(source, /max_heart_rate_bpm/);
  assert.match(source, /ENQIDU muestra únicamente métricas observadas y persistidas/);
  assert.match(source, /Las interpretaciones de readiness se mantienen separadas/);
});

test("Health charts render only when observed points exist", () => {
  assert.match(source, /function MiniSleepChart\(\{ stages \}\) \{\s*if \(!stages\?\.length\) return null;/);
  assert.match(source, /function HrvTrend\(\{ points \}\) \{\s*if \(!points\?\.length\) return null;/);
  assert.match(source, /function buildEnergyCurve\(bodyBatteryRows = \[\]\) \{\s*if \(!bodyBatteryRows\?\.length\) return \[\];/);
});

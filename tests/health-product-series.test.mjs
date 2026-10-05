import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Health Product renders observed stress, respiration and SpO2 series summaries", () => {
  assert.match(source, /observedSeriesSummary\(healthSeries\.stress, "stress_value", "recorded_at"\)/);
  assert.match(source, /observedSeriesSummary\(healthSeries\.respiration, "breaths_per_minute", "recorded_at"\)/);
  assert.match(source, /observedSeriesSummary\(healthSeries\.spo2, "spo2_percent", "recorded_at"\)/);
  assert.match(source, /ObservedSeriesCard title="Estrés"/);
  assert.match(source, /ObservedSeriesCard title="Respiración"/);
  assert.match(source, /ObservedSeriesCard title="SpO2"/);
});

test("Observed Health series presentation remains descriptive rather than interpretive", () => {
  assert.match(source, /Mínima observada/);
  assert.match(source, /Máxima observada/);
  assert.match(source, /Lecturas cargadas/);
  assert.doesNotMatch(source, /Estrés reciente.*Medio|Estrés reciente.*Alto/);
  assert.doesNotMatch(source, /VFC.*Equilibrado|VFC.*Bajo/);
});

test("Observed series summary keeps zero values and ignores missing readings", () => {
  const blockStart = source.indexOf("function observedSeriesSummary");
  const blockEnd = source.indexOf("function InfoPair", blockStart);
  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.match(block, /row\?\.\[valueField\] == null \? null : Number\(row\[valueField\]\)/);
  assert.match(block, /Number\.isFinite\(point\.value\)/);
  assert.match(block, /Math\.min\(\.\.\.values\)/);
  assert.match(block, /Math\.max\(\.\.\.values\)/);
});

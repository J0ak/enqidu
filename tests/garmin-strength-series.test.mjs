import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeGarminSeriesRows,
  extractRawGarminStrengthSets,
  pairGarminStrengthSets,
} from "../src/training/garminStrengthSeries.js";

test("pairs Garmin active/rest Set messages into display series", () => {
  const sets = [
    { set_type: "active", duration_seconds: 100, repetitions: 4, message_index: 0 },
    { set_type: "rest", duration_seconds: 20, message_index: 1 },
    { set_type: "active", duration_seconds: 80, repetitions: 5, exercise_name: "Remo", message_index: 2 },
    { set_type: "rest", duration_seconds: 10, message_index: 3 },
  ];
  const series = pairGarminStrengthSets(sets, "2026-07-27T07:32:53.000Z");
  assert.equal(series.length, 2);
  assert.deepEqual(series.map((item) => [item.series_order, item.active_seconds, item.rest_seconds, item.repetitions]), [
    [1, 100, 20, 4],
    [2, 80, 10, 5],
  ]);
  assert.equal(series[1].garmin_exercise_name, "Remo");
  assert.equal(series[0].duration_seconds, 120);
  assert.equal(series[1].start_elapsed_seconds, 120);
});

test("dedupe prefers native FIT series over screenshot fallback", () => {
  const rows = dedupeGarminSeriesRows([
    { series_order: 1, source: "garmin_connect_screenshot", repetitions: 4 },
    { series_order: 1, source: "garmin_fit_set", repetitions: 4, active_seconds: 100 },
    { series_order: 2, source: "garmin_connect_screenshot", repetitions: 5 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, "garmin_fit_set");
  assert.equal(rows[1].source, "garmin_connect_screenshot");
});

test("raw FIT fallback decodes global message 225 and pairs active/rest", () => {
  const file = buildSyntheticFit([
    { durationMs: 1159000, repetitions: 4, setType: 1, messageIndex: 0 },
    { durationMs: 559000, repetitions: 0, setType: 0, messageIndex: 1 },
    { durationMs: 811000, repetitions: 5, setType: 1, messageIndex: 2 },
    { durationMs: 212000, repetitions: 0, setType: 0, messageIndex: 3 },
  ]);
  const sets = extractRawGarminStrengthSets(file);
  assert.equal(sets.length, 4);
  assert.equal(sets[0].set_type, "active");
  assert.equal(sets[0].duration_seconds, 1159);
  assert.equal(sets[0].repetitions, 4);
  assert.equal(sets[1].set_type, "rest");
  const series = pairGarminStrengthSets(sets);
  assert.equal(series.length, 2);
  assert.deepEqual(series.map((item) => [item.active_seconds, item.rest_seconds, item.repetitions]), [
    [1159, 559, 4],
    [811, 212, 5],
  ]);
});

function buildSyntheticFit(sets) {
  const definition = [
    0x40, // definition header, local message 0
    0x00, // reserved
    0x00, // little endian
    0xe1, 0x00, // global message 225
    0x04, // four fields
    0x00, 0x04, 0x86, // duration uint32
    0x03, 0x02, 0x84, // repetitions uint16
    0x05, 0x01, 0x00, // set_type enum
    0x0a, 0x02, 0x84, // message_index uint16
  ];
  const data = [...definition];
  for (const set of sets) {
    data.push(0x00);
    pushUint32LE(data, set.durationMs);
    pushUint16LE(data, set.repetitions);
    data.push(set.setType);
    pushUint16LE(data, set.messageIndex);
  }
  const header = new Array(14).fill(0);
  header[0] = 14;
  header[1] = 0x20;
  header[2] = 0x00;
  header[3] = 0x00;
  writeUint32LE(header, 4, data.length);
  header[8] = 0x2e;
  header[9] = 0x46;
  header[10] = 0x49;
  header[11] = 0x54;
  return Uint8Array.from([...header, ...data]);
}

function pushUint16LE(target, value) {
  target.push(value & 0xff, (value >> 8) & 0xff);
}

function pushUint32LE(target, value) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function writeUint32LE(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

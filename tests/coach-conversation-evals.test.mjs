import test from "node:test";
import assert from "node:assert/strict";
import { CONVERSATION_EVAL_DATASET } from "../src/localLanguage/evalDataset.js";
import {
  parseConversationLanguage,
  parseConversationPeriod,
} from "../src/localLanguage/router.js";
const today = "2026-10-24";
test("V2 corpus contains at least 100 maintained language cases", () =>
  assert.ok(CONVERSATION_EVAL_DATASET.length >= 100));
for (const [index, row] of CONVERSATION_EVAL_DATASET.entries())
  test(`V2 language ${index + 1}: ${row.text}`, () => {
    const parsed = parseConversationLanguage(row.text, today);
    assert.equal(parsed.intent, row.intent);
    assert.equal(parsed.exercise_query, row.query);
    for (const key of ["followup", "previous", "unsafe"])
      if (row[key]) assert.equal(parsed[key], true);
  });
for (const [phrase, from, to] of [
  ["hoy", today, today],
  ["ayer", "2026-10-23", "2026-10-23"],
  ["esta semana", "2026-10-19", today],
  ["la semana pasada", "2026-10-12", "2026-10-18"],
  ["este mes", "2026-10-01", today],
  ["últimas 4 semanas", "2026-09-21", "2026-10-18"],
  ["últimas doce semanas", "2026-07-27", "2026-10-18"],
  ["desde julio", "2026-07-01", today],
  ["desde agosto", "2026-08-01", today],
  ["este año", "2026-01-01", today],
  ["el miércoles", "2026-10-21", "2026-10-21"],
  ["el 15 de octubre", "2026-10-15", "2026-10-15"],
])
  test(`V2 period: ${phrase}`, () =>
    assert.deepEqual(parseConversationPeriod(phrase, today).period, {
      from,
      to,
    }));
test("V2 dates fail closed; omitted month year uses most recent past occurrence", () => {
  for (const phrase of [
    "desde julio de 2020",
    "31 de febrero",
    "2026-02-30",
    "2027-01-01",
    "desde algo",
  ])
    assert.equal(parseConversationPeriod(phrase, today).invalid, true, phrase);
  assert.deepEqual(parseConversationPeriod("desde noviembre", today).period, {
    from: "2025-11-01",
    to: today,
  });
  assert.deepEqual(parseConversationPeriod("ayer", "2026-03-30").period, {
    from: "2026-03-29",
    to: "2026-03-29",
  });
});

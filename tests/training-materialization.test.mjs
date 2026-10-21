import test from "node:test";
import assert from "node:assert/strict";
import { parseMaterialization } from "../src/training/materialization/parser.js";
import { compileMaterialization } from "../src/training/materialization/compile.js";
import { MATERIALIZATION_SCHEMA } from "../src/training/materialization/contract.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import { catalogSeed } from "../src/training/catalogSeed.js";
import {
  createCatalogResolver,
  withCatalogIdentity,
} from "../src/training/catalogResolver.js";
import { patchExercises } from "../src/training/semantics/domain.js";
import {
  exerciseDataQuality,
  normalizationQueue,
} from "../src/training/materialization/quality.js";
import { isSemanticCorrectionIntent } from "../src/training/semantics/parser.js";
test("bounded metric-only input reaches clarification or the selected exercise", () => {
  for (const text of [
    "3x8 con 45 kg",
    "17,5 kg por mancuerna",
    "4 rondas",
    "por lado",
  ]) {
    assert.equal(isSemanticCorrectionIntent(text), true, text);
    assert.deepEqual(parseMaterialization(text).unresolved_facts, [], text);
  }
  assert.equal(
    parseMaterialization("por lado").observations[0].execution.side,
    "each_side",
  );
});
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const catalog = catalogSeed.map((r, i) => ({
  ...r,
  id: id(i + 10),
  is_active: true,
}));
const resolve = createCatalogResolver(catalog);
const row = (name, patch = {}) => ({
  id: id(1),
  block_id: null,
  exercise_id: resolve({ reported_name: name }).exercise?.id || null,
  reported_name: name,
  execution_type: "performed",
  sets_completed: 3,
  reps_per_set: [8, 8, 8],
  load_value: 45,
  load_unit: "kg",
  rounds_completed: null,
  side: null,
  tempo_or_pause: null,
  notes: "Original",
  technical_note: null,
  data_confidence: "reported",
  ...patch,
});
const state = { session_id: id(99), exercises: [row("RDL")] };
const golden =
  "Hoy en press banca hice 40 kg, 10, 10 y 9. En RDL hice 3x8 con 45 kg. No hice dead bug.";
test("materialization: golden three observations, single session, closed schema", () => {
  const facts = parseMaterialization(golden);
  assert.ok(matchesSchema(facts, MATERIALIZATION_SCHEMA));
  assert.equal(facts.observations.length, 3);
  assert.deepEqual(
    facts.observations.map((o) => o.execution.reps_per_set),
    [[10, 10, 9], [8, 8, 8], undefined],
  );
  const c = compileMaterialization(facts, state, catalog);
  assert.equal(c.status, "preview_ready");
  assert.ok(c.operations.every((o) => o.target !== id(1))); // RDL already materialized
  const after = patchExercises(state.exercises, c.operations);
  assert.equal(after.length, 3);
  assert.equal(after[2].execution_type, "skipped");
  assert.deepEqual(after[0], state.exercises[0]);
  assert.equal(c.facts.session_resolution.session_id, state.session_id);
  assert.ok(isSemanticCorrectionIntent(golden));
});
for (const [text, expected] of [
  [
    "RDL 3x8 con 45 kg",
    {
      reps_per_set: [8, 8, 8],
      sets_completed: 3,
      load_value: 45,
      load_unit: "kg",
    },
  ],
  ["RDL 17,5 kg por mancuerna", { load_value: 17.5, load_unit: "kg_each" }],
  [
    "RDL 3x8 por lado, pausa de 2 segundos",
    {
      reps_per_set: [8, 8, 8],
      sets_completed: 3,
      side: "each_side",
      tempo_or_pause: "pausa de 2 segundos",
    },
  ],
  ["hice 4 rondas", { rounds_completed: 4, performed: true }],
  ["última serie 9", { last_reps: 9 }],
  ["no hice dead bug porque iba justo de tiempo", { performed: false }],
  ["Dominadas 8, 8 y 7 reps", { reps_per_set: [8, 8, 7], sets_completed: 3 }],
])
  test("materialization grammar: " + text, () =>
    assert.deepEqual(
      parseMaterialization(text).observations[0]?.execution,
      expected,
    ),
  );
test("materialization notes preserve original accents and reason", () => {
  assert.equal(
    parseMaterialization("añade que la última me costó").observations[0].notes,
    "la última me costó",
  );
  assert.equal(
    parseMaterialization("No hice dead bug porque iba justo de tiempo")
      .observations[0].notes,
    "iba justo de tiempo",
  );
});
test("materialization multiple exercises do not leak metrics", () => {
  const f = parseMaterialization("Dominadas 8, 8 y 7; pike push-up 3x5.");
  assert.deepEqual(
    f.observations.map((o) => o.execution.reps_per_set),
    [
      [8, 8, 7],
      [5, 5, 5],
    ],
  );
  assert.ok(
    f.observations.every((o) => !Object.hasOwn(o.execution, "load_value")),
  );
  assert.ok(
    isSemanticCorrectionIntent("Dominadas 8, 8 y 7; pike push-up 3x5."),
  );
});
for (const text of [
  "RDL 3x8 o 4x8",
  "RDL unos 45 kg",
  "RDL 3x8; haz lo que quieras",
  "RDL 101x8",
  "RDL 3x8 con 9999 kg",
  "hice 45",
])
  test("materialization unsafe: " + text, () =>
    assert.ok(parseMaterialization(text).unresolved_facts.length),
  );
test("materialization no fuzzy, duplicate alias ambiguity, variants remain distinct", () => {
  assert.equal(resolve({ reported_name: "algo RDL" }).state, "unresolved");
  assert.equal(resolve({ reported_name: "Unknown" }).state, "unresolved");
  assert.equal(
    resolve({ reported_name: " PÉSO   MUERTO RÚMANO " }).state,
    "resolved",
  );
  assert.equal(
    createCatalogResolver([
      ...catalog,
      { ...catalog[0], id: id(999), metadata: { aliases: ["RDL"] } },
    ])({ reported_name: "RDL" }).state,
    "ambiguous",
  );
  assert.notEqual(
    resolve({ reported_name: "pike push-up" }).exercise.id,
    resolve({ reported_name: "elevated feet pike push-up" }).exercise.id,
  );
  assert.equal(
    resolve({ exercise_id: id(888), reported_name: "RDL" }).state,
    "unresolved",
  );
  const c = compileMaterialization(parseMaterialization("RDL 3x8"), state, [
    ...catalog,
    { ...catalog[0], id: id(999), metadata: { aliases: ["RDL"] } },
  ]);
  assert.equal(c.status, "needs_clarification");
  assert.equal(c.facts.observations[0].state, "ambiguous");
});
test("materialization no change, conflict diff, missing metrics preserved, normalization same row", () => {
  assert.equal(
    compileMaterialization(parseMaterialization("RDL 3x8"), state, catalog)
      .status,
    "already_materialized",
  );
  const c = compileMaterialization(
    parseMaterialization("RDL 42,5 kg"),
    state,
    catalog,
  );
  const after = patchExercises(state.exercises, c.operations)[0];
  assert.equal(after.load_value, 42.5);
  assert.deepEqual(after.reps_per_set, [8, 8, 8]);
  assert.equal(after.notes, "Original");
  assert.ok(c.facts.warnings.length);
  const legacy = { ...state, exercises: [row("RDL", { exercise_id: null })] };
  const norm = compileMaterialization(
    parseMaterialization("RDL 3x8"),
    legacy,
    catalog,
  );
  assert.deepEqual(norm.operations, [
    { op: "rename_exercise", target: id(1), reported_name: "RDL" },
  ]);
  const duplicate = compileMaterialization(
    parseMaterialization("RDL 45 kg; RDL 50 kg"),
    state,
    catalog,
  );
  assert.equal(duplicate.status, "needs_clarification");
  assert.equal(duplicate.facts.observations[1].state, "conflicting");
});
test("materialization unknown requires explicit editor selection; closed runtime rejects injection", () => {
  assert.equal(
    compileMaterialization(
      parseMaterialization("Unknown 3x8"),
      { session_id: id(99), exercises: [] },
      catalog,
    ).status,
    "needs_clarification",
  );
  const f = parseMaterialization("RDL 3x8");
  f.observations[0].execution.load_value = null;
  assert.equal(matchesSchema(f, MATERIALIZATION_SCHEMA), false);
  delete f.observations[0].execution.load_value;
  f.observations[0].execution.sql = "delete";
  assert.equal(matchesSchema(f, MATERIALIZATION_SCHEMA), false);
});

test("materialization participation preserves an unspecified execution variant", () => {
  const variant = { ...state, exercises: [row("RDL", { execution_type: "eccentric_only" })] };
  const result = compileMaterialization(parseMaterialization("En RDL hice 3x9 con 45 kg"), variant, catalog);
  const after = patchExercises(variant.exercises, result.operations)[0];
  assert.equal(after.execution_type, "eccentric_only");
  assert.deepEqual(after.reps_per_set, [9, 9, 9]);
  const omitted = compileMaterialization(parseMaterialization("No hice RDL"), variant, catalog);
  assert.equal(patchExercises(variant.exercises, omitted.operations)[0].execution_type, "skipped");
  const resumed = compileMaterialization(parseMaterialization("En RDL hice 3x8"),
    { ...state, exercises: [row("RDL", { execution_type: "skipped" })] }, catalog);
  assert.equal(patchExercises([{ ...variant.exercises[0], execution_type: "skipped" }], resumed.operations)[0].execution_type, "performed");
});
test("quality queue prioritizes identity; structured data reflected after exact read-time normalization", () => {
  const adapt = withCatalogIdentity(catalog);
  assert.equal(
    adapt(row("Romanian Deadlift", { exercise_id: null }))
      .canonical_exercise_code,
    "romanian_deadlift",
  );
  assert.equal(exerciseDataQuality(adapt(row("RDL"))), "complete");
  assert.equal(
    exerciseDataQuality(adapt(row("RDL", { load_value: null }))),
    "needs_metrics",
  );
  assert.equal(
    normalizationQueue([
      adapt(row("RDL", { load_value: null })),
      row("Unknown"),
    ])[0].quality,
    "needs_identity",
  );
});

test("materialization refuses repeated new identities and foreign exercise selections", () => {
  const empty = { session_id: id(99), exercises: [] };
  const repeat = compileMaterialization(
    parseMaterialization("RDL 3x8; Romanian Deadlift 3x9"),
    empty,
    catalog,
  );
  assert.equal(repeat.status, "needs_clarification");
  assert.deepEqual(repeat.operations, []);
  assert.equal(repeat.facts.observations[1].state, "conflicting");
  const foreign = compileMaterialization(
    parseMaterialization("RDL 3x8"),
    state,
    catalog,
    id(777),
  );
  assert.equal(foreign.status, "needs_clarification");
  assert.deepEqual(foreign.operations, []);
});

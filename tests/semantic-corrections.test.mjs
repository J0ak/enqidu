import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSemanticSpanish,
  isSemanticCorrectionIntent,
} from "../src/training/semantics/parser.js";
import {
  resolveExactExercise,
  patchExercises,
  semanticFingerprint,
} from "../src/training/semantics/domain.js";
import { matchesSchema } from "../src/enqiduTools/schema.js";
import { COMMAND_SCHEMA } from "../src/training/semantics/contract.js";
import {
  exerciseIdentity,
  exerciseObservation,
} from "../src/progress/domain.js";
import { interpretSemanticCorrection } from "../src/training/semantics/interpret.js";
const id = "10000000-0000-4000-8000-000000000001";
for (const [text, expected] of [
  [
    "En RDL hice 3x8 con 45 kg.",
    [
      { op: "set_reps", reps: [8, 8, 8] },
      { op: "set_load", value: 45, unit: "kg" },
    ],
  ],
  ["fueron 10, 10 y 9", [{ op: "set_reps", reps: [10, 10, 9] }]],
  ["hice 8 dominadas", [{ op: "set_reps", reps: [8] }]],
  [
    "eran 17,5 kg por mancuerna",
    [{ op: "set_load", value: 17.5, unit: "kg_each" }],
  ],
  ["hice 0 kg", [{ op: "set_load", value: 0, unit: "kg" }]],
  ["eso era RDL", [{ op: "rename_exercise", reported_name: "rdl" }]],
  ["no hice dead bug", [{ op: "set_omitted", value: true }]],
  ["hice 4 rondas", [{ op: "set_rounds", value: 4 }]],
  ["fue por lado", [{ op: "set_side", value: "each_side" }]],
  ["pausa de 2 segundos", [{ op: "set_tempo", value: "pausa de 2 segundos" }]],
  [
    "añade que me costó la última serie",
    [{ op: "append_note", value: "me costó la última serie" }],
  ],
  ["La última fueron 9.", [{ op: "set_last_reps", value: 9 }]],
  [
    "En el press banca de hoy hice 40 kg, 10, 10 y 9.",
    [
      { op: "set_load", value: 40, unit: "kg" },
      { op: "set_reps", reps: [10, 10, 9] },
    ],
  ],
])
  test("SEMANTICS parser: " + text, () =>
    assert.deepEqual(parseSemanticSpanish(text)?.changes, expected),
  );
for (const text of [
  "hice 45",
  "hice unos 45 kg",
  "hice 3x8 con 45 kg o 50 kg",
  "hice 3x8 con -45 kg",
  "hice 101x8",
  "hice 1001 rondas",
  "la ultima fueron 1001",
  "eran 17,5",
  "fueron 10, 10 y quizá 9",
  "hice 3x8 con 45 lb por mancuerna",
])
  test("SEMANTICS uncertain input: " + text, () =>
    assert.equal(parseSemanticSpanish(text), null),
  );
test("SEMANTICS aliases exact only, including accents and whitespace", () => {
  assert.equal(resolveExactExercise(" RDL ").id, "romanian_deadlift");
  assert.equal(resolveExactExercise("peso"), null);
  assert.equal(resolveExactExercise("algo peso muerto rumano raro"), null);
  assert.equal(resolveExactExercise("Unknown"), null);
  assert.equal(resolveExactExercise(" SENTADILLA  FRONTAL ").id, "front_squat");
});
test("SEMANTICS granular last set preserves identity, load, other exercise, FIT fields", () => {
  const original = [
    {
      id,
      reported_name: "Press banca",
      load_value: 40,
      load_unit: "kg",
      reps_per_set: [10, 10, 10],
      sets_completed: 3,
      duration_seconds: 777,
      notes: "Original",
      data_confidence: "reported",
    },
    { id: "other", reported_name: "Remo", load_value: 20 },
  ];
  const result = patchExercises(original, [
    { op: "set_last_reps", target: id, value: 9 },
  ]);
  assert.deepEqual(result, [
    { ...original[0], reps_per_set: [10, 10, 9] },
    original[1],
  ]);
  assert.equal(original[0].reps_per_set[2], 10);
  const renamed = patchExercises(original, [
    { op: "rename_exercise", target: id, reported_name: "Landmine press" },
  ]);
  assert.deepEqual(renamed[0].reps_per_set, [10, 10, 10]);
  assert.equal(renamed[0].load_value, 40);
});
test("SEMANTICS omission excluded, zero observed, kg_each never doubled, Unknown no PR", () => {
  assert.equal(
    exerciseIdentity({ reported_name: "Dead bug", execution_type: "skipped" }),
    null,
  );
  assert.equal(exerciseIdentity({ reported_name: "Unknown" }), null);
  assert.equal(
    exerciseObservation(
      { load_value: 17.5, load_unit: "kg_each", reps_per_set: [8, 8, 8] },
      "2026-10-18",
    ).volume,
    420,
  );
  assert.equal(
    exerciseObservation(
      { load_value: 0, load_unit: "kg", reps_per_set: [8] },
      "2026-10-18",
    ).volume,
    0,
  );
  assert.equal(
    exerciseObservation(
      { load_value: 45, load_unit: "kg", reps_per_set: "3x8" },
      "2026-10-18",
    ).volume,
    null,
  );
});
test("SEMANTICS closed typed operations reject identity injection and generic patches", () => {
  const good = {
    session_id: id,
    operations: [{ op: "set_load", target: id, value: 0, unit: "kg" }],
  };
  assert.ok(matchesSchema(good, COMMAND_SCHEMA));
  for (const bad of [
    { ...good, user_id: id },
    {
      ...good,
      operations: [
        { op: "update", target: id, column: "duration_seconds", value: 45 },
      ],
    },
    {
      ...good,
      operations: [{ op: "set_load", target: id, value: "45", unit: "kg" }],
    },
  ])
    assert.equal(matchesSchema(bad, COMMAND_SCHEMA), false);
});
test("SEMANTICS fingerprint binds owner, operations, expiry, session and revision", async () => {
  const args = {
    session_id: id,
    revision: "a".repeat(64),
    operations: [{ op: "set_load", target: id, value: 45, unit: "kg" }],
    expires_at: "2026-10-18T12:00:00Z",
  };
  const fingerprint = await semanticFingerprint(
    id,
    args,
    "test-secret-".repeat(4),
  );
  for (const changed of [
    { ...args, revision: "b".repeat(64) },
    {
      ...args,
      operations: [{ op: "set_load", target: id, value: 50, unit: "kg" }],
    },
    { ...args, session_id: "other" },
    { ...args, expires_at: "2026-10-19T12:00:00Z" },
  ])
    assert.notEqual(
      await semanticFingerprint(id, changed, "test-secret-".repeat(4)),
      fingerprint,
    );
  assert.notEqual(
    await semanticFingerprint("other", args, "test-secret-".repeat(4)),
    fingerprint,
  );
});
test("SEMANTICS Coach never chooses Fuerza over Pilates by modality/date", async () => {
  let writes = 0;
  const rows = [
    { id, title: "Fuerza", local_date: "2026-10-15" },
    {
      id: "10000000-0000-4000-8000-000000000002",
      title: "Pilates",
      local_date: "2026-10-15",
    },
  ];
  const db = {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        neq() {
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return Promise.resolve({ data: rows });
        },
      };
      return q;
    },
    rpc() {
      writes++;
      throw Error("unexpected");
    },
  };
  const result = await interpretSemanticCorrection({
    db,
    userId: id,
    args: { text: "en el entrenamiento del 15 hice 8 dominadas" },
    calendar: { date: "2026-10-18" },
    now: new Date(),
  });
  assert.equal(result.status, "needs_clarification");
  assert.equal(result.preview, null);
  assert.deepEqual(result.sessions, rows);
  assert.equal(writes, 0);
  assert.equal(result.llm_used, false);
  assert.equal(result.usage, null);
  assert.ok(isSemanticCorrectionIntent("En RDL hice 3x8 con 45 kg."));
});

test("SEMANTICS intent does not intercept ordinary training questions", () => {
  for (const text of [
    "¿Qué hice ayer?",
    "Qué hice hoy",
    "¿Qué he entrenado esta semana?",
    "¿Cuántas rondas hice?",
  ])
    assert.equal(isSemanticCorrectionIntent(text), false, text);
});

test("SEMANTICS preview/apply do not write a separate planning history", async () => {
  const { dailyCoachEvent } = await import("../src/dailyCoach/history.js");
  for (const tool of [
    "get_training_semantics_v1",
    "preview_training_semantics_v1",
    "apply_training_semantics_v1",
  ]) {
    assert.equal(await dailyCoachEvent(tool, {}, {}, {}), null);
  }
});

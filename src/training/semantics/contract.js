import {
  MATERIALIZATION_SCHEMA,
  MATERIALIZATION_EVIDENCE_SCHEMA,
} from "../materialization/contract.js";
import {
  objectSchema as object,
  textSchema as text,
  nullable,
  listSchema as list,
  ID_SCHEMA as id,
  DATE_SCHEMA as date,
} from "../../enqiduTools/schema.js";
export const VERSION = "training_semantics_v1";
const integer = (maximum) => ({ type: "integer", minimum: 0, maximum });
const name = { type: "string", minLength: 1, maxLength: 200 };
const reps = { ...list(integer(1000), 100), minItems: 1 };
export const units = ["kg", "kg_each", "lb", "bodyweight"];
export const sides = [
  "left",
  "right",
  "bilateral",
  "alternating",
  "each_side",
  "na",
];
const op = (kind, props) =>
  object({ op: { const: kind }, target: id, ...props });
export const OPERATION_SCHEMA = {
  oneOf: [
    op("add_exercise", { reported_name: name }),
    op("rename_exercise", { reported_name: name }),
    op("set_reps", { reps }),
    op("set_last_reps", { value: integer(1000) }),
    op("set_sets", { value: integer(100) }),
    op("set_load", {
      value: { type: "number", minimum: 0, maximum: 2000 },
      unit: { enum: units },
    }),
    op("set_rounds", { value: integer(1000) }),
    op("set_side", { value: { enum: sides } }),
    op("set_tempo", { value: text(100) }),
    op("append_note", { value: { ...text(500), minLength: 1 } }),
    op("set_technical_note", { value: text(500) }),
    op("set_omitted", { value: { type: "boolean" } }),
  ],
};
export const OPERATIONS_SCHEMA = { ...list(OPERATION_SCHEMA, 30), minItems: 1 };
export const COMMAND_SCHEMA = object({
  session_id: id,
  operations: OPERATIONS_SCHEMA,
});
export const revisionSchema = {
  type: "string",
  pattern: "^[0-9a-f]{64}$",
  minLength: 64,
  maxLength: 64,
};
export const fingerprintSchema = {
  type: "string",
  pattern: "^sha256:[0-9a-f]{64}$",
  minLength: 71,
  maxLength: 71,
};
const timestamp = { type: "string", format: "date-time", maxLength: 40 };
export const APPLY_SCHEMA = object(
  {
    ...COMMAND_SCHEMA.properties,
    materialization: MATERIALIZATION_EVIDENCE_SCHEMA,
    channel: { enum: ["app", "coach"] },
    revision: revisionSchema,
    fingerprint: fingerprintSchema,
    expires_at: timestamp,
    confirmation: { const: true },
  },
  [
    "session_id",
    "operations",
    "channel",
    "revision",
    "fingerprint",
    "expires_at",
    "confirmation",
  ],
);
export const EXERCISE_SCHEMA = object({
  id,
  block_id: nullable(id),
  exercise_id: nullable(id),
  reported_name: text(2000),
  execution_type: nullable(text(50)),
  data_confidence: nullable(text(50)),
  sets_completed: nullable({ type: "number" }),
  reps_per_set: nullable(list({ type: "number" }, 100)),
  load_value: nullable({ type: "number" }),
  load_unit: nullable(text(50)),
  rounds_completed: nullable({ type: "number" }),
  side: nullable(text(50)),
  tempo_or_pause: nullable(text(1000)),
  notes: nullable(text(4000)),
  technical_note: nullable(text(500)),
});
export const STATE_SCHEMA = object({
  schema_version: { const: VERSION },
  session_id: id,
  title: text(2000),
  local_date: nullable(date),
  revision: revisionSchema,
  exercises: list(EXERCISE_SCHEMA, 200),
  llm_used: { const: false },
  usage: { type: "null" },
});
const previewProperties = {
  schema_version: { const: VERSION },
  session_id: id,
  title: text(2000),
  local_date: nullable(date),
  before: list(EXERCISE_SCHEMA, 200),
  after: list(EXERCISE_SCHEMA, 200),
  operations: OPERATIONS_SCHEMA,
  channel: { enum: ["app", "coach"] },
  revision: revisionSchema,
  fingerprint: fingerprintSchema,
  expires_at: timestamp,
  requires_confirmation: { const: true },
  warnings: list(text(), 10),
  llm_used: { const: false },
  usage: { type: "null" },
  materialization: MATERIALIZATION_EVIDENCE_SCHEMA,
};
export const PREVIEW_SCHEMA = object(
  previewProperties,
  Object.keys(previewProperties).filter((k) => k !== "materialization"),
);
export const RECEIPT_SCHEMA = object(
  {
    schema_version: { const: VERSION },
    session_id: id,
    applied: { const: true },
    replayed: { type: "boolean" },
    source_id: id,
    event_id: id,
    revision: revisionSchema,
    persistence_verified: { type: "boolean" },
    llm_used: { const: false },
    usage: { type: "null" },
    state: STATE_SCHEMA,
  },
  [
    "schema_version",
    "session_id",
    "applied",
    "replayed",
    "source_id",
    "event_id",
    "revision",
    "persistence_verified",
    "llm_used",
    "usage",
  ],
);

export const INTERPRET_SCHEMA = object(
  {
    text: { ...text(2000), minLength: 1 },
    session_id: id,
    exercise_target: id,
  },
  ["text"],
);
const interpretationProperties = {
  status: {
    enum: ["needs_clarification", "preview_ready", "already_materialized"],
  },
  message: text(),
  sessions: list(
    object({ id, title: text(2000), local_date: nullable(date) }),
    20,
  ),
  exercises: list(object({ id, reported_name: text(2000) }), 200),
  preview: nullable(PREVIEW_SCHEMA),
  llm_used: { const: false },
  usage: { type: "null" },
  materialization: MATERIALIZATION_SCHEMA,
};
export const INTERPRET_RESULT_SCHEMA = object(
  interpretationProperties,
  Object.keys(interpretationProperties).filter((k) => k !== "materialization"),
);

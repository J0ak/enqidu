import {
  objectSchema as object,
  textSchema as text,
  listSchema as list,
  ID_SCHEMA as id,
} from "../../enqiduTools/schema.js";
export const MATERIALIZATION_VERSION = "training_materialization_v1";
const integer = (maximum) => ({ type: "integer", minimum: 0, maximum });
const name = { ...text(200), minLength: 1 };
const states = {
  enum: [
    "parsed",
    "resolved",
    "unresolved",
    "ambiguous",
    "conflicting",
    "missing",
  ],
};
export const EXECUTION_SCHEMA = object(
  {
    performed: { type: "boolean" },
    sets_completed: integer(100),
    reps_per_set: { ...list(integer(1000), 100), minItems: 1 },
    last_reps: integer(1000),
    load_value: { type: "number", minimum: 0, maximum: 2000 },
    load_unit: { enum: ["kg", "kg_each", "lb", "bodyweight"] },
    rounds_completed: integer(1000),
    side: {
      enum: ["left", "right", "bilateral", "alternating", "each_side", "na"],
    },
    tempo_or_pause: text(100),
  },
  [],
);
export const MATERIALIZATION_SCHEMA = object({
  schema_version: { const: MATERIALIZATION_VERSION },
  session_resolution: object(
    { state: states, session_id: id, date_reference: text(40) },
    ["state", "date_reference"],
  ),
  observations: list(
    object(
      {
        exercise: object(
          {
            reported_name: name,
            canonical_code: name,
            exercise_id: id,
            resolution_state: states,
            resolved_by: { enum: ["exercise_id", "exact_label"] },
            rename_to: name,
          },
          ["resolution_state"],
        ),
        execution: EXECUTION_SCHEMA,
        notes: text(500),
        technical_note: text(500),
        confidence: { const: "explicit" },
        provenance: object({ clause: text(600), index: integer(9) }),
        state: states,
      },
      ["exercise", "execution", "confidence", "provenance", "state"],
    ),
    10,
  ),
  unresolved_facts: list(
    object({ text: text(2000), state: states, reason: text(200) }),
    20,
  ),
  warnings: list(text(500), 20),
});
export const MATERIALIZATION_EVIDENCE_SCHEMA = object({
  original_text: { ...text(2000), minLength: 1 },
  facts: MATERIALIZATION_SCHEMA,
  generated_at: { type: "string", format: "date-time", maxLength: 40 },
});

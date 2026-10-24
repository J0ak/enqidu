import {
  EXERCISE_SCHEMA,
  VERSION,
} from "../../src/training/semantics/contract.js";
export function semanticState(fixture, session) {
  return {
    schema_version: VERSION,
    session_id: session.id,
    title: session.title,
    local_date: session.local_date,
    revision: "a".repeat(64),
    exercises: fixture.tables.session_exercises
      .filter((e) => e.session_id === session.id)
      .map((e) =>
        Object.fromEntries(
          Object.keys(EXERCISE_SCHEMA.properties).map((k) => [k, e[k] ?? null]),
        ),
      ),
  };
}

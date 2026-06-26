export function buildNormalizedAthleteContext({ references, sessionFixtures, copied = [] }) {
  const sourceFiles = copied.map((source) => source.target_path);

  return {
    schema_version: "enqidu_normalized_athlete_context_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    source_traceability: {
      generated_from: "docs/coach-context",
      source_files: sourceFiles,
    },
    data_quality: {
      missing_fields: [],
      warnings: ["fixture_user_context_not_live_user_profile"],
    },
    athleteFixture: {
      id: "jotason",
      label: "Jotason",
      role: "pilot_fixture",
    },
    availability: {
      source: "historical_references_only",
      editable_live_state: false,
    },
    references,
    counts: {
      references: Object.values(references).filter(Boolean).length,
      session_fixtures: sessionFixtures.length,
    },
  };
}


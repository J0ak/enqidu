import { loadCoachContextReferences } from "./loadCoachContextReferences.js";

export async function buildCoachContextFixture(options = {}) {
  const loaded = await loadCoachContextReferences(options);
  const warnings = [];

  if (loaded.missing.length > 0) {
    warnings.push(`Missing coach context sources: ${loaded.missing.map((source) => source.file).join(", ")}`);
  }

  return {
    schema_version: "enqidu_coach_context_fixture_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    fixture: "jotason",
    generated_from: "docs/coach-context",
    generatedFrom: "docs/coach-context",
    source_traceability: {
      generated_from: "docs/coach-context",
      source_files: loaded.copied.map((source) => source.target_path),
    },
    data_quality: {
      missing_fields: [],
      warnings,
    },
    references: loaded.references,
    sessionFixtures: loaded.sessionFixtures,
    copied: loaded.copied,
    missing: loaded.missing,
    warnings,
  };
}

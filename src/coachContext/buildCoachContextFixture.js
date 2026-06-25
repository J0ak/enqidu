import { loadCoachContextReferences } from "./loadCoachContextReferences.js";

export async function buildCoachContextFixture(options = {}) {
  const loaded = await loadCoachContextReferences(options);
  const warnings = [];

  if (loaded.missing.length > 0) {
    warnings.push(`Missing coach context sources: ${loaded.missing.map((source) => source.file).join(", ")}`);
  }

  return {
    product: "ENQIDU",
    fixture: "jotason",
    generatedFrom: "docs/coach-context",
    references: loaded.references,
    sessionFixtures: loaded.sessionFixtures,
    warnings,
  };
}


export function normalizePromaestroReference(raw, { file = "jotason_promaestro_v5.json", sourcePath = null } = {}) {
  const missingFields = [];
  if (!raw?.plan_name) missingFields.push("plan_name");
  if (!raw?.priorities?.primary) missingFields.push("priorities.primary");

  return {
    schema_version: "enqidu_training_reference_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    source: {
      file,
      fixture: "jotason",
      role: "historical_master_plan_reference",
    },
    source_traceability: {
      file,
      source_path: sourcePath,
      fixture_user: "jotason",
      role: "historical_master_plan_reference",
    },
    data_quality: {
      missing_fields: missingFields,
      warnings: ["historical_reference_not_current_availability"],
    },
    planName: raw?.plan_name ?? null,
    lastUpdate: raw?.last_update ?? null,
    priorities: {
      primary: raw?.priorities?.primary ?? null,
      secondary: raw?.priorities?.secondary ?? null,
      tertiary: raw?.priorities?.tertiary ?? null,
    },
    weeklyStructure: raw?.weekly_structure ?? {},
    rules: Array.isArray(raw?.rules) ? raw.rules : [],
  };
}

export function normalizeMasterTemplateReference(
  raw,
  { file = "JOTASON_MASTER_TEMPLATE_v8_COMPLETO.json", sourcePath = null } = {},
) {
  const topLevelKeys = raw && typeof raw === "object" ? Object.keys(raw) : [];

  return {
    schema_version: "enqidu_master_template_reference_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    source_traceability: {
      file,
      source_path: sourcePath,
      fixture_user: "jotason",
      role: "historical_session_contract_reference",
    },
    data_quality: {
      missing_fields: [],
      warnings: ["historical_reference_contract_not_runtime_model"],
    },
    schemaType: raw?.schema_version ?? raw?.jotason_version ?? raw?.template_source ?? null,
    topLevelKeys,
    concepts: {
      hasMetadata: Boolean(raw?.metadata),
      hasSummary: Boolean(raw?.summary || raw?.session_overview),
      hasZones: Boolean(raw?.zones || raw?.heart_rate_zones),
      hasLaps: Boolean(raw?.laps),
      hasBlocks: Boolean(raw?.structure?.blocks || raw?.blocks),
      hasCoachLayer: Boolean(raw?.coach_layer),
      hasDataQuality: Boolean(raw?.data_quality),
    },
  };
}

export function normalizeMonthlyHistoryReference(
  raw,
  { file = "JOTASON_MASTER_ULTIMO_MES_2026-04-18_ULTRA_DETALLADO.json", sourcePath = null } = {},
) {
  const topLevelKeys = raw && typeof raw === "object" ? Object.keys(raw) : [];
  const sessions = Array.isArray(raw?.sessions) ? raw.sessions : [];

  return {
    schema_version: "enqidu_monthly_history_reference_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    source_traceability: {
      file,
      source_path: sourcePath,
      fixture_user: "jotason",
      role: "monthly_history_aggregation_fixture",
    },
    data_quality: {
      missing_fields: [],
      warnings: ["historical_aggregation_fixture_not_live_user_state"],
    },
    topLevelKeys,
    counts: {
      sessions: sessions.length,
      topLevelKeys: topLevelKeys.length,
    },
    summary: raw?.summary ?? raw?.monthly_summary ?? raw?.coach_conclusions ?? null,
  };
}

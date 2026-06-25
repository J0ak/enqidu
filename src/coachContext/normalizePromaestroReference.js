export function normalizePromaestroReference(raw, { file = "jotason_promaestro_v5.json" } = {}) {
  return {
    source: {
      file,
      fixture: "jotason",
      role: "historical_master_plan_reference",
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


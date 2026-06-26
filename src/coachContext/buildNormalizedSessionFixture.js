function topLevelKeys(raw) {
  return raw && typeof raw === "object" ? Object.keys(raw) : [];
}

export function buildNormalizedSessionFixture(sessionFixture) {
  return {
    schema_version: "enqidu_normalized_session_fixture_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    source_traceability: {
      ...sessionFixture.source_traceability,
      raw_top_level_keys: topLevelKeys(sessionFixture.raw),
    },
    data_quality: sessionFixture.data_quality ?? {
      missing_fields: [],
      warnings: [],
    },
    session: {
      date: sessionFixture.date,
      title: sessionFixture.title,
      sport: sessionFixture.sport,
      session_type: sessionFixture.sessionType,
      schema_type: sessionFixture.schemaType,
      summary: sessionFixture.summary ?? {},
      blocks: sessionFixture.blocks ?? [],
      blocks_count: Array.isArray(sessionFixture.blocks) ? sessionFixture.blocks.length : 0,
    },
  };
}


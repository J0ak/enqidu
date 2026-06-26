function firstSession(raw) {
  if (Array.isArray(raw?.sessions) && raw.sessions.length > 0) return raw.sessions[0];
  if (raw?.session && typeof raw.session === "object") return raw.session;
  return null;
}

function collectBlocks(raw) {
  if (Array.isArray(raw?.blocks)) return raw.blocks;
  if (Array.isArray(raw?.structure?.blocks)) return raw.structure.blocks;
  if (Array.isArray(raw?.session?.blocks)) return raw.session.blocks;
  if (!Array.isArray(raw?.sessions)) return [];

  return raw.sessions.flatMap((session) => {
    if (Array.isArray(session?.blocks)) return session.blocks;
    if (Array.isArray(session?.structure?.blocks)) return session.structure.blocks;
    return [];
  });
}

function resolveSummary(raw, session) {
  if (raw?.summary && typeof raw.summary === "object") return raw.summary;
  if (raw?.daily_summary && typeof raw.daily_summary === "object") return raw.daily_summary;
  if (raw?.daily_totals && typeof raw.daily_totals === "object") return raw.daily_totals;
  if (session?.summary && typeof session.summary === "object") return session.summary;
  if (session?.session_overview && typeof session.session_overview === "object") {
    return session.session_overview;
  }
  return {};
}

function missingFieldsForSession(normalized) {
  return ["date", "title", "sport", "sessionType"].filter((field) => normalized[field] == null);
}

export function normalizeJotasonSession(raw, { file, sourcePath = null } = {}) {
  const session = firstSession(raw);
  const normalized = {
    schema_version: "enqidu_session_fixture_adapter_v0",
    product: "ENQIDU",
    fixture_user: "jotason",
    source: {
      file: file ?? null,
      fixture: "jotason",
      role: "session_fixture",
    },
    source_traceability: {
      file: file ?? null,
      source_path: sourcePath,
      fixture_user: "jotason",
      role: "session_fixture",
    },
    schemaType: raw?.schema_version ?? raw?.jotason_version ?? raw?.template_source ?? null,
    date: raw?.date ?? raw?.day_date ?? session?.date ?? session?.start_date ?? null,
    title:
      raw?.title ??
      raw?.objective_primary ??
      raw?.objective_of_day ??
      session?.title ??
      session?.session_title ??
      null,
    sport: raw?.sport ?? raw?.activity_type ?? session?.sport ?? session?.activity_type ?? null,
    sessionType:
      raw?.session_type ??
      raw?.sessionType ??
      raw?.day_type ??
      session?.session_type ??
      session?.sport_subtype ??
      null,
    summary: resolveSummary(raw, session),
    blocks: collectBlocks(raw),
    raw,
  };

  normalized.data_quality = {
    missing_fields: missingFieldsForSession(normalized),
    warnings: [],
  };

  if (!Array.isArray(raw?.sessions) && !raw?.session) {
    normalized.data_quality.warnings.push("no_explicit_session_collection");
  }
  if (normalized.blocks.length === 0) {
    normalized.data_quality.warnings.push("no_blocks_detected");
  }

  return normalized;
}

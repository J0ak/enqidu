import { assertCoachContextRelativePath, toPosixPath } from "./paths.js";

const SECRET_PATTERNS = [
  { label: "SUPABASE_URL", pattern: /SUPABASE_URL/i },
  { label: "SUPABASE_SERVICE_ROLE", pattern: /SUPABASE_SERVICE_ROLE/i },
  { label: "service_role", pattern: /\bservice[_-]?role\b/i },
  { label: "anon_key", pattern: /\banon[_-]?key\b/i },
  { label: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { label: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { label: "token", pattern: /\b(access|refresh|api)[_-]?token\b/i },
  {
    label: "private_url",
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i,
  },
];

function scanForSecrets(value) {
  const serialized = JSON.stringify(value);
  if (!serialized) return [];

  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(serialized)).map(({ label }) => label);
}

function collectTraceabilityPaths(value, paths = []) {
  if (!value || typeof value !== "object") return paths;

  if (Array.isArray(value)) {
    for (const item of value) collectTraceabilityPaths(item, paths);
    return paths;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (typeof nestedValue === "string" && isTraceabilityPathKey(key, nestedValue)) {
      paths.push(nestedValue);
    } else {
      collectTraceabilityPaths(nestedValue, paths);
    }
  }

  return paths;
}

function isTraceabilityPathKey(key, value) {
  const normalizedKey = key.toLowerCase();
  if (!value.includes("/") && !value.includes("\\")) return false;

  return (
    normalizedKey.includes("path") ||
    normalizedKey.includes("file") ||
    normalizedKey === "generated_from" ||
    normalizedKey === "normalized_root"
  );
}

export function validateCoachContextTraceability(value) {
  const errors = [];
  const warnings = [];
  const paths = collectTraceabilityPaths(value);

  for (const pathValue of paths) {
    const normalized = toPosixPath(pathValue);
    if (normalized === "docs/coach-context" || normalized.startsWith("docs/coach-context/")) {
      continue;
    }

    try {
      assertCoachContextRelativePath(normalized);
    } catch {
      errors.push(`source_traceability_path_outside_docs_coach_context:${pathValue}`);
    }
  }

  return { errors, warnings };
}

export function validateNormalizedCoachContext(payload) {
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      valid: false,
      errors: ["payload_must_be_object"],
      warnings,
    };
  }

  if (payload.product !== "ENQIDU") errors.push("product_must_be_ENQIDU");
  if (!payload.fixture_user) errors.push("fixture_user_required");
  if (!payload.schema_version) errors.push("schema_version_required");
  if (!payload.source_traceability) errors.push("source_traceability_required");
  if (!payload.data_quality) warnings.push("data_quality_missing");

  for (const secret of scanForSecrets(payload)) {
    errors.push(`forbidden_secret_pattern:${secret}`);
  }

  const traceability = validateCoachContextTraceability(payload.source_traceability ?? {});
  errors.push(...traceability.errors);
  warnings.push(...traceability.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}


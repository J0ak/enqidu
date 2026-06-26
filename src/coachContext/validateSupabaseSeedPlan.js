import { validateCoachContextTraceability } from "./validateNormalizedCoachContext.js";

const EXPECTED_WOULD_CREATE_KEYS = [
  "athlete_profiles",
  "athlete_training_goals",
  "athlete_constraints",
  "athlete_equipment_locations",
  "athlete_equipment_items",
  "coach_context_sources",
  "coach_context_snapshots",
  "coach_session_fixtures",
  "coach_session_blocks",
  "coach_session_exercises",
  "coach_seed_runs",
];

const FORBIDDEN_PLAN_PATTERNS = [
  { label: "SUPABASE_URL", pattern: /SUPABASE_URL/i },
  { label: "SUPABASE_SERVICE_ROLE", pattern: /SUPABASE_SERVICE_ROLE/i },
  { label: "service_role", pattern: /\bservice[_-]?role\b/i },
  { label: "anon_key", pattern: /\banon[_-]?key\b/i },
  { label: "supabase_client_import", pattern: /@supabase\/supabase-js/i },
  { label: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { label: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { label: "token", pattern: /\b(access|refresh|api)[_-]?token\b/i },
  {
    label: "private_url",
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i,
  },
  { label: "network_fetch", pattern: /\bfetch\s*\(/i },
  { label: "real_write_command", pattern: /\b(insert|update|delete|upsert|execute_sql|apply_migration)\s*\(/i },
];

export function expectedSupabaseSeedPlanTables() {
  return [...EXPECTED_WOULD_CREATE_KEYS];
}

export function validateSupabaseSeedPlan(plan) {
  const errors = [];
  const warnings = [];

  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return {
      valid: false,
      errors: ["payload_must_be_object"],
      warnings,
    };
  }

  if (plan.schema_version !== "enqidu_supabase_seed_plan_v0") {
    errors.push("schema_version_must_be_enqidu_supabase_seed_plan_v0");
  }
  if (plan.product !== "ENQIDU") errors.push("product_must_be_ENQIDU");
  if (!plan.fixture_user) errors.push("fixture_user_required");
  if (plan.mode !== "dry_run") errors.push("mode_must_be_dry_run");
  if (!plan.would_create || typeof plan.would_create !== "object") {
    errors.push("would_create_required");
  }
  if (!plan.source_traceability) errors.push("source_traceability_required");

  for (const key of EXPECTED_WOULD_CREATE_KEYS) {
    if (!Array.isArray(plan.would_create?.[key])) {
      errors.push(`would_create_missing_array:${key}`);
    }
  }

  const serialized = JSON.stringify(plan);
  for (const { label, pattern } of FORBIDDEN_PLAN_PATTERNS) {
    if (pattern.test(serialized)) errors.push(`forbidden_pattern:${label}`);
  }

  const traceability = validateCoachContextTraceability(plan.source_traceability ?? {});
  errors.push(...traceability.errors);
  warnings.push(...traceability.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}


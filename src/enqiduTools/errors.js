const codes = new Set([
  "auth_required", "invalid_user", "identity_changed", "profile_timezone_required", "profile_calendar_required",
  "unknown_tool", "invalid_arguments", "invalid_date", "invalid_duration", "invalid_location", "invalid_environment",
  "invalid_target_weekday", "invalid_target_date", "invalid_calendar", "invalid_request_time", "method_not_allowed",
  "explicit_confirmation_required", "preview_required", "preview_stale", "mcp_writes_disabled", "writes_disabled",
  "mutation_unavailable", "canonical_read_unavailable", "canonical_read_failed", "canonical_state_limit",
  "session_not_found", "proposal_not_found", "ambiguous_proposal", "proposal_not_actionable",
  "source_plan_not_found", "source_plan_ambiguous", "source_plan_already_completed", "source_plan_not_adaptable",
  "target_plan_already_exists", "target_date_unavailable", "training_unavailable", "source_date_unavailable",
  "stale_plan_source_date", "unsupported_plan_source", "duration_adaptation_unavailable", "recommendation_unavailable",
  "unsupported_recommendation_type", "remaining_week_plan_ambiguous", "remaining_week_capacity_exhausted",
  "invalid_week_range", "invalid_planned_session", "plan_adaptation_rejected", "plan_move_rejected",
  "plan_cancellation_rejected", "remaining_week_adaptation_rejected", "action_rejected", "output_limit_exceeded",
  "output_contract_violation", "server_configuration_error", "tool_failed", "invalid_request", "request_too_large",
]);
const messages = {
  auth_required: "Inicia sesión para utilizar ENQIDU.", invalid_user: "La sesión no es válida. Vuelve a iniciar sesión.",
  profile_timezone_required: "Configura la zona horaria del perfil antes de continuar.",
  preview_stale: "El estado o la vigencia del cambio ha variado. Revisa una nueva propuesta antes de aplicar.",
  explicit_confirmation_required: "Revisa el cambio y confirma explícitamente que quieres aplicarlo.",
  mcp_writes_disabled: "Las modificaciones por MCP están desactivadas.",
  session_not_found: "No encuentro esa sesión en tus entrenamientos.",
  source_plan_not_found: "No encuentro la sesión planificada. Vuelve a consultar tu plan.",
  source_plan_ambiguous: "Hay varias sesiones en esa fecha; no se puede aplicar un cambio ambiguo.",
  proposal_not_actionable: "Esta propuesta requiere revisión y no tiene un cambio aplicable en esta versión.",
  target_date_unavailable: "La fecha de destino no está disponible para entrenar.",
  target_plan_already_exists: "Ya tienes una sesión planificada en la fecha de destino.",
};
export function safeToolError(value) {
  const candidate = typeof value === "string" ? value : value?.code;
  const code = codes.has(candidate) ? candidate : "tool_failed";
  return { code, safe_message: messages[code] || "No se ha podido completar la solicitud. Revisa los datos e inténtalo de nuevo." };
}
export function toolError(code) {
  return Object.assign(new Error(code), { code });
}

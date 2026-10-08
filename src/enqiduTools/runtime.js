import { isValidTimeZone, resolveUserCalendar } from "../time/userCalendar.js";
import { getEnqiduTool, ENQIDU_TOOLS_VERSION, TOOL_VERSION } from "./registry.js";
import { matchesSchema } from "./schema.js";
import { safeToolError, toolError } from "./errors.js";
import { createEnqiduReadDomain, resolveClosedLoopAction } from "./readTools.js";
import { prepareEnqiduAction, bindEnqiduActionEvidence, executePreparedEnqiduAction } from "./actions.js";
import { buildEnqiduActionPreview, validateEnqiduActionPreview } from "./actionPreview.js";

export const MAX_TOOL_OUTPUT_BYTES = 131072;
const sources = new Set(["app", "coach", "mcp", "agent"]);
const instant = (now) => {
  const result = new Date(typeof now === "function" ? now() : now ?? Date.now());
  if (!Number.isFinite(result.getTime())) throw toolError("invalid_request_time");
  return result;
};

/** The only identity constructor: authentication + persisted profile, never tool args. */
export async function createToolExecutionContext({ db, source = "app", now, capabilities = {} } = {}) {
  if (!db?.auth?.getUser) throw toolError("auth_required");
  const auth = await db.auth.getUser();
  const userId = auth?.data?.user?.id;
  if (auth?.error || typeof userId !== "string" || !userId) throw toolError("invalid_user");
  const profile = await db.from("profiles").select("timezone").eq("id", userId).limit(1);
  if (profile.error) throw toolError("canonical_read_unavailable");
  const timezone = profile.data?.[0]?.timezone;
  if (!isValidTimeZone(timezone)) throw toolError("profile_timezone_required");
  const at = instant(now);
  const calendar = resolveUserCalendar({ profileTimezone: timezone, now: at });
  if (!calendar.ok || !calendar.date) throw toolError("invalid_calendar");
  if (!sources.has(source)) throw toolError("invalid_request");
  return Object.freeze({
    authenticated_user_id: userId, profile_timezone: calendar.timezone, request_calendar_date: calendar.date,
    request_id: globalThis.crypto.randomUUID(), source, generated_at: at.toISOString(),
    capabilities: Object.freeze({ reads: true, previews: true, writes: source === "mcp" ? capabilities.writes === true : capabilities.writes !== false }),
  });
}

/** One authenticated runtime, closed registry; no generic query/RPC/mutation interface. */
export async function createEnqiduToolRuntime({ db, adminDb = null, source = "app", now, capabilities = {}, observe = () => {} } = {}) {
  let context = await createToolExecutionContext({ db, source, now, capabilities });
  const originalUserId = context.authenticated_user_id;
  let domain;
  const calendarFor = (scope) => ({ date: scope.request_calendar_date, timezone: scope.profile_timezone });
  const newDomain = (scope) => createEnqiduReadDomain({ db, userId: scope.authenticated_user_id, calendar: calendarFor(scope), now: new Date(scope.generated_at) });
  domain = newDomain(context);
  let firstInvocation = true;

  async function refresh() {
    // Runtime instances may be retained by a local consumer. Never retain an
    // old calendar, revoked identity or a cached preview state across requests.
    if (!firstInvocation) {
      context = await createToolExecutionContext({ db, source, now, capabilities });
      if (context.authenticated_user_id !== originalUserId) throw toolError("identity_changed");
      domain = newDomain(context);
    }
    firstInvocation = false;
  }
  function envelope(tool, scope) {
    return { tool: getEnqiduTool(tool)?.id || "unknown", tool_version: TOOL_VERSION, ok: true, data: null,
      warnings: [], evidence: [], traceability: { request_id: scope.request_id, source: scope.source, registry_version: ENQIDU_TOOLS_VERSION, domain_handler: getEnqiduTool(tool)?.domain_handler || "unknown" },
      generated_at: scope.generated_at, calendar_date: scope.request_calendar_date, timezone: scope.profile_timezone };
  }
  async function invoke(toolId, args, scope, readDomain) {
    const started = performance.now();
    const result = envelope(toolId, scope);
    let definition;
    let acknowledgedActionReceipt = null;
    try {
      definition = getEnqiduTool(toolId);
      if (!definition) throw toolError("unknown_tool");
      if (definition.access === "write" && !scope.capabilities.writes) throw toolError(scope.source === "mcp" ? "mcp_writes_disabled" : "writes_disabled");
      if (definition.access === "write" && args?.confirmation !== true) throw toolError("explicit_confirmation_required");
      if (!matchesSchema(args, definition.input_schema) || new TextEncoder().encode(JSON.stringify(args)).length > 8192) throw toolError("invalid_arguments");
      if (definition.access === "read") {
        result.data = await readDomain.read(toolId, args);
      } else {
        const isApply = definition.access === "write";
        // Every apply reauthenticates, even the first invocation, then rereads
        // all relevant state. No preview object or client changes are accepted.
        if (isApply) {
          const rechecked = await createToolExecutionContext({ db, source, now, capabilities });
          if (rechecked.authenticated_user_id !== scope.authenticated_user_id) throw toolError("identity_changed");
          if (rechecked.request_calendar_date !== scope.request_calendar_date || rechecked.profile_timezone !== scope.profile_timezone) throw toolError("preview_stale");
          if (!adminDb?.rpc) throw toolError("mutation_unavailable");
          readDomain = newDomain(rechecked);
        }
        const { fingerprint, expires_at, confirmation, ...actionArgs } = args;
        const action = toolId.replace(/^(preview|apply)_/, "");
        let resolved;
        try {
          resolved = action === "closed_loop_proposal" ? await resolveClosedLoopAction({ domain: readDomain, args: actionArgs }) : { action, args: actionArgs };
        } catch (error) {
          if (isApply) throw toolError("preview_stale");
          throw error;
        }
        let prepared = await prepareEnqiduAction({ db, userId: scope.authenticated_user_id, calendar: calendarFor(scope), action: resolved.action, args: resolved.args,
          now: new Date(scope.generated_at), targetSelection: action === "closed_loop_proposal" ? "closed_loop_target" : "action" });
        if (!prepared.ok) throw toolError(isApply ? "preview_stale" : prepared.error);
        if (action === "closed_loop_proposal") prepared = bindEnqiduActionEvidence(prepared, { policy_version: resolved.policy_version, proposal: resolved.proposal, assessment: resolved.assessment });
        const preview = await buildEnqiduActionPreview({ prepared, calendar: calendarFor(scope), now: new Date(scope.generated_at) });
        if (!matchesSchema(preview, getEnqiduTool(`preview_${action}`).data_schema)) throw toolError("output_contract_violation");
        if (!isApply) result.data = preview;
        else {
          const validation = await validateEnqiduActionPreview({ prepared, fingerprint, expiresAt: expires_at, now: instant(now) });
          if (!validation.ok) throw toolError("preview_stale");
          // Validate the bounded fallback before entering the writer. Once the
          // existing action acknowledges success, reporting failures cannot turn
          // that acknowledged mutation into an error that invites a retry.
          const receipt = {
            ok: true, action: prepared.action, response_mode: "deterministic_action",
            llm_used: false, usage: null, request_date: scope.request_calendar_date,
            calendar_timezone: scope.profile_timezone, persistence_verified: false,
          };
          if (!matchesSchema(receipt, definition.data_schema)) throw toolError("output_contract_violation");
          const applied = await executePreparedEnqiduAction({ adminDb, userId: scope.authenticated_user_id, prepared });
          if (!applied.ok) throw toolError(applied.error);
          acknowledgedActionReceipt = receipt;
          result.data = applied;
          // Commit already happened. A failed readback must never be reported as
          // a failed mutation (which could encourage duplicate retries).
          try {
            result.data.persisted_plan = await newDomain(scope).read("get_week_plan", {});
            result.data.persistence_verified = true;
          } catch {
            result.data.persistence_verified = false;
            result.warnings.push("persisted_plan_readback_unavailable");
          }
        }
      }
      // Validate serialized wire data, not objects with omitted undefined fields.
      result.data = JSON.parse(JSON.stringify(result.data));
      if (!matchesSchema(result.data, definition.data_schema)) throw toolError("output_contract_violation");
      result.evidence = result.data?.schema_version ? [{ kind: definition.access === "read" ? "canonical_domain" : "action_preview", schema_version: result.data.schema_version }] : [];
      if (definition.access === "preview") result.warnings.push(...result.data.warnings);
      if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_TOOL_OUTPUT_BYTES) throw toolError("output_limit_exceeded");
    } catch (error) {
      if (acknowledgedActionReceipt) {
        result.ok = true;
        result.data = acknowledgedActionReceipt;
        result.evidence = [];
        result.warnings = ["applied_result_details_unavailable"];
        delete result.error;
      } else {
        result.ok = false; result.data = null; result.evidence = []; result.error = safeToolError(error);
      }
    } finally {
      // No arguments, JWT, identity, health values or error details in telemetry.
      try { await observe(Object.freeze({ request_id: scope.request_id, tool_id: definition?.id || "unknown", tool_version: TOOL_VERSION, timestamp: scope.generated_at, status: result.ok ? "ok" : "error", duration_ms: Math.round(performance.now() - started), error_code: result.error?.code || null })); } catch { /* Telemetry never changes domain behavior. */ }
    }
    return result;
  }
  return Object.freeze({
    get context() { return context; },
    async execute(tool, args = {}) {
      try { await refresh(); }
      catch (error) { return { ...envelope(tool, context), ok: false, error: safeToolError(error) }; }
      return invoke(tool, args, context, domain);
    },
    async executeMany(requests) {
      if (!Array.isArray(requests) || !requests.length || requests.length > 9 || requests.some((request) => getEnqiduTool(request?.tool)?.access !== "read")) throw toolError("invalid_request");
      await refresh();
      // Intentional only-read batching shares health, plan and assessment loads.
      return Promise.all(requests.map(({ tool, arguments: args = {} }) => invoke(tool, args, context, domain)));
    },
    // Trusted first-party presentation only; absent from registry/transports.
    canonicalCoachContext(date) { return domain.canonicalCoachContext(date); },
  });
}

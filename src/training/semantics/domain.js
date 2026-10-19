import { exerciseCatalog } from "../exerciseCatalog.js";
import { matchesSchema } from "../../enqiduTools/schema.js";
import { toolError } from "../../enqiduTools/errors.js";
import { COMMAND_SCHEMA, STATE_SCHEMA, VERSION } from "./contract.js";
export const normalizeExactName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
export function resolveExactExercise(value) {
  const key = normalizeExactName(value);
  const matches = exerciseCatalog.filter((e) =>
    [e.canonical_slug, e.display_name_es, e.display_name_en, ...e.aliases].some(
      (a) => normalizeExactName(a) === key,
    ),
  );
  return matches.length === 1 ? matches[0] : null;
}
export function patchExercises(exercises, operations) {
  const result = structuredClone(exercises);
  for (const operation of operations) {
    const { op, target, value } = operation;
    let e = result.find((e) => e.id === target);
    if (op === "add_exercise") {
      if (e) throw toolError("invalid_arguments");
      e = {
        id: target,
        block_id: null,
        exercise_id: null,
        reported_name: operation.reported_name.trim(),
        execution_type: "performed",
        data_confidence: "reported",
        sets_completed: null,
        reps_per_set: null,
        load_value: null,
        load_unit: null,
        rounds_completed: null,
        side: null,
        tempo_or_pause: null,
        notes: null,
        technical_note: null,
      };
      result.push(e);
    } else if (!e) throw toolError("invalid_arguments");
    e.data_confidence = "reported";
    switch (op) {
      case "rename_exercise":
        e.reported_name = operation.reported_name.trim();
        e.exercise_id = null;
        break;
      case "set_reps":
        e.reps_per_set = [...operation.reps];
        e.sets_completed = operation.reps.length;
        break;
      case "set_last_reps":
        if (
          !e.reps_per_set?.length ||
          e.reps_per_set.some((n) => !Number.isInteger(n) || n < 0 || n > 1000)
        )
          throw toolError("invalid_arguments");
        e.reps_per_set[e.reps_per_set.length - 1] = value;
        e.sets_completed = e.reps_per_set.length;
        break;
      case "set_sets":
        if (e.reps_per_set?.length && e.reps_per_set.length !== value)
          throw toolError("invalid_arguments");
        e.sets_completed = value;
        break;
      case "set_load":
        e.load_value = value;
        e.load_unit = operation.unit;
        break;
      case "set_rounds":
        e.rounds_completed = value;
        break;
      case "set_side":
        e.side = value;
        break;
      case "set_tempo":
        e.tempo_or_pause = value;
        break;
      case "append_note":
        e.notes = [e.notes, value].filter(Boolean).join("\n");
        if (e.notes.length > 4000) throw toolError("invalid_arguments");
        break;
      case "set_technical_note":
        e.technical_note = value;
        break;
      case "set_omitted":
        e.execution_type = value ? "skipped" : "performed";
        break;
    }
  }
  if (result.length > 200) throw toolError("canonical_state_limit");
  return result;
}
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export async function semanticFingerprint(userId, args, signingKey) {
  if (typeof signingKey !== "string" || signingKey.length < 32)
    throw toolError("mutation_unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      JSON.stringify(
        canonical({
          version: VERSION,
          userId,
          channel: args.channel,
          session_id: args.session_id,
          operations: args.operations,
          revision: args.revision,
          expires_at: args.expires_at,
        }),
      ),
    ),
  );
  return (
    "sha256:" +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export async function readSemanticState(db, sessionId) {
  const { data, error } = await db.rpc("read_training_semantics_v1", {
    p_session_id: sessionId,
  });
  if (error) throw toolError("canonical_read_unavailable");
  if (!data) throw toolError("session_not_found");
  const state = { ...data, llm_used: false, usage: null };
  if (!matchesSchema(state, STATE_SCHEMA))
    throw toolError("canonical_state_limit");
  return state;
}
export async function previewSemanticCorrection({
  db,
  userId,
  args,
  now,
  signingKey,
  channel = "app",
}) {
  if (!matchesSchema(args, COMMAND_SCHEMA))
    throw toolError("invalid_arguments");
  const state = await readSemanticState(db, args.session_id);
  const after = patchExercises(state.exercises, args.operations);
  const expires_at = new Date(new Date(now).getTime() + 300000).toISOString();
  const fingerprint = await semanticFingerprint(
    userId,
    { ...args, channel, revision: state.revision, expires_at },
    signingKey,
  );
  return {
    schema_version: VERSION,
    session_id: state.session_id,
    title: state.title,
    local_date: state.local_date,
    before: state.exercises,
    after,
    operations: args.operations,
    channel,
    revision: state.revision,
    fingerprint,
    expires_at,
    requires_confirmation: true,
    warnings: [],
    llm_used: false,
    usage: null,
  };
}
export async function applySemanticCorrection({
  db,
  adminDb,
  userId,
  args,
  source,
  now,
  signingKey,
}) {
  if (
    args.fingerprint !== (await semanticFingerprint(userId, args, signingKey))
  )
    throw toolError("preview_stale");
  // Ownership is checked before the service-only RPC, including retries.
  const owned = await db
    .from("training_sessions")
    .select("id")
    .eq("id", args.session_id)
    .eq("user_id", userId)
    .limit(1);
  if (owned.error) throw toolError("canonical_read_unavailable");
  if (!owned.data?.length) throw toolError("session_not_found");
  const { data, error } = await adminDb.rpc("apply_training_semantics_v1", {
    p_user_id: userId,
    p_session_id: args.session_id,
    p_revision: args.revision,
    p_fingerprint: args.fingerprint,
    p_expires_at: args.expires_at,
    p_operations: args.operations,
    p_channel: args.channel,
  });
  if (error)
    throw toolError(
      error.message?.includes("preview_stale")
        ? "preview_stale"
        : "action_rejected",
    );
  if (!data?.applied)
    throw toolError(
      data?.error === "preview_stale" ? "preview_stale" : "action_rejected",
    );
  return { ...data, persistence_verified: false, llm_used: false, usage: null };
}

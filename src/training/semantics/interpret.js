import { parseMaterialization } from "../materialization/parser.js";
import { compileMaterialization } from "../materialization/compile.js";
import { loadExerciseCatalog } from "../catalogResolver.js";
import { readSemanticState, previewSemanticCorrection } from "./domain.js";
import { shiftHealthCalendarDate } from "../../health/healthEvidence.js";
import { isValidCalendarDate } from "../../time/userCalendar.js";
import { toolError } from "../../enqiduTools/errors.js";
export async function interpretSemanticCorrection({
  db,
  userId,
  args,
  calendar,
  now,
  signingKey,
}) {
  const facts = parseMaterialization(args.text);
  const parsed = { date_reference: facts.session_resolution.date_reference };
  const result = {
    status: "needs_clarification",
    message:
      "No puedo interpretar todos los datos con seguridad. Elige la actividad y usa el editor.",
    sessions: [],
    exercises: [],
    preview: null,
    llm_used: false,
    usage: null,
  };
  let date = calendar.date;
  if (parsed?.date_reference === "yesterday")
    date = shiftHealthCalendarDate(date, -1);
  else if (parsed && !["today", "yesterday"].includes(parsed.date_reference)) {
    const [d, m, y] = parsed.date_reference.split("/");
    date = `${y || date.slice(0, 4)}-${(m || date.slice(5, 7)).padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isValidCalendarDate(date)) return result;
  }
  let sessionId = args.session_id;
  if (!sessionId) {
    const sessions = await db
      .from("training_sessions")
      .select("id,title,local_date")
      .eq("user_id", userId)
      .eq("local_date", date)
      .neq("session_status", "archived")
      .order("id")
      .limit(21);
    if (sessions.error) throw toolError("canonical_read_unavailable");
    if (sessions.data.length > 20) throw toolError("canonical_state_limit");
    result.sessions = sessions.data;
    if (sessions.data.length !== 1) {
      result.message = sessions.data.length
        ? "¿A qué actividad te refieres? Elige una sesión."
        : "No encuentro una actividad en esa fecha. Abre el detalle de la actividad que quieres corregir.";
      return result;
    }
    sessionId = sessions.data[0].id;
  }
  const state = await readSemanticState(db, sessionId);
  result.sessions = [
    { id: state.session_id, title: state.title, local_date: state.local_date },
  ];
  result.exercises = state.exercises.map((e) => ({
    id: e.id,
    reported_name: e.reported_name,
  }));
  if (facts.unresolved_facts.length)
    return { ...result, materialization: facts };
  const catalog = await loadExerciseCatalog(db);
  const compiled = compileMaterialization(
    facts,
    state,
    catalog,
    args.exercise_target,
  );
  result.materialization = compiled.facts;
  result.status = compiled.status;
  if (compiled.status === "needs_clarification") {
    result.message =
      compiled.facts.unresolved_facts[0]?.reason || result.message;
    return result;
  }
  if (compiled.status === "already_materialized") {
    result.message =
      "Estos datos ya están registrados. No hay cambios que aplicar.";
    return result;
  }
  const materialization = {
    original_text: args.text,
    facts: compiled.facts,
    generated_at: new Date(now).toISOString(),
  };
  const boundedApply = {
    session_id: sessionId,
    operations: compiled.operations,
    materialization,
    channel: "coach",
    revision: "a".repeat(64),
    fingerprint: "sha256:" + "a".repeat(64),
    expires_at: new Date(now).toISOString(),
    confirmation: true,
  };
  if (new TextEncoder().encode(JSON.stringify(boundedApply)).length > 8192) {
    result.status = "needs_clarification";
    result.message =
      "Son demasiados datos para un único cambio. Usa el editor o divide el texto.";
    return result;
  }
  result.preview = await previewSemanticCorrection({
    db,
    userId,
    args: { session_id: sessionId, operations: compiled.operations },
    materialization,
    now,
    signingKey,
    channel: "coach",
  });
  result.message = "He entendido estos cambios. Revísalos antes de confirmar.";
  return result;
}

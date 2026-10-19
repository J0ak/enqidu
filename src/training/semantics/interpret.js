import { parseSemanticSpanish } from "./parser.js";
import {
  readSemanticState,
  previewSemanticCorrection,
  normalizeExactName,
  resolveExactExercise,
} from "./domain.js";
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
  const parsed = parseSemanticSpanish(args.text);
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
  if (!parsed) return result;
  let target = args.exercise_target;
  if (target && !state.exercises.some((e) => e.id === target))
    throw toolError("invalid_arguments");
  if (!target && parsed.exercise_name) {
    const canonical = resolveExactExercise(parsed.exercise_name);
    const matches = state.exercises.filter(
      (e) =>
        normalizeExactName(e.reported_name) ===
          normalizeExactName(parsed.exercise_name) ||
        (canonical &&
          resolveExactExercise(e.reported_name)?.id === canonical.id),
    );
    if (matches.length === 1) target = matches[0].id;
    else if (matches.length > 1) {
      result.message =
        "Ese ejercicio aparece varias veces. Elige cuál quieres corregir.";
      return result;
    }
  }
  const operations = [];
  if (!target) {
    if (
      !parsed.exercise_name ||
      parsed.changes.some((c) =>
        ["rename_exercise", "set_omitted", "set_last_reps"].includes(c.op),
      )
    ) {
      result.message = "Elige el ejercicio al que se refiere el cambio.";
      return result;
    }
    target = crypto.randomUUID();
    operations.push({
      op: "add_exercise",
      target,
      reported_name: parsed.exercise_name,
    });
  }
  operations.push(...parsed.changes.map((c) => ({ ...c, target })));
  result.preview = await previewSemanticCorrection({
    db,
    userId,
    args: { session_id: sessionId, operations },
    now,
    signingKey,
    channel: "coach",
  });
  result.status = "preview_ready";
  result.message = "He entendido estos cambios. Revísalos antes de confirmar.";
  return result;
}

import { parseSemanticSpanish } from "../semantics/parser.js";
import { normalizeExactName } from "../catalogResolver.js";
import { MATERIALIZATION_VERSION, MATERIALIZATION_SCHEMA } from "./contract.js";
import { matchesSchema } from "../../enqiduTools/schema.js";

function clauseFacts(raw, index) {
  if (/\b(?:unos|aproximadamente|quiza|quizás|tal vez)\b/i.test(raw))
    return null;
  let input = raw.trim(),
    prefix = input.match(/^(?:hoy|ayer)\s+/i);
  if (prefix) input = input.slice(prefix[0].length);
  // Factual named observation: retain #103 compilation/preview authority.
  input = input.replace(/^hice (.+?) (\d{1,3}\s*x\s*\d{1,4})(?: (?:a|con) (\d{1,4}(?:[.,]\d{1,2})?) (kg|lb))?$/i,
    (_, name, reps, load, unit) => `${name} ${reps}${load ? ` con ${load} ${unit}` : ""}`);
  let reason;
  const omitted = input.match(/^no hice (.+?) porque (.{1,500})$/i);
  if (omitted) {
    input = `no hice ${omitted[1]}`;
    reason = omitted[2];
  }
  let suffixSide = false,
    tempo;
  const pause = input.match(/[, ]+pausa de (\d{1,3}) segundos$/i);
  if (pause) {
    tempo = `pausa de ${Number(pause[1])} segundos`;
    input = input.slice(0, pause.index).trim();
  }
  if (/ por lado$/i.test(input)) {
    suffixSide = true;
    input = input.replace(/ por lado$/i, "");
  }
  let parsed = parseSemanticSpanish(
    /^por lado$/i.test(input) ? "fue por lado" : input,
  );
  if (!parsed) {
    const last =
      input.match(/^(?:la )?última serie (\d{1,4})$/i) ||
      input.match(/^(?:la )?ultima serie (\d{1,4})$/i);
    if (last)
      parsed = {
        exercise_name: null,
        date_reference: "today",
        changes: [{ op: "set_last_reps", value: Number(last[1]) }],
      };
  }
  if (!parsed) {
    // The name is separated by syntax (a complete metric expression), never by substring catalog matching.
    const named = input.match(
      /^(?:en (?:el |la )?)?(.+?)\s+(?=(?:\d|hice\s+\d))(.+)$/i,
    );
    if (named && /^(?:hice|fueron|eran)$/i.test(named[1])) return null;
    const metric = named ? named[2].replace(/^hice\s+/i, "") : input;
    const reps = metric.match(
      /^(\d+(?:,\s*\d+)*(?: y \d+)?)(?: reps| repeticiones)?$/i,
    );
    const p =
      reps && (named || /[, ]|reps|repeticiones/.test(metric))
        ? {
            changes: [
              { op: "set_reps", reps: reps[1].split(/,\s*| y /i).map(Number) },
            ],
            date_reference: "today",
          }
        : parseSemanticSpanish(`hice ${metric}`);
    if (p && (!p.exercise_name || !named))
      parsed = { ...p, exercise_name: named?.[1] || p.exercise_name || null };
  }
  if (!parsed) return null;
  const execution = {},
    exercise = {
      resolution_state: parsed.exercise_name ? "parsed" : "missing",
    };
  if (parsed.exercise_name) exercise.reported_name = parsed.exercise_name;
  let notes, technical_note;
  for (const c of parsed.changes) {
    if (c.op === "set_reps") {
      execution.reps_per_set = c.reps;
      execution.sets_completed = c.reps.length;
    } else if (c.op === "set_load") {
      execution.load_value = c.value;
      execution.load_unit = c.unit;
    } else if (c.op === "set_omitted") execution.performed = !c.value;
    else if (c.op === "rename_exercise") exercise.rename_to = c.reported_name;
    else if (c.op === "append_note") notes = c.value;
    else if (c.op === "set_technical_note") technical_note = c.value;
    else {
      const field = {
        set_last_reps: "last_reps",
        set_sets: "sets_completed",
        set_rounds: "rounds_completed",
        set_side: "side",
        set_tempo: "tempo_or_pause",
      }[c.op];
      if (field) execution[field] = c.value;
    }
  }
  if (
    execution.performed === undefined &&
    /\bhice\b/i.test(input) &&
    !/^no hice/i.test(input)
  )
    execution.performed = true;
  if (reason) notes = reason;
  if (suffixSide) execution.side = "each_side";
  if (tempo) execution.tempo_or_pause = tempo;
  return {
    observation: {
      exercise,
      execution,
      ...(notes ? { notes } : {}),
      ...(technical_note ? { technical_note } : {}),
      confidence: "explicit",
      provenance: { clause: raw, index },
      state: "parsed",
    },
    date_reference: prefix
      ? normalizeExactName(prefix[0]) === "ayer"
        ? "yesterday"
        : "today"
      : parsed.date_reference,
  };
}
export function parseMaterialization(text) {
  const facts = {
    schema_version: MATERIALIZATION_VERSION,
    session_resolution: { state: "missing", date_reference: "today" },
    observations: [],
    unresolved_facts: [],
    warnings: [],
  };
  const fail = (value, reason, state = "unresolved") =>
    facts.unresolved_facts.push({
      text: String(value).slice(0, 2000),
      reason,
      state,
    });
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    fail(text, "Texto vacío o fuera del límite de 2000 caracteres");
    return facts;
  }
  // Notes are opaque evidence. Do not split their prose into commands.
  const clauses = /^(añade|anade) que /i.test(text.trim())
    ? [text.trim()]
    : text
        .trim()
        .split(/\s*(?:;|\n|\.(?=\s|$))\s*/)
        .filter(Boolean);
  if (clauses.length > 10) {
    fail(text, "Máximo 10 observaciones");
    return facts;
  }
  let date;
  for (const [index, clause] of clauses.entries()) {
    const p = clauseFacts(clause, index);
    if (!p) {
      fail(clause, "Frase no admitida; usa el editor");
      continue;
    }
    if (index === 0) date = p.date_reference;
    else if (
      (p.date_reference !== "today" || /^(?:hoy|ayer)\b/i.test(clause)) &&
      p.date_reference !== date
    )
      fail(clause, "Fechas incompatibles", "conflicting");
    facts.observations.push(p.observation);
  }
  facts.session_resolution.date_reference = date || "today";
  if (!matchesSchema(facts, MATERIALIZATION_SCHEMA)) {
    facts.observations = [];
    facts.unresolved_facts = [];
    fail(text, "Valores fuera del contrato");
  }
  return facts;
}

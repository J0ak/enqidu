import { normalizeExactName } from "./domain.js";
// Deliberately bounded, anchored grammar. A partial match is never a command.
export function isSemanticCorrectionIntent(text) {
  if (typeof text !== "string") return false;
  const normalized = normalizeExactName(text);
  // Questions and summaries are not factual metric clauses, even when they
  // mention numbers (e.g. «resúmeme las últimas 12 semanas»).
  if (/^(?:[¿?]\s*)?(?:que|como|cuando|cual|cuanto|cuantas|comparame|compara|resumeme|resumen)\b/.test(normalized)) return false;
  if (normalized === "por lado") return true;
  if (/^(?:ayer|hoy) hice\s+/.test(normalized)) return true;
  // A number after arbitrary words is not enough: planning commands also contain
  // numbers ("Hazlo de 30 minutos"). Require a complete supported metric clause.
  const first = normalizeExactName(
    text.trim().split(/\s*(?:;|\n|\.(?=\s|$))\s*/)[0],
  );
  const metric = first
    .replace(/^(?:en (?:el |la )?)?[a-z][a-z_ \-]*? (?=\d)/, "")
    .replace(/[, ]+pausa de \d{1,3} segundos$/, "")
    .replace(/ por lado$/, "");
  if (
    /^\d/.test(metric) &&
    (parseSemanticSpanish(`hice ${metric}`) ||
      /^\d+(?:,\s*\d+)*(?: y \d+)? (?:reps|repeticiones)$/.test(metric) ||
      /^\d+(?:,\s*\d+)+(?: y \d+)?$/.test(metric))
  )
    return true;
  return /^(?:hoy en |ayer en |(?:la )?ultima serie |en .+? (?:hice|fueron|eran) |hice |fueron |eran |eso (?:era |no era )|no hice |la ultima |fue por lado|pausa de |anade que )/.test(
    normalized,
  );
}
const integer = (s) => (/^\d{1,4}$/.test(s) ? Number(s) : null);
const load = (s) =>
  /^\d{1,4}(?:[.,]\d{1,2})?$/.test(s) ? Number(s.replace(",", ".")) : null;
export function parseSemanticSpanish(input) {
  if (typeof input !== "string" || input.length > 600) return null;
  let text = normalizeExactName(input).replace(/[.!]$/, "").trim();
  let date_reference = "today",
    exercise_name = null,
    match;
  match = text.match(
    /^en el entrenamiento (de hoy|de ayer|del (\d{1,2}(?:\/\d{1,2}(?:\/\d{4})?)?))\s+(.+)$/,
  );
  if (match) {
    date_reference =
      match[1] === "de hoy"
        ? "today"
        : match[1] === "de ayer"
          ? "yesterday"
          : match[2];
    text = match[3];
  }
  match = text.match(
    /^en (?:el |la )?(.+?)(?: de (hoy|ayer))? (hice|fueron|eran) (.+)$/,
  );
  if (match) {
    exercise_name = match[1];
    if (match[2]) date_reference = match[2] === "hoy" ? "today" : "yesterday";
    text = match[3] + " " + match[4];
  }
  let changes = [];
  if (
    (match = text.match(
      /^hice (\d{1,3})\s*x\s*(\d{1,4})(?: con (\d{1,4}(?:[.,]\d{1,2})?) (kg|lb)( por mancuerna)?)?$/,
    ))
  ) {
    const sets = Number(match[1]),
      reps = Number(match[2]);
    if (sets < 1 || sets > 100 || reps > 1000) return null;
    changes.push({ op: "set_reps", reps: Array(sets).fill(reps) });
    if (match[3])
      changes.push({
        op: "set_load",
        value: load(match[3]),
        unit: match[5] ? "kg_each" : match[4],
      });
    if (match[5] && match[4] !== "kg") return null;
  } else if (
    (match = text.match(
      /^hice (\d{1,4}(?:[.,]\d{1,2})?) kg, (\d+(?:, \d+)*(?: y \d+)?)$/,
    ))
  ) {
    changes = [
      { op: "set_load", value: load(match[1]), unit: "kg" },
      { op: "set_reps", reps: match[2].split(/, | y /).map(Number) },
    ];
  } else if ((match = text.match(/^fueron (\d+(?:,\s*\d+)*(?: y \d+)?)$/))) {
    changes = [
      { op: "set_reps", reps: match[1].split(/,\s*| y /).map(Number) },
    ];
  } else if ((match = text.match(/^la ultima (?:fueron|fue) (\d{1,4})$/))) {
    changes = [{ op: "set_last_reps", value: integer(match[1]) }];
  } else if (
    (match = text.match(
      /^(?:eran|hice) (\d{1,4}(?:[.,]\d{1,2})?) (kg|lb)( por mancuerna)?$/,
    ))
  ) {
    if (match[3] && match[2] !== "kg") return null;
    changes = [
      {
        op: "set_load",
        value: load(match[1]),
        unit: match[3] ? "kg_each" : match[2],
      },
    ];
  } else if ((match = text.match(/^hice (\d{1,4}) rondas$/))) {
    changes = [{ op: "set_rounds", value: integer(match[1]) }];
  } else if ((match = text.match(/^hice (\d{1,4}) ([a-z][a-z \-]{1,100})$/))) {
    if (
      exercise_name ||
      /\b(kg|lb|reps|repeticiones|series|minutos|segundos)\b/.test(match[2])
    )
      return null;
    exercise_name = match[2];
    changes = [{ op: "set_reps", reps: [integer(match[1])] }];
  } else if ((match = text.match(/^no hice ([a-z][a-z \-]{1,100})$/))) {
    exercise_name = match[1];
    changes = [{ op: "set_omitted", value: true }];
  } else if (
    (match = text.match(
      /^(?:eso era|eso no era (.+), era) ([a-z][a-z \-]{1,100})$/,
    ))
  ) {
    exercise_name = match[1] || null;
    changes = [{ op: "rename_exercise", reported_name: match[2] }];
  } else if (text === "fue por lado") {
    changes = [{ op: "set_side", value: "each_side" }];
  } else if ((match = text.match(/^pausa de (\d{1,3}) segundos$/))) {
    changes = [
      { op: "set_tempo", value: `pausa de ${Number(match[1])} segundos` },
    ];
  } else if (
    (match = input.trim().match(/^(?:añade|anade) que (.{1,500})$/i))
  ) {
    changes = [{ op: "append_note", value: match[1] }];
  } else return null;
  if (
    changes.some(
      (c) =>
        c.value === null ||
        (c.op === "set_load" && c.value > 2000) ||
        (["set_rounds", "set_last_reps"].includes(c.op) && c.value > 1000) ||
        (c.op === "set_reps" &&
          (c.reps.length > 100 || c.reps.some((n) => n > 1000))),
    )
  )
    return null;
  return { exercise_name, date_reference, changes };
}

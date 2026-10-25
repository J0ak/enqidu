import { isSemanticCorrectionIntent } from "../training/semantics/parser.js";
import { buildDeterministicLanguageParse } from "./deterministicFallback.js";
import { isValidCalendarDate } from "../time/userCalendar.js";
import { shiftHealthCalendarDate as shift } from "../health/healthEvidence.js";
import { monday } from "../progress/domain.js";

export const normalizeConversationText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const months = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const weekdays = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];
const monthPattern = months.join("|");
const periodPattern = new RegExp(
  `\\b(?:desde (?:${monthPattern})(?: de \\d{4})?|(?:hoy|ayer|esta semana|la semana pasada|este mes|este ano)|(?:las |estas )?(?:ultimas )?(?:4|cuatro|12|doce) semanas|(?:el )?(?:${weekdays.join("|")})|(?:el )?\\d{1,2} de (?:${monthPattern})(?: de \\d{4})?|(?:el )?\\d{4}-\\d{2}-\\d{2})\\b`,
  "g",
);
export function parseConversationPeriod(text, today) {
  if (!isValidCalendarDate(today)) throw new Error("profile_calendar_required");
  const normalized = normalizeConversationText(text);
  const year = Number(today.slice(0, 4));
  let from,
    to = today,
    match;
  if (
    (match = normalized.match(
      new RegExp(`\\bdesde (${monthPattern})(?: de (\\d{4}))?\\b`),
    ))
  ) {
    const month = String(months.indexOf(match[1]) + 1).padStart(2, "0");
    let selectedYear = match[2] ? Number(match[2]) : year;
    if (!match[2] && `${selectedYear}-${month}-01` > today) selectedYear--;
    from = `${selectedYear}-${month}-01`;
  } else if ((match = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/)))
    from = to = match[0];
  else if (
    (match = normalized.match(
      new RegExp(`\\b(\\d{1,2}) de (${monthPattern})(?: de (\\d{4}))?\\b`),
    ))
  ) {
    from =
      to = `${match[3] || year}-${String(months.indexOf(match[2]) + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  } else if (/\bayer\b/.test(normalized)) from = to = shift(today, -1);
  else if (/\bhoy\b/.test(normalized)) from = today;
  else if (/\bla semana pasada\b/.test(normalized)) {
    from = shift(monday(today), -7);
    to = shift(monday(today), -1);
  } else if (/\besta semana\b/.test(normalized)) from = monday(today);
  else if (/\beste mes\b/.test(normalized)) from = today.slice(0, 7) + "-01";
  else if (/\beste ano\b/.test(normalized)) from = `${year}-01-01`;
  else if ((match = normalized.match(/\b(4|cuatro|12|doce) semanas\b/))) {
    to = shift(monday(today), -1);
    from = shift(to, 1 - (["4", "cuatro"].includes(match[1]) ? 28 : 84));
  } else {
    const day = weekdays.findIndex((d) =>
      new RegExp(`\\b${d}\\b`).test(normalized),
    );
    if (day >= 0) {
      const current = new Date(`${today}T12:00:00Z`).getUTCDay();
      from = to = shift(today, -((current - day + 7) % 7));
    }
  }
  if (!from)
    return {
      period: null,
      invalid: /\bdesde\b/.test(normalized),
      remaining: normalized,
    };
  const invalid =
    !isValidCalendarDate(from) ||
    !isValidCalendarDate(to) ||
    from > to ||
    to > today ||
    (Date.parse(to) - Date.parse(from)) / 86400000 >= 366;
  return {
    period: invalid ? null : { from, to },
    invalid,
    remaining: normalized
      .replace(periodPattern, " ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

/** Grammar produces language slots only; no catalog, metrics, SQL or sporting decisions. */
export function parseConversationLanguage(message, today) {
  const text = normalizeConversationText(message);
  const legacy = buildDeterministicLanguageParse(message);
  const temporal = parseConversationPeriod(message, today);
  const result = {
    intent: "unknown",
    exercise_query: null,
    session_selector: null,
    followup: false,
    previous: false,
    comparison: false,
    requested_metrics: [],
    legacy,
    ...temporal,
  };
  if (isSemanticCorrectionIntent(message))
    return { ...result, intent: "semantic_correction" };
  if (
    /\b(ignora|inventa|aunque no|unknown son|pon descanso|seguro que falte)\b/.test(
      text,
    )
  )
    return { ...result, unsafe: true };
  const rest = temporal.remaining;
  let match;
  const exercise = (intent, query, metrics = []) => {
    let noun = query?.replace(/^(?:el |la |los |las )/, "").trim() || null;
    // Closed grammatical inflection, not identity resolution. The resulting name
    // must still resolve exactly through the shared catalog tool.
    if (noun === "dominadas altas") noun = "dominada alta";
    if (noun === "pike elevado") noun = "pike push-up elevado";
    return {
      ...result,
      intent,
      exercise_query: noun,
      requested_metrics: metrics,
    };
  };
  if (
    (match = rest.match(
      /^(?:como (?:voy|voi|he evolucionado|estoy progresando)|que tal (?:voy|llevo|va))(?:\s+(?:con|en))?\s+(.+)$/,
    ))
  )
    return exercise("exercise_progress", match[1]);
  if (
    (match = rest.match(
      /^(?:cuando hice|cuando practique) (.+?) (?:por )?ultima vez$/,
    ))
  )
    return exercise("exercise_last_practice", match[1]);
  if (
    (match = rest.match(
      /^cuanto levante (?:la ultima vez en (.+)|en (.+?) la ultima vez)$/,
    ))
  )
    return exercise("exercise_last_practice", match[1] || match[2], ["load"]);
  if (
    (match = rest.match(
      /^(?:cual (?:es|ha sido) mi (?:mejor (?:registro(?: conocido)?(?: en)? )?|record(?: en| de)? )|mejor registro (?:conocido )?(?:en |de )?)(.+)$/,
    ))
  )
    return exercise("exercise_best_observation", match[1], ["load", "reps"]);
  if (
    (match = rest.match(
      /^(?:que datos (?:te )?faltan|que te falta)(?: del?| en| para)? (.+)$/,
    )) &&
    !/^(?:para|saber)/.test(match[1])
  )
    return exercise("exercise_missing_data", match[1], ["quality"]);
  if (
    /^(?:que datos (?:te )?faltan|que te falta)(?: para saber si (?:he mejorado|mejoro|estoy mejorando))?$/.test(
      rest,
    )
  )
    return {
      ...result,
      intent: "exercise_missing_data",
      followup: true,
      requested_metrics: ["quality"],
    };
  if ((match = rest.match(/^cuantas veces he (?:hecho|practicado) (.+)$/)))
    return exercise("exercise_history", match[1], ["frequency"]);
  if ((match = rest.match(/^(?:historial|historia) (?:de |del )?(.+)$/)))
    return exercise("exercise_history", match[1]);
  if ((match = rest.match(/^y (?:en )?(?:la|el) de (.+)$/)))
    return {
      ...result,
      intent: "session_detail",
      followup: true,
      session_selector: match[1],
    };
  if (/^que paso en esa sesion$/.test(rest))
    return { ...result, intent: "session_detail", followup: true };
  if (/^y (?:la|el|las|los) anterior(?:es)?$/.test(rest))
    return { ...result, followup: true, previous: true };
  if (
    (!rest && temporal.period) ||
    rest === "y" ||
    /^y (?:desde|en)\b/.test(rest)
  )
    return { ...result, followup: true };
  if ((match = rest.match(/^y (.+)$/)))
    return { ...exercise("exercise_progress", match[1]), followup: true };
  if (/^que hice(?: exactamente)?$/.test(rest))
    return { ...result, intent: "session_detail" };
  if (
    /^(?:mis |ver |dime mis )?(?:ultimos|recientes) entrenamientos$/.test(rest)
  )
    return { ...result, intent: "recent_training" };
  if (/^compar(?:ame|a)\b/.test(rest))
    return { ...result, intent: "progress_comparison", comparison: true };
  if (
    /^(?:como voy|como he evolucionado|resumeme|resumen(?: de)?|que tal voy)$/.test(
      rest,
    )
  )
    return { ...result, intent: "training_overview" };
  if (
    /^(?:que me toca|que tengo que entrenar)$/.test(rest) ||
    legacy.intent === "recommend_today"
  )
    return { ...result, intent: "today_plan" };
  if (/^como estoy(?: para entrenar)?$/.test(rest))
    return { ...result, intent: "health_training" };
  if (legacy.intent === "recovery_status")
    return { ...result, intent: "readiness" };
  if (legacy.intent === "plan_week") return { ...result, intent: "week_plan" };
  return result;
}

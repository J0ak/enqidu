import { getEnqiduTool } from "./catalog.js";

const normalize = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/['’]/g, "")
  .replace(/[¡!¿?.,;:]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();


const WEEKDAY_ALIASES = Object.freeze({
  lunes: "monday",
  martes: "tuesday",
  miercoles: "wednesday",
  jueves: "thursday",
  viernes: "friday",
  sabado: "saturday",
  domingo: "sunday",
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
});

const MOVE_PATTERNS = Object.freeze([
  /^(?:muevelo|pasalo|cambialo) al (lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/,
  /^mejor (?:el )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo) cambialo$/,
  /^(?:move it to|reschedule it to) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday) instead shift it$/,
]);

function detectMoveWeekday(text) {
  for (const pattern of MOVE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return WEEKDAY_ALIASES[match[1]] || null;
  }
  return null;
}

const UNAVAILABILITY_PATTERNS = Object.freeze([
  { date_reference: "tomorrow", pattern: /^manana no puedo(?: entrenar)?$/ },
  { date_reference: "tomorrow", pattern: /^no puedo(?: entrenar)? manana$/ },
  { date_reference: "tomorrow", pattern: /^manana me es imposible(?: entrenar)?$/ },
  { date_reference: "today", pattern: /^hoy no puedo(?: entrenar)?$/ },
  { date_reference: "today", pattern: /^no puedo(?: entrenar)? hoy$/ },
  { date_reference: "tomorrow", pattern: /^tomorrow i cant train$/ },
  { date_reference: "tomorrow", pattern: /^i cant train tomorrow$/ },
  { date_reference: "tomorrow", pattern: /^i am unavailable tomorrow$/ },
  { date_reference: "today", pattern: /^i cant train today$/ },
  { date_reference: "today", pattern: /^today i cant train$/ },
]);

function detectUnavailability(text) {
  return UNAVAILABILITY_PATTERNS.find((item) => item.pattern.test(text))?.date_reference || null;
}


const ENVIRONMENT_ALIASES = Object.freeze({
  casa: "home",
  home: "home",
  piscina: "pool",
  pool: "pool",
  trail: "trail",
  monte: "trail",
  exterior: "outdoor",
  parque: "outdoor",
  outdoor: "outdoor",
  gimnasio: "functional_training_center",
  gym: "functional_training_center",
  box: "functional_training_center",
});

const ENVIRONMENT_PATTERNS = Object.freeze([
  /^(?:hazlo|hazmelo|adaptalo|cambialo) en (casa|piscina|trail|monte|exterior|parque|gimnasio|gym|box)$/,
  /^mejor en (casa|piscina|trail|monte|exterior|parque|gimnasio|gym|box)$/,
  /^(?:do it|make it) (?:at|in) (home|pool|trail|outdoor|gym)$/,
  /^(?:make it|turn it into) a (home|pool|trail|outdoor|gym) workout$/,
]);

function detectEnvironmentAdaptation(text) {
  for (const pattern of ENVIRONMENT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return ENVIRONMENT_ALIASES[match[1]] || null;
  }
  return null;
}


const DURATION_PATTERNS = Object.freeze([
  /^(?:hazlo|dejalo|ajustalo|recortalo) (?:de|a|en) (\d{1,3}) (?:min|minutos)$/,
  /^solo tengo (\d{1,3}) (?:min|minutos)$/,
  /^(?:make it|set it to) (\d{1,3}) (?:min|minutes)$/,
  /^i only have (\d{1,3}) (?:min|minutes)$/,
]);

function detectDurationAdaptation(text) {
  for (const pattern of DURATION_PATTERNS) {
    const match = text.match(pattern);
    const minutes = Number(match?.[1]);
    if (Number.isInteger(minutes) && minutes >= 10 && minutes <= 180) return minutes;
  }
  return null;
}


const CANCEL_PLAN_PATTERNS = Object.freeze([
  /^(?:cancelalo|cancela este entrenamiento|cancela la sesion|quita este entrenamiento del plan|borralo del plan|eliminalo del plan)$/,
  /^(?:cancel it|cancel this workout|cancel the session|remove this workout from my plan|delete it from my plan)$/,
]);

function detectsCancelPlan(text) {
  return CANCEL_PLAN_PATTERNS.some((pattern) => pattern.test(text));
}

const ADAPT_REMAINING_WEEK_PATTERNS = Object.freeze([
  /^(?:adapta|ajusta|reorganiza|replanifica) (?:el )?resto de la semana$/,
  /^(?:adapta|ajusta|reorganiza|replanifica) lo que queda de semana$/,
  /^(?:adapt|adjust|reorganize|replan) the rest of the week$/,
]);

function detectsRemainingWeekAdaptation(text) {
  return ADAPT_REMAINING_WEEK_PATTERNS.some((pattern) => pattern.test(text));
}

const SAVE_RECOMMENDATION_PATTERNS = Object.freeze([
  /^(?:si )?apuntamelo$/,
  /^(?:si )?guardalo(?: en (?:mi )?plan)?$/,
  /^(?:si )?metelo en (?:mi )?plan$/,
  /^(?:si )?anadelo (?:a|al) (?:mi )?plan$/,
  /^(?:yes )?save it(?: to my plan)?$/,
  /^(?:yes )?put it in my plan$/,
  /^add it to my plan$/,
]);

export function detectEnqiduFastPathCommand(message = "") {
  const text = normalize(message);
  if (!text) return null;

  const unavailableDateReference = detectUnavailability(text);
  if (unavailableDateReference) {
    const definition = getEnqiduTool("set_training_unavailability");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      arguments: { date_reference: unavailableDateReference },
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  // Keep generic negative commands fail-closed. The exact unavailability
  // whitelist above is the only write path intentionally allowed to begin "no".
  if (text.startsWith("no ")) return null;

  if (detectsCancelPlan(text)) {
    const definition = getEnqiduTool("cancel_planned_session");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  if (detectsRemainingWeekAdaptation(text)) {
    const definition = getEnqiduTool("adapt_remaining_week");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  const targetDurationMinutes = detectDurationAdaptation(text);
  if (targetDurationMinutes) {
    const definition = getEnqiduTool("adapt_session_duration");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      arguments: { duration_minutes: targetDurationMinutes },
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  const targetEnvironment = detectEnvironmentAdaptation(text);
  if (targetEnvironment) {
    const definition = getEnqiduTool("adapt_session_environment");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      arguments: { environment: targetEnvironment },
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  const explicitMove = text.match(/^(?:mueve|pasa|cambia) (?:el )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo) al (lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/);
  if (explicitMove) {
    const definition = getEnqiduTool("move_planned_session");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      arguments: { source_weekday: WEEKDAY_ALIASES[explicitMove[1]], target_weekday: WEEKDAY_ALIASES[explicitMove[2]] },
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  const targetWeekday = detectMoveWeekday(text);
  if (targetWeekday) {
    const definition = getEnqiduTool("move_planned_session");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      arguments: { target_weekday: targetWeekday },
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  if (SAVE_RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(text))) {
    const definition = getEnqiduTool("save_recommendation_today");
    if (!definition?.enabled || definition.access !== "write") return null;
    return {
      tool: definition.name,
      explicit_user_command: true,
      confidence: 1,
      source: "deterministic_fast_path",
    };
  }

  return null;
}

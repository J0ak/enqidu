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
  if (!text || text.startsWith("no ")) return null;

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

import { detectCoachIntents, detectEquipmentLocation } from "../coachContext/coachCards.js";
import { LOCAL_LANGUAGE_VERSION, emptyLocalLanguageSlots } from "./contract.js";

const normalize = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/\s+/g, " ")
  .trim();

const WEEKDAYS = [
  ["monday", ["lunes", "monday"]],
  ["tuesday", ["martes", "tuesday"]],
  ["wednesday", ["miercoles", "wednesday"]],
  ["thursday", ["jueves", "thursday"]],
  ["friday", ["viernes", "friday"]],
  ["saturday", ["sabado", "saturday"]],
  ["sunday", ["domingo", "sunday"]],
];

function detectLanguage(text) {
  if (/\b(que|hoy|manana|ayer|semana|casa|piscina|entreno|entrenamiento|hazme|muevelo|apuntamelo)\b/.test(text)) return "es";
  if (/\b(today|tomorrow|yesterday|week|home|pool|workout|train|move|save|cancel)\b/.test(text)) return "en";
  return "unknown";
}

function detectDuration(text) {
  if (/\b(media hora|half an hour)\b/.test(text)) return 30;
  if (/\b(una hora|one hour)\b/.test(text)) return 60;

  const hours = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas|hour|hours)\b/);
  if (hours) {
    const value = Number(hours[1].replace(",", "."));
    const minutes = Math.round(value * 60);
    if (minutes >= 5 && minutes <= 300) return minutes;
  }

  const minutes = text.match(/\b(\d{1,3})\s*(?:min|minuto|minutos|minute|minutes)\b/);
  if (minutes) {
    const value = Number(minutes[1]);
    if (value >= 5 && value <= 300) return value;
  }
  return null;
}

function detectIntensity(text) {
  if (/\b(suave|tranquilo|tranquila|facil|ligero|ligera|easy|light|gentle)\b/.test(text)) return "easy";
  if (/\b(moderado|moderada|medio|media|moderate|medium)\b/.test(text)) return "moderate";
  if (/\b(duro|dura|intenso|intensa|fuerte|hard|intense|tough)\b/.test(text)) return "hard";
  return null;
}

function detectDate(text) {
  if (/\b(semana que viene|proxima semana|next week)\b/.test(text)) return { date_reference: "next_week", weekday: null };
  if (/\b(esta semana|resto de la semana|this week|rest of (?:the )?week)\b/.test(text)) return { date_reference: "this_week", weekday: null };
  if (/\b(manana|tomorrow)\b/.test(text)) return { date_reference: "tomorrow", weekday: null };
  if (/\b(ayer|yesterday)\b/.test(text)) return { date_reference: "yesterday", weekday: null };
  if (/\b(hoy|today)\b/.test(text)) return { date_reference: "today", weekday: null };
  for (const [weekday, names] of WEEKDAYS) {
    if (names.some((name) => new RegExp(`\\b${name}\\b`).test(text))) {
      return { date_reference: "weekday", weekday };
    }
  }
  return { date_reference: null, weekday: null };
}

function detectActionIntent(text, slots) {
  if (/\b(cancel(?:a|ar)?|elimina(?:r)?|borra(?:r)?|quita(?:r)?|cancel|delete|remove)\b/.test(text)
    && /\b(plan|entreno|entrenamiento|sesion|workout|session)\b/.test(text)) return "cancel_plan";

  if (/\b(adapta|reorganiza|reajusta|adjust|adapt|rework)\b/.test(text)
    && /\b(resto de la semana|semana|rest of (?:the )?week|week)\b/.test(text)) return "adapt_week";

  if (/\b(no puedo|no podre|can't|cannot|won't be able)\b/.test(text)
    && (slots.date_reference || slots.weekday)) return "unavailability";

  if (/\b(muevelo|pasalo|cambialo|move it|reschedule it|shift it)\b/.test(text)) return "move_plan";

  if (/\b(apuntamelo|guardalo|anadelo|añadelo|save it|add it to (?:the )?plan)\b/.test(text)) return "save_recommendation";

  const referentialImperative = /\b(hazlo|ponlo|cambialo|make it|do it|change it)\b/.test(text);
  if (referentialImperative && slots.environment) return "adapt_environment";
  if (referentialImperative && slots.duration_max_minutes) return "adapt_duration";

  return null;
}

function detectCurrentCoachIntent(message, text) {
  const current = detectCoachIntents(message);
  if (current.greeting || /^(hello|hi|hey)[!?.]*$/.test(text)) return "greeting";
  if (current.planToday || /\b(what should i train today|what(?:'s| is) my workout today|recommend .*today)\b/.test(text)) return "recommend_today";
  if (current.weekPlan || /\b(this week|weekly plan)\b/.test(text)) return "plan_week";
  if (current.trend || /\b(improving|training trend|compared? with last week|compare .*last week)\b/.test(text)) return "training_trend";
  if (current.recovery || /\b(recovery|readiness|sleep|hrv|body battery|fatigue)\b/.test(text)) return "recovery_status";
  if (current.equipment
    || /\b(equipment|gear)\b/.test(text)
    || /\bcon que (?:puedo )?entrenar\b/.test(text)
    || /\bwhat can i train with\b/.test(text)) return "equipment_query";
  if (current.session || /\b(yesterday|last session|last workout|what did i do)\b/.test(text)) return "session_lookup";

  if (/\b(hazme|ponme|dame|preparame|recomiendame|build me|give me|make me|recommend)\b/.test(text)
    && /\b(algo|entreno|entrenamiento|sesion|workout|training|session)?\b/.test(text)) {
    return "recommend_today";
  }
  return "unknown";
}

export function buildDeterministicLanguageParse(message = "") {
  const text = normalize(message);
  const location = detectEquipmentLocation(message);
  const date = detectDate(text);
  const slots = {
    ...emptyLocalLanguageSlots(),
    environment: location?.key || null,
    duration_max_minutes: detectDuration(text),
    intensity_preference: detectIntensity(text),
    ...date,
  };

  const actionIntent = detectActionIntent(text, slots);
  const intent = actionIntent || detectCurrentCoachIntent(message, text);

  return {
    version: LOCAL_LANGUAGE_VERSION,
    intent,
    slots,
    language: detectLanguage(text),
    confidence: intent === "unknown" ? 0 : 1,
  };
}

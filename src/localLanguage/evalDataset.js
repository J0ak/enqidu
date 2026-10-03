import { LOCAL_LANGUAGE_INTENTS, LOCAL_LANGUAGE_VERSION, emptyLocalLanguageSlots } from "./contract.js";

const envs = [
  ["home", "en casa", "at home"],
  ["pool", "en la piscina", "at the pool"],
  ["trail", "por trail", "on the trail"],
  ["outdoor", "al aire libre", "outdoors"],
  ["functional_training_center", "en el gimnasio", "at the gym"],
];
const durations = [20, 30, 40, 45, 60];
const intensities = [
  ["easy", "suave", "easy"],
  ["moderate", "moderado", "moderate"],
  ["hard", "intenso", "hard"],
];

const slots = (overrides = {}) => ({ ...emptyLocalLanguageSlots(), ...overrides });
const example = (id, language, text, intent, expectedSlots = {}) => ({
  id,
  language,
  text,
  expected: {
    version: LOCAL_LANGUAGE_VERSION,
    intent,
    language,
    slots: slots(expectedSlots),
  },
});

function generatedRecommendations() {
  const rows = [];
  for (const language of ["es", "en"]) {
    for (let i = 0; i < 30; i += 1) {
      const [environment, esEnvironment, enEnvironment] = envs[i % envs.length];
      const duration = durations[(i * 2 + 1) % durations.length];
      const [intensity, esIntensity, enIntensity] = intensities[(i * 2) % intensities.length];
      const text = language === "es"
        ? `${i % 2 ? "Hazme" : "Dame"} un entreno ${esIntensity} ${esEnvironment}, tengo ${duration} minutos`
        : `${i % 2 ? "Build me" : "Give me"} an ${enIntensity} workout ${enEnvironment}, I have ${duration} minutes`;
      rows.push(example(
        `recommend-${language}-${i}`,
        language,
        text,
        "recommend_today",
        { environment, duration_max_minutes: duration, intensity_preference: intensity },
      ));
    }
  }
  return rows;
}

function currentIntentFamilies() {
  const families = [
    ["greeting", ["Hola", "Buenas", "Hey"], ["Hello", "Hi", "Hey"]],
    ["recommend_today", ["¿Qué entreno hoy?", "¿Qué me toca hoy?", "Recomiéndame para hoy"], ["What should I train today?", "What is my workout today?", "Recommend something for today"]],
    ["plan_week", ["¿Qué tengo esta semana?", "¿Qué me queda por entrenar esta semana?", "Enséñame el plan semanal"], ["What do I have this week?", "What is left in my weekly plan?", "Show my plan this week"]],
    ["training_trend", ["¿Estoy mejorando?", "¿Cómo va mi tendencia?", "Compárame con la semana anterior"], ["Am I improving?", "What is my training trend?", "Compare me with last week"]],
    ["recovery_status", ["¿Cómo estoy de recuperación?", "¿Cómo está mi HRV?", "¿He dormido bien?"], ["How is my recovery?", "How is my HRV?", "Did I sleep well?"]],
    ["equipment_query", ["¿Qué material tengo?", "¿Qué equipamiento hay en casa?", "¿Con qué puedo entrenar?"], ["What equipment do I have?", "What gear do I have at home?", "What can I train with?"]],
    ["session_lookup", ["¿Qué hice ayer?", "Enséñame mi última sesión", "¿Cómo fue mi entreno de ayer?"], ["What did I do yesterday?", "Show my last session", "How was yesterday's workout?"]],
  ];
  const rows = [];
  for (const [intent, es, en] of families) {
    es.forEach((text, i) => rows.push(example(`core-${intent}-es-${i}`, "es", text, intent)));
    en.forEach((text, i) => rows.push(example(`core-${intent}-en-${i}`, "en", text, intent)));
  }
  return rows;
}

function actionFamilies() {
  const rows = [
    example("action-save-es", "es", "Apúntamelo", "save_recommendation"),
    example("action-save-en", "en", "Save it to the plan", "save_recommendation"),
    example("action-move-es", "es", "Muévelo al viernes", "move_plan", { date_reference: "weekday", weekday: "friday" }),
    example("action-move-en", "en", "Move it to Friday", "move_plan", { date_reference: "weekday", weekday: "friday" }),
    example("action-unavailable-es", "es", "Mañana no puedo", "unavailability", { date_reference: "tomorrow" }),
    example("action-unavailable-en", "en", "I can't train tomorrow", "unavailability", { date_reference: "tomorrow" }),
    example("action-environment-es", "es", "Hazlo en casa", "adapt_environment", { environment: "home" }),
    example("action-environment-en", "en", "Do it at home", "adapt_environment", { environment: "home" }),
    example("action-duration-es", "es", "Hazlo de 30 minutos", "adapt_duration", { duration_max_minutes: 30 }),
    example("action-duration-en", "en", "Make it 30 minutes", "adapt_duration", { duration_max_minutes: 30 }),
    example("action-cancel-es", "es", "Cancela el entrenamiento del viernes", "cancel_plan", { date_reference: "weekday", weekday: "friday" }),
    example("action-cancel-en", "en", "Cancel Friday's workout", "cancel_plan", { date_reference: "weekday", weekday: "friday" }),
    example("action-week-es", "es", "Adapta el resto de la semana", "adapt_week", { date_reference: "this_week" }),
    example("action-week-en", "en", "Adapt the rest of the week", "adapt_week", { date_reference: "this_week" }),
  ];

  const weekdays = [
    ["monday", "lunes", "Monday"], ["tuesday", "martes", "Tuesday"],
    ["wednesday", "miércoles", "Wednesday"], ["thursday", "jueves", "Thursday"],
    ["friday", "viernes", "Friday"], ["saturday", "sábado", "Saturday"],
    ["sunday", "domingo", "Sunday"],
  ];
  weekdays.forEach(([weekday, es, en], index) => {
    rows.push(example(`move-generated-es-${index}`, "es", `Pásalo al ${es}`, "move_plan", { date_reference: "weekday", weekday }));
    rows.push(example(`move-generated-en-${index}`, "en", `Reschedule it to ${en}`, "move_plan", { date_reference: "weekday", weekday }));
  });
  return rows;
}

function boundaryCases() {
  return [
    example("boundary-next-week-es", "es", "¿Qué entrenamientos tengo la semana que viene?", "unknown", { date_reference: "next_week" }),
    example("boundary-next-week-en", "en", "What workouts do I have next week?", "unknown", { date_reference: "next_week" }),
    example("boundary-yesterday-es", "es", "¿Qué hice ayer?", "session_lookup", { date_reference: "yesterday" }),
    example("boundary-yesterday-en", "en", "What did I do yesterday?", "session_lookup", { date_reference: "yesterday" }),
    example("boundary-half-hour-es", "es", "Hazme algo suave en casa, tengo media hora", "recommend_today", { environment: "home", duration_max_minutes: 30, intensity_preference: "easy" }),
    example("boundary-half-hour-en", "en", "Build me something easy at home, I have half an hour", "recommend_today", { environment: "home", duration_max_minutes: 30, intensity_preference: "easy" }),
    example("boundary-hour-es", "es", "Dame un entreno moderado de una hora", "recommend_today", { duration_max_minutes: 60, intensity_preference: "moderate" }),
    example("boundary-hour-en", "en", "Give me a moderate one hour workout", "recommend_today", { duration_max_minutes: 60, intensity_preference: "moderate" }),
  ];
}

export function buildLocalLanguageEvalDataset() {
  const dataset = [
    ...generatedRecommendations(),
    ...currentIntentFamilies(),
    ...actionFamilies(),
    ...boundaryCases(),
  ];
  const seen = new Set();
  return dataset.filter((row) => {
    const key = `${row.language}:${row.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const localLanguageEvalCoverage = Object.freeze({
  required_intents: LOCAL_LANGUAGE_INTENTS.filter((intent) => intent !== "unknown"),
  languages: ["es", "en"],
});

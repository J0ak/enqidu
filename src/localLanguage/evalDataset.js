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
  ["easy", "suave", "suave", "easy"],
  ["moderate", "moderado", "moderada", "moderate"],
  ["hard", "intenso", "intensa", "hard"],
];

const slots = (overrides = {}) => ({ ...emptyLocalLanguageSlots(), ...overrides });
const example = (id, language, text, intent, expectedSlots = {}, kind = "core") => ({
  id,
  kind,
  language,
  text,
  expected: {
    version: LOCAL_LANGUAGE_VERSION,
    intent,
    language,
    slots: slots(expectedSlots),
  },
});

function generatedRecommendations(kind = "core") {
  const rows = [];
  for (const language of ["es", "en"]) {
    for (let i = 0; i < 30; i += 1) {
      const [environment, esEnvironment, enEnvironment] = envs[i % envs.length];
      const duration = durations[(i * 2 + 1) % durations.length];
      const [intensity, esIntensity, esFeminineIntensity, enIntensity] = intensities[(i * 2) % intensities.length];
      let text;
      if (kind === "challenge") {
        const variant = i % 6;
        if (language === "es") {
          const variants = [
            `${esEnvironment.charAt(0).toUpperCase()}${esEnvironment.slice(1)}, ${duration} minutos y que sea ${esIntensity}. ¿Qué me propones?`,
            `Tengo ${duration} minutos; ${esIntensity}, ${esEnvironment}. Prepárame algo.`,
            `Para hoy: ${esEnvironment}, máximo ${duration} min, intensidad ${esFeminineIntensity}.`,
            `¿Qué opción harías ${esEnvironment} si solo tengo ${duration} minutos y la quiero ${esFeminineIntensity}?`,
            `${duration} minutos disponibles, ${esEnvironment}; hoy prefiero algo ${esIntensity}.`,
            `Busco una sesión ${esFeminineIntensity}, ${esEnvironment}, sin pasar de ${duration} minutos.`,
          ];
          text = variants[variant];
        } else {
          const variants = [
            `${enEnvironment}, ${duration} minutes, ${enIntensity}. What would you suggest?`,
            `I have ${duration} minutes; ${enIntensity}, ${enEnvironment}. Put something together.`,
            `For today: ${enEnvironment}, max ${duration} min, ${enIntensity} intensity.`,
            `What would you do ${enEnvironment} with only ${duration} minutes, keeping it ${enIntensity}?`,
            `${duration} minutes available, ${enEnvironment}; today I want it ${enIntensity}.`,
            `I want a session that's ${enIntensity} ${enEnvironment}, no longer than ${duration} minutes.`,
          ];
          text = variants[variant];
        }
      } else {
        text = language === "es"
          ? `${i % 2 ? "Hazme" : "Dame"} un entreno ${esIntensity} ${esEnvironment}, tengo ${duration} minutos`
          : `${i % 2 ? "Build me" : "Give me"} a ${enIntensity} workout ${enEnvironment}, I have ${duration} minutes`;
      }
      rows.push(example(
        `${kind}-recommend-${language}-${i}`,
        language,
        text,
        "recommend_today",
        { environment, duration_max_minutes: duration, intensity_preference: intensity, ...(kind === "challenge" && [2, 4].includes(i % 6) ? { date_reference: "today" } : {}) },
        kind,
      ));
    }
  }
  return rows;
}

function currentIntentFamilies() {
  const families = [
    ["greeting", [["Hola", {}], ["Buenas", {}], ["Hey", {}]], [["Hello", {}], ["Hi", {}], ["Hey", {}]]],
    ["recommend_today",
      [["¿Qué entreno hoy?", { date_reference: "today" }], ["¿Qué me toca hoy?", { date_reference: "today" }], ["Recomiéndame para hoy", { date_reference: "today" }]],
      [["What should I train today?", { date_reference: "today" }], ["What is my workout today?", { date_reference: "today" }], ["Recommend something for today", { date_reference: "today" }]]],
    ["plan_week",
      [["¿Qué tengo esta semana?", { date_reference: "this_week" }], ["¿Qué me queda por entrenar esta semana?", { date_reference: "this_week" }], ["Enséñame el plan semanal", {}]],
      [["What do I have this week?", { date_reference: "this_week" }], ["What is left in my weekly plan?", {}], ["Show my plan this week", { date_reference: "this_week" }]]],
    ["training_trend", [["¿Estoy mejorando?", {}], ["¿Cómo va mi tendencia?", {}], ["Compárame con la semana anterior", {}]], [["Am I improving?", {}], ["What is my training trend?", {}], ["Compare me with last week", {}]]],
    ["recovery_status", [["¿Cómo estoy de recuperación?", {}], ["¿Cómo está mi HRV?", {}], ["¿He dormido bien?", {}]], [["How is my recovery?", {}], ["How is my HRV?", {}], ["Did I sleep well?", {}]]],
    ["equipment_query",
      [["¿Qué material tengo?", {}], ["¿Qué equipamiento hay en casa?", { environment: "home" }], ["¿Con qué puedo entrenar?", {}]],
      [["What equipment do I have?", {}], ["What gear do I have at home?", { environment: "home" }], ["What can I train with?", {}]]],
    ["session_lookup",
      [["¿Qué hice ayer?", { date_reference: "yesterday" }], ["Enséñame mi última sesión", {}], ["¿Cómo fue mi entreno de ayer?", { date_reference: "yesterday" }]],
      [["What did I do yesterday?", { date_reference: "yesterday" }], ["Show my last session", {}], ["How was yesterday's workout?", { date_reference: "yesterday" }]]],
  ];
  const rows = [];
  for (const [intent, es, en] of families) {
    es.forEach(([text, expectedSlots], i) => rows.push(example(`core-${intent}-es-${i}`, "es", text, intent, expectedSlots)));
    en.forEach(([text, expectedSlots], i) => rows.push(example(`core-${intent}-en-${i}`, "en", text, intent, expectedSlots)));
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

function challengeIntentFamilies() {
  return [
    example("challenge-plan-es-0", "es", "¿Qué queda pendiente en mi planificación actual?", "plan_week", {}, "challenge"),
    example("challenge-plan-en-0", "en", "What is still pending in my current plan?", "plan_week", {}, "challenge"),
    example("challenge-trend-es-0", "es", "Frente al periodo anterior, ¿cómo ha cambiado mi carga?", "training_trend", {}, "challenge"),
    example("challenge-trend-en-0", "en", "Versus the previous period, how has my load changed?", "training_trend", {}, "challenge"),
    example("challenge-recovery-es-0", "es", "Dime si hoy llego recuperado", "recovery_status", { date_reference: "today" }, "challenge"),
    example("challenge-recovery-en-0", "en", "Tell me how recovered I am today", "recovery_status", { date_reference: "today" }, "challenge"),
    example("challenge-equipment-es-0", "es", "¿Con qué cuento para entrenar?", "equipment_query", {}, "challenge"),
    example("challenge-equipment-en-0", "en", "What's available for me to train with?", "equipment_query", {}, "challenge"),
    example("challenge-session-es-0", "es", "Repásame lo que hice ayer", "session_lookup", { date_reference: "yesterday" }, "challenge"),
    example("challenge-session-en-0", "en", "Recap what I did yesterday", "session_lookup", { date_reference: "yesterday" }, "challenge"),
    example("challenge-save-es-0", "es", "Sí, mételo en mi plan", "save_recommendation", {}, "challenge"),
    example("challenge-save-en-0", "en", "Yep, put that in my plan", "save_recommendation", {}, "challenge"),
    example("challenge-move-es-0", "es", "Mejor el viernes, cámbialo", "move_plan", { date_reference: "weekday", weekday: "friday" }, "challenge"),
    example("challenge-move-en-0", "en", "Friday instead, shift it", "move_plan", { date_reference: "weekday", weekday: "friday" }, "challenge"),
    example("challenge-unavailable-es-0", "es", "El jueves me es imposible entrenar", "unavailability", { date_reference: "weekday", weekday: "thursday" }, "challenge"),
    example("challenge-unavailable-en-0", "en", "Thursday is impossible for me to train", "unavailability", { date_reference: "weekday", weekday: "thursday" }, "challenge"),
    example("challenge-environment-es-0", "es", "Prefiero hacerlo en casa", "adapt_environment", { environment: "home" }, "challenge"),
    example("challenge-environment-en-0", "en", "I'd rather do it at home", "adapt_environment", { environment: "home" }, "challenge"),
    example("challenge-duration-es-0", "es", "Solo dispongo de 30 minutos", "adapt_duration", { duration_max_minutes: 30 }, "challenge"),
    example("challenge-duration-en-0", "en", "I only have 30 minutes", "adapt_duration", { duration_max_minutes: 30 }, "challenge"),
    example("challenge-cancel-es-0", "es", "Quita del plan lo del viernes", "cancel_plan", { date_reference: "weekday", weekday: "friday" }, "challenge"),
    example("challenge-cancel-en-0", "en", "Drop Friday from the plan", "cancel_plan", { date_reference: "weekday", weekday: "friday" }, "challenge"),
    example("challenge-week-es-0", "es", "Recoloca lo que queda de semana", "adapt_week", {}, "challenge"),
    example("challenge-week-en-0", "en", "Rework whatever is left this week", "adapt_week", { date_reference: "this_week" }, "challenge"),
    example("challenge-unknown-es-0", "es", "¿Qué tengo el mes que viene?", "unknown", {}, "challenge"),
    example("challenge-unknown-en-0", "en", "What do I have next month?", "unknown", {}, "challenge"),
  ];
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

const dedupe = (dataset) => {
  const seen = new Set();
  return dataset.filter((row) => {
    const key = `${row.language}:${row.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function buildLocalLanguageCoreEvalDataset() {
  return dedupe([
    ...generatedRecommendations("core"),
    ...currentIntentFamilies(),
    ...actionFamilies(),
    ...boundaryCases(),
  ]);
}

export function buildLocalLanguageChallengeDataset() {
  return dedupe([
    ...generatedRecommendations("challenge"),
    ...challengeIntentFamilies(),
  ]);
}

export function buildLocalLanguageEvalDataset() {
  return dedupe([
    ...buildLocalLanguageCoreEvalDataset(),
    ...buildLocalLanguageChallengeDataset(),
  ]);
}

export const localLanguageEvalCoverage = Object.freeze({
  required_intents: LOCAL_LANGUAGE_INTENTS.filter((intent) => intent !== "unknown"),
  languages: ["es", "en"],
  slices: ["core", "challenge"],
});

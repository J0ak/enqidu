const normalizeText = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const compact = (values) => values.filter(Boolean);
const list = (value) => Array.isArray(value) ? value : [];

const ENVIRONMENT_LABELS = Object.freeze({
  home: "casa",
  pool: "piscina",
  outdoor: "aire libre",
  trail: "entorno trail",
  functional_training_center: "centro de entrenamiento funcional",
});

function displayEnvironment(value) {
  const key = normalizeText(value).replace(/[\s-]+/g, "_");
  return ENVIRONMENT_LABELS[key] || value;
}

// ENQIDU's existing readiness UI labels values below 62 as "Bajo". Keeping the
// boundary here makes the recommendation rule visible, testable and replaceable.
export const RECOMMENDATION_RULES = Object.freeze({
  lowReadinessUpperBound: 62,
  hardSessionLookbackDays: 2,
});

function dateDistance(from, to) {
  const first = Date.parse(`${from}T12:00:00Z`);
  const second = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.round((second - first) / 86400000);
}

function availableEquipment(context) {
  const explicitInventory = context?.athlete_context?.equipment;
  if (Array.isArray(explicitInventory)) {
    return explicitInventory.filter((item) => item
      && (item.available === true || normalizeText(item.available) === "true"));
  }
  // The RPC's equipment_summary collection is already filtered to valid,
  // available inventory before it enters the Coach context.
  return list(context?.athlete_context?.equipment_summary).filter(Boolean);
}

function activeConstraints(context) {
  return list(context?.recommendation_context?.constraints || context?.constraints)
    .filter((item) => item && item.active !== false);
}

function trainingLocations(context) {
  return list(context?.athlete_context?.constraints)
    .filter((item) => item && (item.location_type || item.display_name));
}

function goals(context) {
  return list(context?.athlete_context?.goals || context?.goals)
    .filter((item) => item && item.active !== false
      && !["archived", "deleted", "inactive", "completed"].includes(normalizeText(item.status)));
}

function joinedText(items) {
  return normalizeText(items.map((item) => typeof item === "string"
    ? item
    : [item?.name, item?.description, item?.goal_type, item?.type, item?.constraint_type]
      .filter(Boolean).join(" ")).join(" "));
}

function modalityOf(session = {}) {
  const text = normalizeText([
    session.session_type,
    session.sport,
    session.garmin_type_label,
    session.title,
  ].filter(Boolean).join(" "));
  if (/(^|\s)hiit($|\s)/.test(text)) return "hiit";
  if (/strength|fuerza|hyrox|crossfit|pesas|lower|upper/.test(text)) return "strength";
  if (/swim|natacion|piscina/.test(text)) return "swim";
  if (/run|running|trail|carrera|correr/.test(text)) return "run";
  if (/bike|cycling|ciclismo|bici/.test(text)) return "bike";
  if (/yoga|mobility|movilidad|recovery|recuperacion/.test(text)) return "recovery";
  return null;
}

function isHard(session = {}) {
  const intensity = normalizeText(session.intensity || session.planned_intensity || session.intensity_label);
  const activityType = normalizeText([
    session.garmin_type_key,
    session.garmin_type_label,
    session.session_type,
  ].filter(Boolean).join(" "));
  return /high|hard|vigorous|alta|duro|max|vo2|umbral|threshold/.test(intensity)
    || /(^|\s)hiit($|\s)/.test(activityType)
    || /vo2|max effort|umbral|intervalos duros/.test(normalizeText(session.title));
}

function recoveryState(recovery = {}) {
  const score = Number(recovery?.readiness?.score);
  const statusText = normalizeText([
    recovery?.readiness?.status,
    recovery?.readiness?.label,
    recovery?.hrv?.status,
    ...list(recovery?.readiness?.flags),
  ].filter(Boolean).join(" "));
  const readinessStatus = normalizeText(recovery?.readiness?.status);
  const readinessUsable = (!readinessStatus || ["available", "partial"].includes(readinessStatus))
    && recovery?.freshness !== "stale";
  const hasScore = readinessUsable && Number.isFinite(score) && score >= 0;
  const explicitlyLow = /low|poor|bajo|mala|unbalanced|desequilibr/.test(statusText);
  return {
    hasData: hasScore || explicitlyLow
      || (recovery?.freshness !== "stale" && recovery?.status === "available"),
    low: explicitlyLow || (hasScore && score < RECOMMENDATION_RULES.lowReadinessUpperBound),
    score: hasScore ? score : null,
  };
}

function resolveEnvironment(equipment, requestedLocation) {
  if (requestedLocation?.key) return requestedLocation.key;
  const locations = [...new Set(equipment
    .map((item) => normalizeText(item.location).replace(/[\s-]+/g, "_"))
    .filter(Boolean))];
  return locations.length === 1 ? locations[0] : null;
}

function findTrainingLocation(locations, environment) {
  if (!environment) return null;
  return locations.find((item) => {
    const type = normalizeText(item.location_type).replace(/[\s-]+/g, "_");
    const name = normalizeText(item.display_name).replace(/[\s-]+/g, "_");
    return type === environment || name.includes(environment);
  }) || null;
}

function equipmentNames(equipment, environment) {
  if (!environment) return [];
  return [...new Set(equipment
    .filter((item) => normalizeText(item.location).replace(/[\s-]+/g, "_") === environment)
    .map((item) => item.name || item.label || item.item_name)
    .filter(Boolean))];
}

function recommendation({ type, title, objective, duration, intensity, environment, equipment, blocks, reasons }) {
  return {
    kind: "calculated_recommendation",
    session_type: type,
    title,
    objective,
    duration_minutes: duration,
    intensity,
    environment,
    equipment,
    blocks,
    reasons,
  };
}

export function buildTrainingRecommendation(context = {}, { requestedLocation = null } = {}) {
  if (list(context?.planned_training?.sessions).length) return null;
  if (normalizeText(context?.training_availability?.status) === "unavailable") {
    return {
      insufficient: true,
      reason: "athlete_unavailable",
      date: context?.training_availability?.date || context?.request?.date || null,
    };
  }

  const equipment = availableEquipment(context);
  const constraints = activeConstraints(context);
  const locations = trainingLocations(context);
  const athleteGoals = goals(context);
  const sessions = list(context?.training_period?.sessions);
  const recovery = recoveryState(context?.health_recovery || {});
  const environment = resolveEnvironment(equipment, requestedLocation);
  const selectedLocation = findTrainingLocation(locations, environment);
  const relevantEquipment = equipmentNames(equipment, environment);
  const constraintText = joinedText(constraints);
  const goalText = joinedText(athleteGoals);
  const requestDate = context?.request?.date || context?.planned_training?.date || null;
  const recentHard = sessions.find((session) => {
    const days = dateDistance(session?.date, requestDate);
    return isHard(session)
      && days != null
      && days >= 0
      && days <= RECOMMENDATION_RULES.hardSessionLookbackDays;
  });
  const recentHardModality = modalityOf(recentHard);
  const evidenceCount = sessions.length + athleteGoals.length + constraints.length
    + equipment.length + Number(recovery.hasData) + Number(Boolean(environment));

  if (!evidenceCount) return { insufficient: true, reason: "insufficient_enqidu_context" };

  if (normalizeText(selectedLocation?.prescription_scope) === "coach_led_only") {
    return {
      insufficient: true,
      reason: "coach_led_environment",
      environment: selectedLocation.display_name || selectedLocation.location_type || environment,
    };
  }

  if (recovery.low) {
    return recommendation({
      type: "recovery",
      title: "Recuperación activa y movilidad",
      objective: "Favorecer la recuperación sin añadir un estímulo intenso",
      duration: 30,
      intensity: "baja",
      environment: environment || "entorno cómodo disponible",
      equipment: relevantEquipment.slice(0, 1),
      blocks: [
        { title: "Movilidad suave", duration_minutes: 10 },
        { title: "Trabajo aeróbico muy fácil", duration_minutes: 15 },
        { title: "Vuelta a la calma", duration_minutes: 5 },
      ],
      reasons: compact([
        recovery.score != null ? `readiness ${Math.round(recovery.score)} registrado` : "señal de recuperación baja registrada",
        constraints.length ? "restricciones activas tenidas en cuenta" : null,
      ]),
    });
  }

  const lowerBodyConstraint = /rodilla|knee|tobillo|ankle|pie|foot|correr|running|impacto/.test(constraintText);
  const upperBodyConstraint = /hombro|shoulder|codo|elbow|muneca|wrist/.test(constraintText);
  if (lowerBodyConstraint || upperBodyConstraint) {
    return recommendation({
      type: "mobility",
      title: "Movilidad y control sin impacto",
      objective: "Mantener actividad respetando la restricción activa registrada",
      duration: 30,
      intensity: "baja",
      environment: environment || "entorno controlado",
      equipment: relevantEquipment.filter((name) => /mat|esterilla|banda|band/.test(normalizeText(name))).slice(0, 2),
      blocks: [
        { title: "Movilidad dentro de un rango cómodo", duration_minutes: 10 },
        { title: "Control motor sin impacto", duration_minutes: 15 },
        { title: "Respiración y vuelta a la calma", duration_minutes: 5 },
      ],
      reasons: ["restricción activa registrada; se evitan impacto y cargas incompatibles"],
    });
  }

  const pool = environment === "pool" || environment === "piscina";
  const outdoor = ["outdoor", "trail", "aire_libre", "parque"].includes(environment);
  const strengthEquipment = relevantEquipment.filter((name) =>
    /barra|rack|mancuerna|dumbbell|kettlebell|pesa|banda|band/.test(normalizeText(name)));
  const goalPrefersStrength = /fuerza|strength|hyrox|crossfit|masa magra|hipertrof|muscle|body[_\s]?composition/.test(goalText);
  const goalPrefersEndurance = /trail|running|correr|carrera|resistencia|endurance|cardio/.test(goalText);

  if (pool && recentHardModality !== "swim") {
    return recommendation({
      type: "swim",
      title: "Natación técnica aeróbica",
      objective: "Construir base aeróbica con énfasis técnico",
      duration: 40,
      intensity: "suave-moderada",
      environment: "piscina",
      equipment: relevantEquipment.slice(0, 3),
      blocks: [
        { title: "Calentamiento fácil", duration_minutes: 10 },
        { title: "Técnica y nado continuo cómodo", duration_minutes: 25 },
        { title: "Vuelta a la calma", duration_minutes: 5 },
      ],
      reasons: compact([goalPrefersEndurance ? "coherente con el objetivo activo" : null, "piscina disponible"]),
    });
  }

  if (["strength", "hiit"].includes(recentHardModality) || goalPrefersEndurance || outdoor) {
    return recommendation({
      type: "aerobic",
      title: "Sesión aeróbica fácil",
      objective: "Desarrollar base aeróbica sin repetir el estímulo duro reciente",
      duration: 40,
      intensity: "suave",
      environment: outdoor ? environment : (environment || "aire libre"),
      equipment: [],
      blocks: [
        { title: "Calentamiento progresivo", duration_minutes: 10 },
        { title: "Trabajo continuo conversacional", duration_minutes: 25 },
        { title: "Vuelta a la calma", duration_minutes: 5 },
      ],
      reasons: compact([
        recentHard ? `estímulo intenso reciente${recentHardModality ? ` (${recentHardModality})` : ""}; no se repite` : null,
        goalPrefersEndurance ? "coherente con el objetivo activo" : null,
        outdoor ? `adaptada al entorno ${environment}` : null,
      ]),
    });
  }

  if (strengthEquipment.length && recentHardModality !== "strength") {
    return recommendation({
      type: "strength",
      title: "Fuerza general controlada",
      objective: "Trabajar fuerza con el material disponible sin buscar fatiga máxima",
      duration: 45,
      intensity: "moderada",
      environment: environment || "entorno con material disponible",
      equipment: strengthEquipment.slice(0, 4),
      blocks: [
        { title: "Activación", duration_minutes: 10 },
        { title: "Fuerza de patrones básicos", duration_minutes: 25 },
        { title: "Accesorios y vuelta a la calma", duration_minutes: 10 },
      ],
      reasons: compact([
        goalPrefersStrength ? "coherente con el objetivo activo" : null,
        "solo utiliza material registrado como disponible",
        recentHardModality ? `evita repetir la modalidad intensa reciente (${recentHardModality})` : null,
      ]),
    });
  }

  return recommendation({
    type: "aerobic",
    title: "Actividad aeróbica fácil sin material",
    objective: "Mantener continuidad con una carga prudente",
    duration: 30,
    intensity: "suave",
    environment: environment || "aire libre",
    equipment: [],
    blocks: [
      { title: "Calentamiento", duration_minutes: 5 },
      { title: "Trabajo continuo conversacional", duration_minutes: 20 },
      { title: "Vuelta a la calma", duration_minutes: 5 },
    ],
    reasons: compact([
      recentHard ? "se evita repetir el estímulo duro reciente" : null,
      recovery.hasData ? "se usan las señales de recuperación disponibles sin inferir las ausentes" : null,
      athleteGoals.length ? "se han considerado los objetivos activos" : null,
    ]),
  });
}

export function explainTrainingRecommendation(result) {
  if (!result || result.insufficient) {
    if (result?.reason === "athlete_unavailable") {
      return `Tienes ${result.date ? `el ${result.date} ` : ""}marcado como no disponible para entrenar. No genero una sesión para ese día.`;
    }
    if (result?.reason === "coach_led_environment") {
      return `Ese entorno está registrado en ENQIDU como sesión guiada${result.environment ? ` (${result.environment})` : ""}. No genero una prescripción autónoma para ese entorno; sigue la sesión del monitor o indícame otro lugar de entrenamiento.`;
    }
    return "No tengo información ENQIDU suficiente para recomendar una sesión con seguridad hoy. Registra un objetivo, entorno o material disponible, o alguna sesión reciente.";
  }
  const material = result.equipment.length ? result.equipment.join(", ") : "sin material específico";
  const blocks = result.blocks.map((block) => `${block.title} (${block.duration_minutes} min)`).join(", ");
  const why = result.reasons.length ? result.reasons.join("; ") : "propuesta prudente con el contexto ENQIDU disponible";
  return `Recomendación calculada (no es un plan guardado): ${result.title}. Objetivo: ${result.objective}. Duración aproximada: ${result.duration_minutes} min. Intensidad: ${result.intensity}. Entorno: ${displayEnvironment(result.environment)}. Material: ${material}. Bloques: ${blocks}. Motivo: ${why}.`;
}

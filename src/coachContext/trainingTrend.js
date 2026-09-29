const asNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const normalizeSummary = (period = {}) => {
  const summary = period?.summary || {};
  return {
    sessions_count: asNonNegativeNumber(summary.sessions_count),
    active_days: asNonNegativeNumber(summary.active_days),
    total_duration_seconds: asNonNegativeNumber(summary.total_duration_seconds),
    activity_types: Object.fromEntries(
      Object.entries(asObject(summary.activity_types))
        .filter(([, value]) => Number(value) > 0)
        .map(([label, value]) => [label, Number(value)])
        .sort(([a], [b]) => a.localeCompare(b, "es")),
    ),
  };
};

const periodRange = (period = {}) => ({
  from: period?.period?.from || null,
  to: period?.period?.to || null,
});

export function buildTrainingTrendComparison(comparison = {}) {
  const currentPeriod = comparison?.current;
  const previousPeriod = comparison?.previous;
  if (!currentPeriod || !previousPeriod) {
    return { comparable: false, reason: "missing_comparison_period" };
  }

  const current = normalizeSummary(currentPeriod);
  const previous = normalizeSummary(previousPeriod);
  const currentTypes = current.activity_types;
  const previousTypes = previous.activity_types;

  const introducedModalities = Object.keys(currentTypes)
    .filter((label) => !previousTypes[label]);
  const missingModalities = Object.keys(previousTypes)
    .filter((label) => !currentTypes[label]);

  return {
    kind: "training_period_comparison",
    comparable: true,
    basis: comparison?.basis || "immediately_preceding_equal_length_period",
    current_period: periodRange(currentPeriod),
    previous_period: periodRange(previousPeriod),
    current,
    previous,
    deltas: {
      sessions_count: current.sessions_count - previous.sessions_count,
      active_days: current.active_days - previous.active_days,
      total_duration_seconds: current.total_duration_seconds - previous.total_duration_seconds,
    },
    introduced_modalities: introducedModalities,
    missing_modalities: missingModalities,
  };
}

const signed = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "sin cambio";
  return number > 0 ? `+${number}` : String(number);
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
};

const formatDurationDelta = (seconds) => {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value === 0) return "sin cambio";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatDuration(Math.abs(value))}`;
};

const formatPeriod = (period = {}) => period.from && period.to
  ? `${period.from}–${period.to}`
  : "periodo sin fechas completas";

const formatActivityTypes = (types = {}) => {
  const entries = Object.entries(types);
  return entries.length ? entries.map(([label, value]) => `${label}: ${value}`).join(", ") : "sin sesiones";
};

export function explainTrainingTrend(result) {
  if (!result?.comparable) {
    return "No tengo un periodo anterior comparable para analizar la tendencia con datos ENQIDU.";
  }

  const current = result.current;
  const previous = result.previous;
  const delta = result.deltas;

  const comparison = [
    `${current.sessions_count} vs ${previous.sessions_count} sesiones (${signed(delta.sessions_count)})`,
    `${current.active_days} vs ${previous.active_days} días activos (${signed(delta.active_days)})`,
    `${formatDuration(current.total_duration_seconds)} vs ${formatDuration(previous.total_duration_seconds)} de entrenamiento (${formatDurationDelta(delta.total_duration_seconds)})`,
  ].join(", ");

  const modalityNotes = [
    `Modalidades actuales: ${formatActivityTypes(current.activity_types)}.`,
    result.introduced_modalities.length
      ? `Aparecen respecto al periodo anterior: ${result.introduced_modalities.join(", ")}.`
      : null,
    result.missing_modalities.length
      ? `No aparecen ahora: ${result.missing_modalities.join(", ")}.`
      : null,
  ].filter(Boolean).join(" ");

  return `Comparando ${formatPeriod(result.current_period)} con ${formatPeriod(result.previous_period)}: ${comparison}. ${modalityNotes} Esto describe carga y volumen registrados; con estos datos por sí solos no puedo afirmar una mejora de rendimiento.`;
}

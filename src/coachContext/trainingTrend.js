const asNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const isoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const shiftIsoDate = (value, days) => {
  const date = isoDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const inclusiveDays = (from, to) => {
  const start = isoDate(from);
  const end = isoDate(to);
  if (!start || !end || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

export function buildTrainingTrendRanges({ from, to, referenceDate } = {}) {
  const fullPeriodDays = inclusiveDays(from, to);
  if (!fullPeriodDays) return null;

  const reference = isoDate(referenceDate);
  const start = isoDate(from);
  const end = isoDate(to);
  if (!start || !end) return null;
  if (reference && reference < start) return null;

  const effectiveEnd = reference && reference < end
    ? referenceDate
    : to;
  const elapsedDays = inclusiveDays(from, effectiveEnd);
  if (!elapsedDays) return null;

  const previousFrom = shiftIsoDate(from, -fullPeriodDays);
  const previousTo = previousFrom
    ? shiftIsoDate(previousFrom, elapsedDays - 1)
    : null;
  if (!previousFrom || !previousTo) return null;

  const partialCurrentPeriod = effectiveEnd !== to;
  return {
    basis: partialCurrentPeriod
      ? "same_elapsed_portion_of_previous_period"
      : "immediately_preceding_equal_length_period",
    partial_current_period: partialCurrentPeriod,
    requested_current_period: { from, to },
    current: { from, to: effectiveEnd },
    previous: { from: previousFrom, to: previousTo },
  };
}

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
    partial_current_period: comparison?.partial_current_period === true,
    requested_current_period: comparison?.requested_current_period || periodRange(currentPeriod),
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

  const scope = result.partial_current_period
    ? `Como el periodo actual sigue en curso, comparo solo el mismo tramo transcurrido: ${formatPeriod(result.current_period)} frente a ${formatPeriod(result.previous_period)}.`
    : `Comparando ${formatPeriod(result.current_period)} con ${formatPeriod(result.previous_period)}.`;

  return `${scope} Resultado: ${comparison}. ${modalityNotes} Esto describe carga y volumen registrados; con estos datos por sí solos no puedo afirmar una mejora de rendimiento.`;
}

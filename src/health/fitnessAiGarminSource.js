import {
  GarminSource, validateCalendarDate, validateGarminSourceRequest,
} from "./garminSource.js";
import { cloneHealthEvidence, normalizeHealthTimestamp } from "./garminAdapter.js";

const PROVENANCE = Object.freeze({
  provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector",
});
const STATUSES = new Set(["available", "partial", "no_data"]);
const SERIES_TYPES = new Set(["heart_rate", "hrv", "stress", "body_battery", "respiration", "spo2"]);
const RESPONSE_SUMMARY_KEYS = Object.freeze({ daily_health: "daily" });
const SECRET_KEY = /^(?:authorization|cookie|(?:access|refresh|auth|bearer)_?token|api_?key|(?:client_?)?secret|credentials?|chatgpt_conversation)$/i;

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
  return value;
}
function array(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value;
}
function own(objectValue, key) { return Object.prototype.hasOwnProperty.call(objectValue, key); }
function finite(value, field, { integer = false, nonnegative = true } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || (nonnegative && value < 0)) {
    throw new TypeError(`${field} must be a ${nonnegative ? "nonnegative " : ""}${integer ? "integer" : "finite number"}`);
  }
  return value;
}
function measurement(source, sourceKey, unit) {
  return own(source, sourceKey) ? { value: source[sourceKey], unit } : undefined;
}
function measurements(entries) {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

/** Remove transport credentials before connector evidence reaches canonical storage. */
function sanitizeEvidence(value) {
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, child]) => [key, sanitizeEvidence(child)]));
  }
  return value;
}
function omitUndefined(value) {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).map(([key, child]) => [key, omitUndefined(child)]));
  return value;
}

function scaled(value, factor, field) {
  if (value === undefined || value === null) return value;
  return finite(value, field) * factor;
}

function liveConnectorDate(data, response, request) {
  const dates = [];
  for (const key of ["daily", "sleep", "stress", "hrv", "spo2"]) {
    const entry = data[key];
    if (entry === undefined || entry === null) continue;
    object(entry, `data.${key}`);
    if (entry.calendar_date !== undefined) dates.push(validateCalendarDate(entry.calendar_date, `data.${key}.calendar_date`));
  }
  const unique = [...new Set(dates)];
  if (unique.length > 1) throw new TypeError("live connector health families disagree on calendar_date");
  if (unique.length === 1) return unique[0];

  const hasSeries = Object.values(response.series ?? {}).some((points) => Array.isArray(points) && points.length > 0);
  if (!hasSeries) return null;
  if (request.from_date !== request.to_date) {
    throw new TypeError("live connector series without calendar_date require a single-day source request");
  }
  return request.from_date;
}

function tuplePoints(points, field) {
  return array(points, field).map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) throw new TypeError(`${field}[${index}] must be [offset_s, value]`);
    return { offset_s: finite(point[0], `${field}[${index}][0]`, { nonnegative: false }), value: point[1] };
  });
}

function normalizeLiveConnectorResponse(response, request) {
  if (response.data === undefined) return response;
  const data = object(response.data, "data");
  const calendarDate = liveConnectorDate(data, response, request);
  const normalized = { ...response };
  const withDate = (entry) => entry ? { calendar_date: calendarDate, ...entry } : null;

  normalized.daily = data.daily ? [withDate({
    steps: data.daily.steps,
    distance_m: scaled(data.daily.distance_km, 1000, "data.daily.distance_km"),
    active_time_seconds: scaled(data.daily.active_time_min, 60, "data.daily.active_time_min"),
    heart_rate: data.daily.heart_rate ? {
      min: data.daily.heart_rate.min, max: data.daily.heart_rate.max,
      resting: data.daily.heart_rate.resting, avg: data.daily.heart_rate.avg,
    } : undefined,
    stress: {
      average: data.daily.stress_avg,
      maximum: data.daily.stress_max,
      qualifier: data.daily.stress_qualifier,
      durations: data.daily.stress_duration_s ? {
        rest_seconds: data.daily.stress_duration_s.rest,
        activity_seconds: data.daily.stress_duration_s.activity,
        low_seconds: data.daily.stress_duration_s.low,
        medium_seconds: data.daily.stress_duration_s.medium,
        high_seconds: data.daily.stress_duration_s.high,
      } : undefined,
    },
    body_battery: data.daily.body_battery ? {
      charged: data.daily.body_battery.charged, drained: data.daily.body_battery.drained,
    } : undefined,
    intensity: data.daily.intensity_duration_s ? {
      moderate_duration_seconds: data.daily.intensity_duration_s.moderate,
      vigorous_duration_seconds: data.daily.intensity_duration_s.vigorous,
    } : undefined,
    calories: data.daily.calories ? {
      active: data.daily.calories.active, bmr: data.daily.calories.bmr, total: data.daily.calories.total,
    } : undefined,
    goals: data.daily.goals ? {
      steps: data.daily.goals.steps,
      weekly_intensity_seconds: data.daily.goals.intensity_duration_s,
      floors_climbed: data.daily.goals.floors_climbed,
    } : undefined,
    floors_climbed: data.daily.floors_climbed,
  })] : [];

  normalized.sleep = data.sleep ? [withDate({
    duration_seconds: scaled(data.sleep.duration_hours, 3600, "data.sleep.duration_hours"),
    stages: data.sleep.phases ? {
      deep_seconds: scaled(data.sleep.phases.deep_hours, 3600, "data.sleep.phases.deep_hours"),
      light_seconds: scaled(data.sleep.phases.light_hours, 3600, "data.sleep.phases.light_hours"),
      rem_seconds: scaled(data.sleep.phases.rem_hours, 3600, "data.sleep.phases.rem_hours"),
      awake_seconds: scaled(data.sleep.phases.awake_hours, 3600, "data.sleep.phases.awake_hours"),
      unmeasurable_seconds: data.sleep.unmeasurable_sleep_s,
    } : undefined,
    sleep_score: data.sleep.sleep_score,
    score_qualifier: data.sleep.sleep_score_qualifier,
    sleep_start_utc: data.sleep.sleep_start_utc,
    sleep_end_utc: data.sleep.sleep_end_utc,
    respiration: data.sleep.avg_respiration === undefined ? undefined : { average_brpm: data.sleep.avg_respiration },
    spo2: data.sleep.avg_spo2 === undefined ? undefined : { average_pct: data.sleep.avg_spo2 },
    sub_scores: data.sleep.sub_scores,
  })] : [];

  normalized.hrv = data.hrv ? [withDate({
    last_night_average_ms: data.hrv.last_night_avg,
    five_minute_high_ms: data.hrv.last_night_5min_high,
    duration_hours: data.hrv.duration_hours,
    readings_count: data.hrv.readings_count,
    readings_min: data.hrv.readings_min,
    readings_max: data.hrv.readings_max,
    start_time_utc: data.hrv.start_time_utc,
  })] : [];

  normalized.stress = data.stress ? [withDate({
    average: data.stress.overall_stress,
    stress_distribution: data.stress.stress_distribution,
    body_battery: data.stress.body_battery,
  })] : [];

  normalized.body_battery = data.stress?.body_battery ? [withDate({
    high: data.stress.body_battery.high,
    low: data.stress.body_battery.low,
  })] : [];
  normalized.respiration = [];
  normalized.spo2 = data.spo2 ? [withDate({
    average_pct: data.spo2.avg_spo2,
    minimum_pct: data.spo2.min_spo2,
    maximum_pct: data.spo2.max_spo2,
    readings_count: data.spo2.readings_count,
    on_demand: data.spo2.on_demand,
    window: data.spo2.window,
  })] : [];
  normalized.heart_rate = data.daily?.heart_rate ? [withDate({
    resting_bpm: data.daily.heart_rate.resting,
    minimum_bpm: data.daily.heart_rate.min,
    maximum_bpm: data.daily.heart_rate.max,
    average_bpm: data.daily.heart_rate.avg,
  })] : [];

  const rawSeries = object(response.series ?? {}, "series");
  const rawMeta = object(response.series_meta ?? {}, "series_meta");
  normalized.series = {};
  normalized.series_meta = {};
  for (const type of [...SERIES_TYPES, "respiration_sleep", "spo2_sleep"]) {
    if (rawSeries[type] === undefined) continue;
    if (!calendarDate && array(rawSeries[type], `series.${type}`).length) {
      throw new TypeError(`series.${type} requires a canonical calendar date`);
    }
    normalized.series[type] = [{ calendar_date: calendarDate ?? request.from_date, points: tuplePoints(rawSeries[type], `series.${type}`) }];
    if (rawMeta[type] !== undefined) normalized.series_meta[type] = [{ calendar_date: calendarDate ?? request.from_date, ...object(rawMeta[type], `series_meta.${type}`) }];
  }
  if (rawSeries.sleep_stages !== undefined) {
    normalized.series.sleep_stages = [{
      calendar_date: calendarDate ?? request.from_date,
      points: array(rawSeries.sleep_stages, "series.sleep_stages").map((point, index) => {
        object(point, `series.sleep_stages[${index}]`);
        return { stage: point.stage, start_utc: point.start_utc, end_utc: point.end_utc };
      }),
    }];
    if (rawMeta.sleep_stages !== undefined) {
      normalized.series_meta.sleep_stages = [{ calendar_date: calendarDate ?? request.from_date, ...object(rawMeta.sleep_stages, "series_meta.sleep_stages") }];
    }
  }
  return normalized;
}

function timestampFromOffset(meta, offset, field) {
  object(meta, `${field}.meta`);
  const basis = object(meta.basis, `${field}.meta.basis`);
  const start = normalizeHealthTimestamp(basis.t0_utc, `${field}.meta.basis.t0_utc`, false);
  const offsetSeconds = finite(offset, `${field}.offset_s`, { nonnegative: false });
  const milliseconds = Date.parse(start) + offsetSeconds * 1000;
  if (!Number.isSafeInteger(milliseconds)) throw new RangeError(`${field} timestamp exceeds the supported range`);
  return new Date(milliseconds).toISOString();
}

function resolution(meta, field) {
  if (!own(meta, "applied_interval_s") || meta.applied_interval_s === null) return undefined;
  const value = finite(meta.applied_interval_s, `${field}.applied_interval_s`, { integer: true });
  if (value === 0) throw new RangeError(`${field}.applied_interval_s must be positive`);
  return { value, unit: "s" };
}

function mapSeries(seriesType, seriesEntry, meta) {
  if (!SERIES_TYPES.has(seriesType)) return [];
  const unit = {
    heart_rate: "bpm", hrv: "ms", stress: "score", body_battery: "score", respiration: "brpm", spo2: "%",
  }[seriesType];
  const points = array(seriesEntry?.points, `series.${seriesType}.points`);
  return points.map((point, index) => {
    object(point, `series.${seriesType}.points[${index}]`);
    const sample = {
      recorded_at: timestampFromOffset(meta, point.offset_s, `series.${seriesType}.points[${index}]`),
      measurement: { value: own(point, "value") ? point.value : null, unit },
      resolution_status: meta.coarsened ? "documented_by_derived_export" : "observed_to_validate",
      raw: sanitizeEvidence(point),
    };
    const nominal = resolution(meta, `series_meta.${seriesType}`);
    if (nominal) sample.nominal_resolution = nominal;
    if (["heart_rate", "respiration", "spo2"].includes(seriesType)) sample.context = point.context ?? "unknown";
    if (seriesType === "stress" && point.status) sample.stress_status = point.status;
    return sample;
  });
}

function mapSleepStages(seriesEntry, meta) {
  return array(seriesEntry?.points, "series.sleep_stages.points").map((point, index) => {
    object(point, `series.sleep_stages.points[${index}]`);
    const absolute = point.start_utc !== undefined || point.end_utc !== undefined;
    const startAt = absolute
      ? normalizeHealthTimestamp(point.start_utc, `series.sleep_stages.points[${index}].start_utc`, false)
      : timestampFromOffset(meta, point.offset_s, `series.sleep_stages.points[${index}]`);
    let endAt;
    let durationSeconds;
    if (absolute) {
      endAt = normalizeHealthTimestamp(point.end_utc, `series.sleep_stages.points[${index}].end_utc`, false);
      durationSeconds = (Date.parse(endAt) - Date.parse(startAt)) / 1000;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new RangeError("sleep stage end_utc must follow start_utc");
    } else {
      durationSeconds = own(point, "duration_s") ? finite(point.duration_s, `series.sleep_stages.points[${index}].duration_s`) : null;
      if (!durationSeconds) throw new TypeError("sleep stage series points require a positive duration_s; intervals are never inferred");
      endAt = new Date(Date.parse(startAt) + durationSeconds * 1000).toISOString();
    }
    return {
      stage_code: point.stage ?? "unknown", start_at: startAt, end_at: endAt,
      duration: { value: durationSeconds, unit: "s" }, raw: sanitizeEvidence(point),
    };
  });
}

function baseRecord(type, entry, response, request, retrievedAt, raw) {
  const calendarDate = validateCalendarDate(entry.calendar_date);
  if (calendarDate < request.from_date || calendarDate > request.to_date) {
    throw new RangeError(`connector ${type} date is outside the requested range`);
  }
  return {
    ...PROVENANCE, data_type: type, calendar_date: calendarDate, timezone: request.timezone,
    retrieved_at: retrievedAt,
    ...(entry.observed_at !== undefined ? { observed_at: entry.observed_at } : {}),
    ...(entry.source_updated_at !== undefined ? { source_updated_at: entry.source_updated_at } : {}),
    ...(entry.source_identifier !== undefined ? { source_identifier: entry.source_identifier } : {}),
    data_confidence: entry.data_confidence ?? "reported",
    raw: sanitizeEvidence({ connector: raw, response_metadata: response.response_metadata ?? null }),
  };
}

const dailyMetrics = (value) => measurements([
  ["steps", measurement(value, "steps", "count")], ["distance_m", measurement(value, "distance_m", "m")],
  ["active_time_seconds", measurement(value, "active_time_seconds", "s")],
  ["min_heart_rate_bpm", measurement(value.heart_rate ?? {}, "min", "bpm")],
  ["max_heart_rate_bpm", measurement(value.heart_rate ?? {}, "max", "bpm")],
  ["resting_heart_rate_bpm", measurement(value.heart_rate ?? {}, "resting", "bpm")],
  ["average_stress_level", measurement(value.stress ?? {}, "average", "score")],
  ["max_stress_level", measurement(value.stress ?? {}, "maximum", "score")],
  ["stress_duration_seconds", measurement(value.stress?.durations ?? {}, "total_seconds", "s")],
  ["rest_stress_duration_seconds", measurement(value.stress?.durations ?? {}, "rest_seconds", "s")],
  ["activity_stress_duration_seconds", measurement(value.stress?.durations ?? {}, "activity_seconds", "s")],
  ["low_stress_duration_seconds", measurement(value.stress?.durations ?? {}, "low_seconds", "s")],
  ["medium_stress_duration_seconds", measurement(value.stress?.durations ?? {}, "medium_seconds", "s")],
  ["high_stress_duration_seconds", measurement(value.stress?.durations ?? {}, "high_seconds", "s")],
  ["body_battery_charged", measurement(value.body_battery ?? {}, "charged", "score")],
  ["body_battery_drained", measurement(value.body_battery ?? {}, "drained", "score")],
  ["moderate_intensity_seconds", measurement(value.intensity ?? {}, "moderate_duration_seconds", "s")],
  ["vigorous_intensity_seconds", measurement(value.intensity ?? {}, "vigorous_duration_seconds", "s")],
  ["active_kcal", measurement(value.calories ?? {}, "active", "kcal")],
  ["bmr_kcal", measurement(value.calories ?? {}, "bmr", "kcal")],
  ["steps_goal", measurement(value.goals ?? {}, "steps", "count")],
  ["intensity_goal_seconds", measurement(value.goals ?? {}, "weekly_intensity_seconds", "s")],
]);

const summaryMappers = {
  daily_health: (value) => ({ measurements: dailyMetrics(value), stress_qualifier: value.stress?.qualifier }),
  sleep: (value) => ({
    sleep_start_at: value.sleep_start_utc, sleep_end_at: value.sleep_end_utc,
    measurements: measurements([
      ["total_duration_seconds", measurement(value, "duration_seconds", "s")],
      ["deep_sleep_seconds", measurement(value.stages ?? {}, "deep_seconds", "s")],
      ["light_sleep_seconds", measurement(value.stages ?? {}, "light_seconds", "s")],
      ["rem_sleep_seconds", measurement(value.stages ?? {}, "rem_seconds", "s")],
      ["awake_seconds", measurement(value.stages ?? {}, "awake_seconds", "s")],
      ["unmeasurable_seconds", measurement(value.stages ?? {}, "unmeasurable_seconds", "s")],
      ["sleep_score", measurement(value, "sleep_score", "score")],
      ["respiration_avg_brpm", measurement(value.respiration ?? {}, "average_brpm", "brpm")],
      ["respiration_min_brpm", measurement(value.respiration ?? {}, "minimum_brpm", "brpm")],
      ["spo2_avg_pct", measurement(value.spo2 ?? {}, "average_pct", "%")],
      ["spo2_min_pct", measurement(value.spo2 ?? {}, "minimum_pct", "%")],
      ["hrv_last_night_avg_ms", measurement(value.hrv ?? {}, "last_night_average_ms", "ms")],
      ["hrv_last_night_5min_high_ms", measurement(value.hrv ?? {}, "five_minute_high_ms", "ms")],
    ]),
  }),
  hrv: (value) => ({ status: value.status, measurements: measurements([
    ["last_night_avg_ms", measurement(value, "last_night_average_ms", "ms")],
    ["last_night_5min_high_ms", measurement(value, "five_minute_high_ms", "ms")],
  ]) }),
  stress: (value) => ({ stress_qualifier: value.qualifier, measurements: measurements([
    ["average_stress_level", measurement(value, "average", "score")],
    ["max_stress_level", measurement(value, "maximum", "score")],
  ]) }),
  body_battery: (value) => ({ measurements: measurements([
    ["body_battery_current", measurement(value, "current", "score")],
    ["body_battery_charged", measurement(value, "charged", "score")],
    ["body_battery_drained", measurement(value, "drained", "score")],
  ]) }),
  respiration: (value) => ({ measurements: measurements([
    ["respiration_avg_brpm", measurement(value, "average_brpm", "brpm")],
    ["respiration_min_brpm", measurement(value, "minimum_brpm", "brpm")],
  ]) }),
  spo2: (value) => ({ measurements: measurements([
    ["spo2_avg_pct", measurement(value, "average_pct", "%")],
    ["spo2_min_pct", measurement(value, "minimum_pct", "%")],
  ]) }),
  heart_rate: (value) => ({ measurements: measurements([
    ["resting_heart_rate_bpm", measurement(value, "resting_bpm", "bpm")],
    ["min_heart_rate_bpm", measurement(value, "minimum_bpm", "bpm")],
    ["max_heart_rate_bpm", measurement(value, "maximum_bpm", "bpm")],
  ]) }),
};

function entryByDate(entries, date, field) {
  const matching = entries.filter((entry, index) => {
    object(entry, `${field}[${index}]`);
    return entry.calendar_date === date;
  });
  if (matching.length > 1) throw new TypeError(`${field} contains duplicate calendar_date ${date}`);
  return matching[0];
}

/**
 * Provisional server-side source. `transport` is the only connector-specific
 * boundary and must expose getHealthSummary(request). No connector SDK, URL,
 * credential, database client, or browser global is assumed here.
 */
export class FitnessAiGarminSource extends GarminSource {
  constructor({ transport, clock = () => new Date() } = {}) {
    super();
    if (!transport || typeof transport.getHealthSummary !== "function") {
      throw new TypeError("FitnessAiGarminSource requires an injected transport.getHealthSummary function");
    }
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.transport = transport;
    this.clock = clock;
  }

  async getHealthRecords(input) {
    if (typeof window !== "undefined") throw new Error("Fitness AI Garmin source requires a server runtime");
    const request = validateGarminSourceRequest(input);
    const rawResponse = object(await this.transport.getHealthSummary({ ...request }), "Fitness AI health summary response");
    const response = normalizeLiveConnectorResponse(rawResponse, request);
    if (!STATUSES.has(response.data_status)) throw new TypeError("connector data_status must be available, partial, or no_data");
    const retrievedAt = normalizeHealthTimestamp(response.retrieved_at ?? this.clock().toISOString(), "retrieved_at", false);
    const nextCursor = response.next_cursor ?? null;
    if (nextCursor !== null && (typeof nextCursor !== "string" || !nextCursor.trim())) throw new TypeError("connector next_cursor must be opaque text or null");
    const metadata = cloneHealthEvidence(sanitizeEvidence({
      data_status: response.data_status, latest_available_date: response.latest_available_date ?? null,
      series_meta: response.series_meta ?? {}, limitations: response.limitations ?? null,
      response_metadata: response.response_metadata ?? null,
    }));
    if (response.data_status === "no_data") return { records: [], next_cursor: nextCursor, source_metadata: metadata };

    const records = [];
    const summaries = {};
    for (const type of Object.keys(summaryMappers)) {
      const responseKey = RESPONSE_SUMMARY_KEYS[type] ?? type;
      summaries[type] = array(response[responseKey], responseKey);
    }
    const series = object(response.series ?? {}, "series");
    const seriesMeta = object(response.series_meta ?? {}, "series_meta");
    const dates = new Set();
    for (const entries of Object.values(summaries)) for (const entry of entries) dates.add(validateCalendarDate(object(entry, "summary entry").calendar_date));
    for (const type of SERIES_TYPES) for (const entry of array(series[type], `series.${type}`)) dates.add(validateCalendarDate(object(entry, `series.${type} entry`).calendar_date));
    for (const type of ["respiration_sleep", "spo2_sleep", "sleep_stages"]) {
      for (const entry of array(series[type], `series.${type}`)) dates.add(validateCalendarDate(object(entry, `series.${type} entry`).calendar_date));
    }

    for (const date of [...dates].sort()) {
      for (const [type, mapper] of Object.entries(summaryMappers)) {
        const summary = entryByDate(summaries[type], date, type);
        const seriesEntry = SERIES_TYPES.has(type) ? entryByDate(array(series[type], `series.${type}`), date, `series.${type}`) : undefined;
        const metaEntry = SERIES_TYPES.has(type) ? entryByDate(array(seriesMeta[type], `series_meta.${type}`), date, `series_meta.${type}`) : undefined;
        const sleepType = ["respiration", "spo2"].includes(type) ? `${type}_sleep` : null;
        const sleepSeriesEntry = sleepType ? entryByDate(array(series[sleepType], `series.${sleepType}`), date, `series.${sleepType}`) : undefined;
        const sleepSeriesMeta = sleepType ? entryByDate(array(seriesMeta[sleepType], `series_meta.${sleepType}`), date, `series_meta.${sleepType}`) : undefined;
        if (!summary && !seriesEntry && !sleepSeriesEntry) continue;
        if (seriesEntry && !metaEntry) throw new TypeError(`series.${type} requires matching series_meta evidence`);
        if (sleepSeriesEntry && !sleepSeriesMeta) throw new TypeError(`series.${sleepType} requires matching series_meta evidence`);
        const evidence = { summary: summary ?? null, series: seriesEntry ?? null, series_meta: metaEntry ?? null,
          sleep_series: sleepSeriesEntry ?? null, sleep_series_meta: sleepSeriesMeta ?? null };
        const basis = summary ?? seriesEntry ?? sleepSeriesEntry;
        const relatedSeries = [];
        if (sleepSeriesEntry) {
          relatedSeries.push(...mapSeries(type, {
            ...sleepSeriesEntry, points: sleepSeriesEntry.points.map((point) => ({ ...point, context: "sleep" })),
          }, sleepSeriesMeta));
        }
        let stages;
        if (type === "sleep") {
          const stageEntry = entryByDate(array(series.sleep_stages, "series.sleep_stages"), date, "series.sleep_stages");
          const stageMeta = entryByDate(array(seriesMeta.sleep_stages, "series_meta.sleep_stages"), date, "series_meta.sleep_stages");
          if (stageEntry && !stageMeta) throw new TypeError("series.sleep_stages requires matching series_meta evidence");
          if (stageEntry) {
            evidence.sleep_stages = stageEntry;
            evidence.sleep_stages_meta = stageMeta;
            stages = mapSleepStages(stageEntry, stageMeta);
          }
        }
        records.push(omitUndefined({
          ...baseRecord(type, basis, response, request, retrievedAt, evidence),
          ...(summary ? mapper(summary) : {}),
          ...((seriesEntry || relatedSeries.length) ? { samples: [...(seriesEntry ? mapSeries(type, seriesEntry, metaEntry) : []), ...relatedSeries] } : {}),
          ...(stages ? { stages } : {}),
        }));
      }
    }
    if (records.length > 100) throw new RangeError("connector page maps to more than 100 canonical records; transport must paginate more narrowly");
    return { records, next_cursor: nextCursor, source_metadata: metadata };
  }
}

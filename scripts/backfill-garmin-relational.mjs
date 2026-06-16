import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const DEFAULT_SESSION_ID = "eedf9854-3176-4d82-b8df-c2bdf1ab1df3";
const SET_MESSAGE_TYPES = ["set", "sets", "workout_step", "workout_steps"];
const LAP_MESSAGE_TYPES = ["lap", "laps", "split", "splits", "split_summary", "split_summaries"];

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run backfill:garmin -- [session-id] [--fit-file path/to/activity.fit]\n\nDefaults to session ${DEFAULT_SESSION_ID}.\nRequires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.\n--fit-file augments existing record payloads with Garmin record field 108 respiration data when present.`);
  process.exit(0);
}

const fitFileIndex = args.findIndex((arg) => arg === "--fit-file" || arg === "--fitFile");
const fitFilePath = fitFileIndex >= 0 ? args[fitFileIndex + 1] : null;
if (fitFileIndex >= 0 && (!fitFilePath || fitFilePath.startsWith("--"))) {
  console.error("Missing FIT file path after --fit-file.");
  process.exit(1);
}
const positionalArgs = args.filter((arg, index) => (
  index !== fitFileIndex &&
  index !== fitFileIndex + 1 &&
  arg !== "--fit-file" &&
  arg !== "--fitFile"
));
const sessionId = positionalArgs[0] || DEFAULT_SESSION_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

async function main() {
  assertUuid(sessionId);
  console.log(`Backfilling Garmin/FIT relational rows for session ${sessionId}`);

  const session = await fetchSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const before = await getCounts(sessionId);
  printCounts("Before", before);

  let messages = await fetchFitMessages(sessionId);
  let updatedSampleRespiration = 0;
  let updatedPayloadRespiration = 0;
  if (fitFilePath) {
    const respirationSeries = extractFitRecordRespirationSeriesFromFile(fitFilePath);
    if (respirationSeries.some((value) => value != null)) {
      messages = mergeRespirationIntoFitMessages(messages, respirationSeries);
      updatedSampleRespiration = await backfillSessionSampleRespiration(sessionId, respirationSeries);
      updatedPayloadRespiration = await backfillFitRecordPayloadRespiration(sessionId, respirationSeries);
    } else {
      console.log(`No temporal respiration field 108 values found in ${fitFilePath}.`);
    }
  }
  const samples = mergeTemporalSamples(await fetchSessionSamples(sessionId), samplesFromFitRecordMessages(messages));
  const messageCounts = countBy(messages, "message_type");
  printMessageCounts(messageCounts);

  let insertedLaps = 0;
  let insertedGarminSets = 0;
  const insertedMetrics = await insertMissingSessionMetrics(sessionId, messages, samples);

  if (before.session_laps === 0) {
    const lapRows = chooseRowsByPriority(messages, LAP_MESSAGE_TYPES);
    if (lapRows.length) {
      const prepared = normalizeLapRows(lapRows, samples);
      if (prepared.length) {
        await insertInChunks("session_laps", prepared, 500);
        insertedLaps = prepared.length;
      }
    }
  } else {
    console.log("Skipping session_laps: rows already exist for this session.");
  }

  if (before.session_garmin_sets === 0) {
    const setRows = chooseRowsByPriority(messages, SET_MESSAGE_TYPES);
    if (setRows.length) {
      const prepared = normalizeGarminSetRows(setRows);
      if (prepared.length) {
        await insertInChunks("session_garmin_sets", prepared, 500);
        insertedGarminSets = prepared.length;
      }
    }
  } else {
    console.log("Skipping session_garmin_sets: rows already exist for this session.");
  }

  console.log(`Inserted session_laps: ${insertedLaps}`);
  console.log(`Inserted session_garmin_sets: ${insertedGarminSets}`);
  console.log(`Inserted session_metrics: ${insertedMetrics}`);
  if (fitFilePath) {
    console.log(`Updated session_samples respiration payloads: ${updatedSampleRespiration}`);
    console.log(`Updated fit_message_payloads respiration payloads: ${updatedPayloadRespiration}`);
  }

  const after = await getCounts(sessionId);
  printCounts("After", after);
}

async function fetchSession(id) {
  const { data, error } = await supabase
    .from("training_sessions")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchFitMessages(id) {
  const { data, error } = await supabase
    .from("fit_message_payloads")
    .select("message_type,message_order,payload")
    .eq("session_id", id)
    .order("message_order", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    session_id: id,
    message_type: `${row.message_type || ""}`.toLowerCase(),
    payload: row.payload || {},
  }));
}

async function fetchSessionSamples(id) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("session_samples")
      .select("elapsed_seconds,heart_rate_bpm,raw_payload")
      .eq("session_id", id)
      .order("elapsed_seconds", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function backfillSessionSampleRespiration(id, respirationSeries) {
  const rows = await fetchRowsForPayloadUpdate("session_samples", id, "id,sample_order,raw_payload", "sample_order");
  return updateJsonPayloadRows("session_samples", rows, respirationSeries, "raw_payload");
}

async function backfillFitRecordPayloadRespiration(id, respirationSeries) {
  const { data, error } = await supabase
    .from("fit_message_payloads")
    .select("id,message_order,payload")
    .eq("session_id", id)
    .in("message_type", ["record", "records"])
    .order("message_order", { ascending: true });
  if (error) throw error;
  return updateJsonPayloadRows("fit_message_payloads", data || [], respirationSeries, "payload");
}

async function fetchRowsForPayloadUpdate(table, id, columns, orderColumn) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("session_id", id)
    .order(orderColumn, { ascending: true });
  if (error) throw error;
  return data || [];
}

async function updateJsonPayloadRows(table, rows, respirationSeries, payloadColumn) {
  let updated = 0;
  for (let index = 0; index < rows.length && index < respirationSeries.length; index += 1) {
    const respiration = respirationSeries[index];
    if (respiration == null) continue;
    const currentPayload = rows[index][payloadColumn] || {};
    if (numberOrNull(firstValue(currentPayload, ["enhanced_respiration_rate", "respiration_rate", "respiration_brpm"])) != null) continue;
    const nextPayload = {
      ...currentPayload,
      enhanced_respiration_rate: respiration,
      respiration_rate: respiration,
      respiration_brpm: respiration,
    };
    const { error } = await supabase
      .from(table)
      .update({ [payloadColumn]: nextPayload })
      .eq("id", rows[index].id);
    if (error) throw error;
    updated += 1;
  }
  return updated;
}

async function getCounts(id) {
  const [laps, sets, blocks, metrics, payloads] = await Promise.all([
    countRows("session_laps", id),
    countRows("session_garmin_sets", id),
    countRows("session_blocks", id),
    countRows("session_metrics", id),
    countRows("fit_message_payloads", id),
  ]);

  return {
    fit_message_payloads: payloads,
    session_metrics: metrics,
    session_laps: laps,
    session_garmin_sets: sets,
    session_blocks: blocks,
  };
}

async function countRows(table, id) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);
  if (error) throw error;
  return count || 0;
}

async function insertInChunks(table, rows, size) {
  for (let index = 0; index < rows.length; index += size) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + size));
    if (error) throw error;
  }
}

async function insertMissingSessionMetrics(id, messages, samples) {
  const rows = buildSessionMetricRows(messages, samples);
  if (!rows.length) return 0;
  const codes = rows.map((row) => row.metric_code);
  const { data, error } = await supabase
    .from("session_metrics")
    .select("metric_code")
    .eq("session_id", id)
    .in("metric_code", codes);
  if (error) throw error;

  const existing = new Set((data || []).map((row) => row.metric_code));
  const missing = rows
    .filter((row) => !existing.has(row.metric_code))
    .map((row) => ({ ...row, session_id: id }));
  if (!missing.length) return 0;
  await insertInChunks("session_metrics", missing, 500);
  return missing.length;
}

function buildSessionMetricRows(messages, samples) {
  const sessionPayload = firstMessagePayload(messages, ["session", "sessions"]);
  const time = timeMetricsFromFitSessionPayload(sessionPayload);
  const sessionRespiration = respirationFromFitSessionPayload(sessionPayload);
  const respirationValues = samples
    .map(sampleRespirationValue)
    .filter((value) => value != null && value > 0 && value < 80);
  const respirationSource = respirationValues.length ? "fit_record_samples" : "fit_session_message";
  const respirationConfidence = respirationValues.length ? "derived_from_fit_records" : "reported";
  const respirationAvg = respirationValues.length ? Math.round(average(respirationValues)) : sessionRespiration.avg;
  const respirationMax = respirationValues.length ? Math.round(Math.max(...respirationValues)) : sessionRespiration.max;
  const respirationMin = respirationValues.length ? Math.round(Math.min(...respirationValues)) : sessionRespiration.min;
  const rows = [
    ["duration_total_seconds", "Tiempo total", time.totalSeconds, "s", "fit_session_message", "reported"],
    ["active_time", "Tiempo de trabajo", time.activeSeconds, "s", "fit_session_message", "reported"],
    ["rest_time", "Tiempo de descanso", time.restSeconds, "s", "fit_session_message", "reported"],
    ["respiration_avg_brpm", "Frecuencia respiratoria media", respirationAvg, "brpm", respirationSource, respirationConfidence],
    ["respiration_max_brpm", "Frecuencia respiratoria maxima", respirationMax, "brpm", respirationSource, respirationConfidence],
    ["respiration_min_brpm", "Frecuencia respiratoria minima", respirationMin, "brpm", respirationSource, respirationConfidence],
  ];
  return rows
    .filter(([, , value]) => value !== null && value !== undefined && value !== "")
    .map(([metric_code, metric_name, value_numeric, unit, source_path, confidence]) => ({
      metric_code,
      metric_name,
      value_numeric,
      unit,
      metric_scope: "session",
      source_path,
      confidence,
    }));
}

function respirationFromFitSessionPayload(payload = {}) {
  return {
    avg: integerOrNull(firstValue(payload, ["enhanced_avg_respiration_rate", "avg_respiration_rate", "average_respiration_rate"])),
    max: integerOrNull(firstValue(payload, ["enhanced_max_respiration_rate", "max_respiration_rate", "maximum_respiration_rate"])),
    min: integerOrNull(firstValue(payload, ["enhanced_min_respiration_rate", "min_respiration_rate", "minimum_respiration_rate"])),
  };
}

function firstMessagePayload(messages, types) {
  return messages.find((row) => types.includes(row.message_type))?.payload || {};
}

function timeMetricsFromFitSessionPayload(payload = {}) {
  const elapsed = numberOrNull(firstValue(payload, ["total_elapsed_time", "total_elapsed_time_seconds", "elapsed_time", "duration_seconds"]));
  const active = numberOrNull(firstValue(payload, ["total_timer_time", "total_timer_time_seconds", "timer_time", "active_time"]));
  const total = elapsed ?? active;
  const rest = numberOrNull(firstValue(payload, ["total_rest_time", "elapsed_rest_time", "rest_seconds"])) ??
    (total != null && active != null && total >= active ? total - active : null);
  return {
    totalSeconds: integerOrNull(total),
    activeSeconds: integerOrNull(active),
    restSeconds: integerOrNull(rest),
  };
}

function samplesFromFitRecordMessages(messages) {
  return messages
    .filter((row) => row.message_type === "record" || row.message_type === "records")
    .map((row, index) => {
      const payload = row.payload || {};
      return {
        elapsed_seconds: numberOrNull(firstValue(payload, ["elapsed_seconds", "elapsed_time", "timer_time"])) ?? numberOrNull(row.message_order) ?? index,
        heart_rate_bpm: numberOrNull(firstValue(payload, ["heart_rate", "heart_rate_bpm"])),
        raw_payload: payload,
      };
    });
}

function mergeRespirationIntoFitMessages(messages, respirationSeries) {
  let recordIndex = 0;
  return messages.map((row) => {
    if (row.message_type !== "record" && row.message_type !== "records") return row;
    const respiration = respirationSeries[recordIndex];
    recordIndex += 1;
    if (respiration == null) return row;
    return {
      ...row,
      payload: {
        ...(row.payload || {}),
        enhanced_respiration_rate: row.payload?.enhanced_respiration_rate ?? respiration,
        respiration_rate: row.payload?.respiration_rate ?? respiration,
        respiration_brpm: row.payload?.respiration_brpm ?? respiration,
      },
    };
  });
}

function extractFitRecordRespirationSeriesFromFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`FIT file not found: ${filePath}`);
  const blob = new Uint8Array(fs.readFileSync(filePath));
  return extractFitRecordRespirationSeries(blob);
}

function extractFitRecordRespirationSeries(blob) {
  const headerLength = blob[0];
  const protocolVersion = blob[1];
  if (protocolVersion < 16 || headerLength < 12) return [];
  const dataLength = blob[4] | (blob[5] << 8) | (blob[6] << 16) | (blob[7] << 24);
  const crcStart = headerLength + dataLength;
  const messageTypes = [];
  const values = [];
  let loopIndex = headerLength;

  while (loopIndex < crcStart) {
    const recordHeader = blob[loopIndex];
    if ((recordHeader & 0x40) === 0x40) {
      const definition = parseFitDefinition(blob, loopIndex);
      if (!definition) break;
      messageTypes[definition.localMessageType] = definition;
      loopIndex = definition.nextIndex;
      continue;
    }

    const compressed = (recordHeader & 0x80) === 0x80;
    const localMessageType = compressed ? (recordHeader >> 5) & 0x03 : recordHeader & 0x0f;
    const definition = messageTypes[localMessageType];
    if (!definition) break;
    let readIndex = loopIndex + 1;
    let respiration = null;
    for (const field of definition.fields) {
      if (definition.globalMessageNumber === 20 && field.fieldNumber === 108) {
        const raw = readFitNumber(blob, readIndex, field.size, field.baseType, definition.littleEndian);
        if (raw != null && raw > 0 && raw < 8000) respiration = Math.round(raw) / 100;
      }
      readIndex += field.size;
    }
    for (const field of definition.developerFields) readIndex += field.size;
    if (definition.globalMessageNumber === 20) values.push(respiration);
    loopIndex = readIndex;
  }

  return values;
}

function parseFitDefinition(blob, startIndex) {
  const recordHeader = blob[startIndex];
  const hasDeveloperData = (recordHeader & 0x20) === 0x20;
  const localMessageType = recordHeader & 0x0f;
  const littleEndian = blob[startIndex + 2] === 0;
  const globalMessageNumber = littleEndian
    ? blob[startIndex + 3] | (blob[startIndex + 4] << 8)
    : (blob[startIndex + 3] << 8) | blob[startIndex + 4];
  const numberOfFields = blob[startIndex + 5];
  const fields = [];
  let readIndex = startIndex + 6;
  for (let index = 0; index < numberOfFields; index += 1) {
    fields.push({
      fieldNumber: blob[readIndex],
      size: blob[readIndex + 1],
      baseType: blob[readIndex + 2],
    });
    readIndex += 3;
  }
  const developerFields = [];
  if (hasDeveloperData) {
    const numberOfDeveloperFields = blob[readIndex];
    readIndex += 1;
    for (let index = 0; index < numberOfDeveloperFields; index += 1) {
      developerFields.push({
        fieldNumber: blob[readIndex],
        size: blob[readIndex + 1],
        developerDataIndex: blob[readIndex + 2],
      });
      readIndex += 3;
    }
  }
  return { localMessageType, globalMessageNumber, littleEndian, fields, developerFields, nextIndex: readIndex };
}

function readFitNumber(blob, index, size, baseType, littleEndian) {
  const type = baseType & 0xff;
  const view = new DataView(blob.buffer, blob.byteOffset + index, size);
  if (size === 1) {
    const value = view.getUint8(0);
    return value === 0xff ? null : value;
  }
  if (size === 2) {
    const value = view.getUint16(0, littleEndian);
    return value === 0xffff ? null : value;
  }
  if (size === 4 && type === 0x88) return view.getFloat32(0, littleEndian);
  if (size === 4) {
    const value = view.getUint32(0, littleEndian);
    return value === 0xffffffff ? null : value;
  }
  return null;
}

function mergeTemporalSamples(sessionSamples = [], fitRecordSamples = []) {
  const byPosition = new Map();
  const put = (sample, preferExisting = false) => {
    const elapsed = numberOrNull(sample.elapsed_seconds);
    const key = elapsed != null ? `t:${Math.round(elapsed * 10) / 10}` : `o:${byPosition.size}`;
    const current = byPosition.get(key);
    if (!current) {
      byPosition.set(key, sample);
      return;
    }
    byPosition.set(key, {
      ...current,
      ...sample,
      heart_rate_bpm: preferExisting ? current.heart_rate_bpm ?? sample.heart_rate_bpm : sample.heart_rate_bpm ?? current.heart_rate_bpm,
      raw_payload: {
        ...(current.raw_payload || {}),
        ...(sample.raw_payload || {}),
      },
    });
  };
  fitRecordSamples.forEach((sample) => put(sample, false));
  sessionSamples.forEach((sample) => put(sample, true));
  return [...byPosition.values()].sort((a, b) => Number(a.elapsed_seconds || 0) - Number(b.elapsed_seconds || 0));
}

function chooseRowsByPriority(messages, priorities) {
  for (const messageType of priorities) {
    const rows = messages.filter((row) => row.message_type === messageType);
    if (rows.length) {
      console.log(`Using ${messageType} messages for ${priorities === LAP_MESSAGE_TYPES ? "session_laps" : "session_garmin_sets"}.`);
      return rows;
    }
  }
  return [];
}

function normalizeLapRows(rows, samples = []) {
  return withElapsedWindows(rows)
    .map(({ row, index, start, end, duration, active, rest }) => {
      const hr = heartRateForWindow(samples, start, end, {
        avg: firstValue(row.payload, ["avg_heart_rate", "average_heart_rate", "heart_rate_avg_bpm"]),
        max: firstValue(row.payload, ["max_heart_rate", "maximum_heart_rate", "heart_rate_max_bpm"]),
      });
      const respiration = respirationForWindow(samples, start, end);
      return {
        session_id: row.session_id,
        lap_index: fitOrder(row.payload, row.message_order, index + 1, ["lap_index", "split_index"]),
        source: lapSource(row.message_type),
        start_elapsed_seconds: integerOrNull(start),
        end_elapsed_seconds: integerOrNull(end),
        duration_seconds: integerOrNull(duration),
        active_seconds: integerOrNull(active),
        rest_seconds: integerOrNull(rest),
        distance_meters: numberOrNull(firstValue(row.payload, ["total_distance", "distance"])),
        heart_rate_avg_bpm: integerOrNull(hr.avg),
        heart_rate_max_bpm: integerOrNull(hr.max),
        raw_payload: {
          ...row.payload,
          _enqidu_computed: {
            heart_rate_avg_bpm: integerOrNull(hr.avg),
            heart_rate_max_bpm: integerOrNull(hr.max),
            respiration_avg_brpm: integerOrNull(respiration.avg),
            respiration_max_brpm: integerOrNull(respiration.max),
          },
        },
      };
    })
    .filter((row) => row.duration_seconds != null || (row.start_elapsed_seconds != null && row.end_elapsed_seconds != null));
}

function normalizeGarminSetRows(rows) {
  return withElapsedWindows(rows)
    .map(({ row, index, start, end, duration, active, rest }) => ({
      session_id: row.session_id,
      source: setSource(row.message_type),
      series_order: fitOrder(row.payload, row.message_order, index + 1, ["set_index"]),
      garmin_exercise_name: firstValue(row.payload, ["exercise_name", "name", "category", "sport"]),
      start_elapsed_seconds: integerOrNull(start),
      end_elapsed_seconds: integerOrNull(end),
      duration_seconds: integerOrNull(duration),
      active_seconds: integerOrNull(active),
      rest_seconds: integerOrNull(rest),
      repetitions: integerOrNull(firstValue(row.payload, ["repetitions", "reps", "num_reps"])),
      load_value: numberOrNull(firstValue(row.payload, ["weight", "load_value"])),
      load_unit: firstValue(row.payload, ["weight", "load_value"]) == null ? null : firstValue(row.payload, ["load_unit"]) || "kg",
      heart_rate_avg_bpm: integerOrNull(firstValue(row.payload, ["avg_heart_rate", "average_heart_rate", "heart_rate_avg_bpm"])),
      heart_rate_max_bpm: integerOrNull(firstValue(row.payload, ["max_heart_rate", "maximum_heart_rate", "heart_rate_max_bpm"])),
      raw_payload: row.payload,
      confidence: row.message_type === "set" || row.message_type === "sets" ? "reported" : "derived_from_fit_payload",
    }))
    .filter((row) =>
      row.duration_seconds != null ||
      row.active_seconds != null ||
      row.rest_seconds != null ||
      row.repetitions != null ||
      row.garmin_exercise_name,
    );
}

function withElapsedWindows(rows) {
  let cursor = 0;
  return rows.map((row, index) => {
    const payload = row.payload || {};
    const explicitStart = numberOrNull(firstValue(payload, ["start_elapsed_seconds", "start_time_seconds", "start_elapsed_time"]));
    const explicitEnd = numberOrNull(firstValue(payload, ["end_elapsed_seconds", "end_time_seconds", "end_elapsed_time"]));
    const active = numberOrNull(firstValue(payload, ["active_seconds", "active_time", "total_timer_time", "total_timer_time_seconds", "timer_time", "duration"]));
    const duration = numberOrNull(firstValue(payload, ["duration_seconds", "total_elapsed_time", "total_elapsed_time_seconds", "elapsed_time", "duration"])) ?? active;
    const start = explicitStart ?? cursor;
    const end = explicitEnd ?? (start != null && duration != null ? start + duration : null);
    const rest = numberOrNull(firstValue(payload, ["rest_seconds", "total_rest_time", "elapsed_rest_time"])) ?? (active != null && duration != null && duration >= active ? duration - active : null);
    if (end != null) cursor = Math.max(cursor, end);
    return { row, index, start, end, duration, active, rest };
  });
}

function heartRateForWindow(samples, start, end, fallback = {}) {
  const values = samples
    .filter((sample) => isWithinWindow(sample.elapsed_seconds, start, end))
    .map((sample) => numberOrNull(sample.heart_rate_bpm))
    .filter((value) => value != null && value >= 30 && value <= 230);
  return {
    avg: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : numberOrNull(fallback.avg),
    max: values.length ? Math.round(Math.max(...values)) : numberOrNull(fallback.max),
  };
}

function respirationForWindow(samples, start, end) {
  const values = samples
    .filter((sample) => isWithinWindow(sample.elapsed_seconds, start, end))
    .map(sampleRespirationValue)
    .filter((value) => value != null && value > 0 && value < 80);
  return {
    avg: values.length ? Math.round(average(values)) : null,
    max: values.length ? Math.round(Math.max(...values)) : null,
  };
}

function sampleRespirationValue(sample = {}) {
  return numberOrNull(firstValue(sample.raw_payload || sample || {}, [
    "respiration_brpm",
    "respiration_rate",
    "respiratory_rate",
    "breathing_rate",
    "breaths_per_minute",
    "enhanced_respiration_rate",
    "respiration_rate_bpm",
  ]));
}

function isWithinWindow(value, start, end) {
  const elapsed = numberOrNull(value);
  if (elapsed == null) return false;
  if (start != null && elapsed < Number(start)) return false;
  if (end != null && elapsed > Number(end)) return false;
  return true;
}

function firstValue(source, keys) {
  for (const key of keys) {
    const value = unwrapFitValue(source?.[key]);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function unwrapFitValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("value" in value) return value.value;
    if ("name" in value) return value.name;
    if ("label" in value) return value.label;
  }
  return value;
}

function fitOrder(payload, messageOrder, fallback, extraKeys = []) {
  return integerOrNull(firstValue(payload, ["message_index", "message_number", ...extraKeys])) ?? integerOrNull(messageOrder) ?? fallback;
}

function lapSource(messageType) {
  if (messageType === "split_summary" || messageType === "split_summaries") return "garmin_fit_split_summary";
  if (messageType === "split" || messageType === "splits") return "garmin_fit_split";
  return "garmin_fit_lap";
}

function setSource(messageType) {
  if (messageType === "workout_step" || messageType === "workout_steps") return "garmin_fit_workout_step";
  return "garmin_fit_set";
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});
}

function printCounts(label, counts) {
  console.log(`${label} counts:`);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key}: ${value}`);
  }
}

function printMessageCounts(counts) {
  console.log("fit_message_payloads by message_type:");
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => console.log(`  ${key}: ${value}`));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = numberOrNull(value);
  return number == null ? null : Math.round(number);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function assertUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid session id: ${value}`);
  }
}

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0, 0);

export function extractRawGarminStrengthSets(input) {
  try {
    const blob = asUint8Array(input);
    if (blob.length < 12) return [];
    const headerLength = blob[0];
    if (headerLength < 12 || headerLength > blob.length) return [];
    if (String.fromCharCode(...blob.slice(8, 12)) !== ".FIT") return [];

    const dataLength = readUint32LE(blob, 4);
    const dataEnd = Math.min(blob.length, headerLength + dataLength);
    const definitions = [];
    const sets = [];
    let index = headerLength;

    while (index < dataEnd) {
      const header = blob[index];
      const compressed = (header & 0x80) !== 0;
      const definitionMessage = !compressed && (header & 0x40) !== 0;

      if (definitionMessage) {
        const definition = parseDefinition(blob, index, dataEnd);
        if (!definition) break;
        definitions[definition.localMessageType] = definition;
        index = definition.nextIndex;
        continue;
      }

      const localMessageType = compressed ? (header >> 5) & 0x03 : header & 0x0f;
      const definition = definitions[localMessageType];
      if (!definition) break;

      let readIndex = index + 1;
      const values = {};
      for (const field of definition.fields) {
        if (readIndex + field.size > dataEnd) return sets;
        if (definition.globalMessageNumber === 225) {
          decodeSetField(values, blob, readIndex, field, definition.littleEndian);
        }
        readIndex += field.size;
      }
      for (const field of definition.developerFields) {
        if (readIndex + field.size > dataEnd) return sets;
        readIndex += field.size;
      }

      if (definition.globalMessageNumber === 225) {
        sets.push({
          ...values,
          _message_type: "set",
          _message_index: sets.length,
          _global_message_number: 225,
          _decode_source: "enqidu_raw_fit_fallback",
        });
      }
      index = readIndex;
    }

    return sets;
  } catch {
    return [];
  }
}

export function pairGarminStrengthSets(rows = [], startedAt = null) {
  const sourceRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!sourceRows.length) return [];
  const hasExplicitTypes = sourceRows.some((row) => garminSetType(row) !== null);
  if (!hasExplicitTypes) return sourceRows.map((row, index) => singleSeries(row, index + 1, startedAt));

  const series = [];
  let cursor = 0;
  for (let index = 0; index < sourceRows.length; index += 1) {
    const activeSet = sourceRows[index];
    const type = garminSetType(activeSet);
    if (type === "rest") continue;

    const next = sourceRows[index + 1];
    const restSet = next && garminSetType(next) === "rest" ? next : null;
    if (restSet) index += 1;

    const activeSeconds = setDurationSeconds(activeSet);
    const restSeconds = restSet ? setDurationSeconds(restSet) : 0;
    const explicitStart = setStartElapsedSeconds(activeSet, startedAt);
    const start = explicitStart ?? cursor;
    const total = activeSeconds == null && !restSet ? null : (activeSeconds || 0) + (restSeconds || 0);
    const end = start != null && total != null ? start + total : null;
    if (end != null) cursor = Math.max(cursor, end);

    series.push({
      source: "garmin_fit_set",
      series_order: series.length + 1,
      garmin_exercise_name: setExerciseName(activeSet),
      start_elapsed_seconds: roundedOrNull(start),
      end_elapsed_seconds: roundedOrNull(end),
      duration_seconds: roundedOrNull(total),
      active_seconds: roundedOrNull(activeSeconds),
      rest_seconds: roundedOrNull(restSeconds),
      repetitions: numberOrNull(activeSet.repetitions ?? activeSet.reps ?? activeSet.num_reps),
      load_value: numberOrNull(activeSet.weight ?? activeSet.load_value),
      load_unit: activeSet.weight != null || activeSet.load_value != null ? activeSet.load_unit || "kg" : null,
      heart_rate_avg_bpm: numberOrNull(activeSet.avg_heart_rate ?? activeSet.average_heart_rate ?? activeSet.heart_rate_avg_bpm),
      heart_rate_max_bpm: numberOrNull(activeSet.max_heart_rate ?? activeSet.maximum_heart_rate ?? activeSet.heart_rate_max_bpm),
      confidence: "reported",
      raw_payload: restSet ? { active_set: activeSet, rest_set: restSet } : { active_set: activeSet },
    });
  }
  return series;
}

export function dedupeGarminSeriesRows(rows = []) {
  const byOrder = new Map();
  (Array.isArray(rows) ? rows : []).filter(Boolean).forEach((row, index) => {
    const order = numberOrNull(row.series_order ?? row.set_order ?? row.order) ?? index + 1;
    const current = byOrder.get(order);
    if (!current || seriesScore(row) > seriesScore(current)) byOrder.set(order, row);
  });
  return [...byOrder.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row);
}

export function garminSetType(row = {}) {
  const raw = row.set_type ?? row.type ?? row.setType;
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return raw === 0 ? "rest" : raw === 1 ? "active" : null;
  if (typeof raw === "object") return garminSetType({ set_type: raw.name ?? raw.label ?? raw.value });
  const value = `${raw}`.trim().toLowerCase();
  if (["0", "rest", "recovery", "descanso"].includes(value)) return "rest";
  if (["1", "active", "work", "working", "activo"].includes(value)) return "active";
  return null;
}

function singleSeries(row, order, startedAt) {
  const total = setDurationSeconds(row);
  const start = setStartElapsedSeconds(row, startedAt);
  return {
    source: row.source || "garmin_fit_set",
    series_order: numberOrNull(row.series_order ?? row.set_order ?? row.order ?? row.message_index) ?? order,
    garmin_exercise_name: setExerciseName(row),
    start_elapsed_seconds: roundedOrNull(start),
    end_elapsed_seconds: start != null && total != null ? Math.round(start + total) : numberOrNull(row.end_elapsed_seconds),
    duration_seconds: roundedOrNull(total),
    active_seconds: roundedOrNull(numberOrNull(row.active_seconds ?? row.work_seconds) ?? total),
    rest_seconds: roundedOrNull(numberOrNull(row.rest_seconds)),
    repetitions: numberOrNull(row.repetitions ?? row.reps ?? row.num_reps),
    load_value: numberOrNull(row.weight ?? row.load_value),
    load_unit: row.weight != null || row.load_value != null ? row.load_unit || "kg" : null,
    heart_rate_avg_bpm: numberOrNull(row.avg_heart_rate ?? row.average_heart_rate ?? row.heart_rate_avg_bpm),
    heart_rate_max_bpm: numberOrNull(row.max_heart_rate ?? row.maximum_heart_rate ?? row.heart_rate_max_bpm),
    confidence: row.confidence || "reported",
    raw_payload: row.raw_payload || row,
  };
}

function seriesScore(row = {}) {
  const source = `${row.source || ""}`.toLowerCase();
  const sourceScore = source.includes("garmin_fit_set") ? 50
    : source === "garmin_fit" ? 45
      : source.includes("garmin_connect") ? 35
        : 20;
  const completeness = [
    row.garmin_exercise_name,
    row.active_seconds ?? row.work_seconds,
    row.rest_seconds,
    row.repetitions ?? row.reps,
    row.load_value ?? row.weight,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
  return sourceScore + completeness;
}

function decodeSetField(target, blob, index, field, littleEndian) {
  const raw = readUnsigned(blob, index, field.size, littleEndian);
  if (raw == null) return;
  switch (field.fieldNumber) {
    case 0:
      target.duration = raw / 1000;
      target.duration_seconds = raw / 1000;
      break;
    case 3:
      target.repetitions = raw;
      break;
    case 4:
      target.weight = raw / 16;
      target.load_value = raw / 16;
      target.load_unit = "kg";
      break;
    case 5:
      target.set_type = raw === 0 ? "rest" : raw === 1 ? "active" : raw;
      break;
    case 6:
      target.start_time = fitDateTime(raw);
      break;
    case 9:
      target.weight_display_unit = raw;
      break;
    case 10:
      target.message_index = raw;
      break;
    case 11:
      target.wkt_step_index = raw;
      break;
    case 254:
      target.timestamp = fitDateTime(raw);
      break;
    default:
      break;
  }
}

function parseDefinition(blob, startIndex, dataEnd) {
  if (startIndex + 6 > dataEnd) return null;
  const header = blob[startIndex];
  const hasDeveloperData = (header & 0x20) !== 0;
  const localMessageType = header & 0x0f;
  const littleEndian = blob[startIndex + 2] === 0;
  const globalMessageNumber = littleEndian
    ? blob[startIndex + 3] | (blob[startIndex + 4] << 8)
    : (blob[startIndex + 3] << 8) | blob[startIndex + 4];
  const fieldCount = blob[startIndex + 5];
  let index = startIndex + 6;
  const fields = [];
  for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
    if (index + 3 > dataEnd) return null;
    fields.push({ fieldNumber: blob[index], size: blob[index + 1], baseType: blob[index + 2] });
    index += 3;
  }
  const developerFields = [];
  if (hasDeveloperData) {
    if (index + 1 > dataEnd) return null;
    const developerCount = blob[index];
    index += 1;
    for (let fieldIndex = 0; fieldIndex < developerCount; fieldIndex += 1) {
      if (index + 3 > dataEnd) return null;
      developerFields.push({ fieldNumber: blob[index], size: blob[index + 1], developerDataIndex: blob[index + 2] });
      index += 3;
    }
  }
  return { localMessageType, globalMessageNumber, littleEndian, fields, developerFields, nextIndex: index };
}

function readUnsigned(blob, index, size, littleEndian) {
  if (![1, 2, 4].includes(size) || index + size > blob.length) return null;
  const view = new DataView(blob.buffer, blob.byteOffset + index, size);
  if (size === 1) {
    const value = view.getUint8(0);
    return value === 0xff ? null : value;
  }
  if (size === 2) {
    const value = view.getUint16(0, littleEndian);
    return value === 0xffff ? null : value;
  }
  const value = view.getUint32(0, littleEndian);
  return value === 0xffffffff ? null : value;
}

function setDurationSeconds(row = {}) {
  return numberOrNull(row.duration_seconds ?? row.duration ?? row.total_timer_time ?? row.elapsed_time ?? row.active_seconds ?? row.work_seconds);
}

function setExerciseName(row = {}) {
  const value = row.garmin_exercise_name ?? row.exercise_name ?? row.name ?? row.category;
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : null;
  if (typeof value === "object") return value.name || value.label || value.value || null;
  return `${value}`;
}

function setStartElapsedSeconds(row = {}, startedAt) {
  const relative = numberOrNull(row.start_elapsed_seconds ?? row.start_time_seconds ?? row.start_elapsed_time);
  if (relative != null) return relative;
  if (!startedAt || !row.start_time) return null;
  const base = new Date(startedAt).getTime();
  const value = new Date(row.start_time).getTime();
  return Number.isFinite(base) && Number.isFinite(value) ? Math.max(0, (value - base) / 1000) : null;
}

function fitDateTime(seconds) {
  const value = numberOrNull(seconds);
  return value == null ? null : new Date(FIT_EPOCH_MS + value * 1000).toISOString();
}

function asUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input || []);
}

function readUint32LE(blob, index) {
  if (index + 4 > blob.length) return 0;
  return new DataView(blob.buffer, blob.byteOffset + index, 4).getUint32(0, true);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedOrNull(value) {
  const number = numberOrNull(value);
  return number == null ? null : Math.round(number);
}

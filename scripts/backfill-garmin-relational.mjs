import { createClient } from "@supabase/supabase-js";

const DEFAULT_SESSION_ID = "eedf9854-3176-4d82-b8df-c2bdf1ab1df3";
const SET_MESSAGE_TYPES = ["set", "sets", "workout_step", "workout_steps"];
const LAP_MESSAGE_TYPES = ["lap", "laps", "split", "splits", "split_summary", "split_summaries"];

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run backfill:garmin -- [session-id]\n\nDefaults to session ${DEFAULT_SESSION_ID}.\nRequires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.`);
  process.exit(0);
}

const sessionId = args[0] || DEFAULT_SESSION_ID;
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

  const messages = await fetchFitMessages(sessionId);
  const samples = await fetchSessionSamples(sessionId);
  const messageCounts = countBy(messages, "message_type");
  printMessageCounts(messageCounts);

  let insertedLaps = 0;
  let insertedGarminSets = 0;

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

async function getCounts(id) {
  const [laps, sets, blocks, payloads] = await Promise.all([
    countRows("session_laps", id),
    countRows("session_garmin_sets", id),
    countRows("session_blocks", id),
    countRows("fit_message_payloads", id),
  ]);

  return {
    fit_message_payloads: payloads,
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
    .map((sample) => numberOrNull(firstValue(sample.raw_payload || {}, [
      "respiration_brpm",
      "respiration_rate",
      "respiratory_rate",
      "breathing_rate",
      "breaths_per_minute",
      "enhanced_respiration_rate",
      "respiration_rate_bpm",
    ])))
    .filter((value) => value != null && value > 0 && value < 80);
  return {
    avg: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    max: values.length ? Math.round(Math.max(...values)) : null,
  };
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

function assertUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid session id: ${value}`);
  }
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import FitParser from "fit-file-parser";
import { getArrayBuffer, readRecord } from "../node_modules/fit-file-parser/dist/binary.js";
import { Buffer } from "buffer";
import { supabase } from "@/integrations/supabase/client";
import { requestCoachReply } from "@/services/aiCoachContextService";
import { reconcileSessionTemporalBlocks } from "@/services/temporalReconciliationService";
import { buildTrainingSessionCardView } from "@/training/smartCardView";
import { applyQuickEditToTrainingSession, buildUniversalSessionView } from "@/training/metrics";
import {
  fetchReadonlyPlannedSessions,
  mergeExecutedAndPlannedForCalendar,
  normalizePlannedCalendarItem,
  resolveCalendarItemRoute,
} from "@/training/plannedCalendar";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BatteryCharging,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  ClipboardList,
  Clock3,
  Coffee,
  Database,
  Download,
  Dumbbell,
  Edit3,
  FileUp,
  Flame,
  Gauge,
  HeartPulse,
  Home,
  LockKeyhole,
  LogIn,
  LogOut,
  MessageSquareText,
  MessageCircle,
  Mic,
  MoreVertical,
  Mountain,
  Moon,
  Pause,
  Plus,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  Watch,
  Zap,
} from "lucide-react";
import "./styles.css";

const SUPABASE_PROJECT_URL = "https://rdduqsziboqxlgeqouxq.supabase.co";
const SUPABASE_PROJECT_NAME = "Hybriq";

const storageKeys = {
  route: "enqidu.route",
  profile: "enqidu.profile",
  fitImports: "enqidu.fit-imports",
  messages: "enqidu.messages",
  backoffice: "enqidu.backoffice",
  coachDraft: "enqidu.coach-dictation-draft",
};

const profileSeed = {
  name: "Usuario",
  avatar: "EQ",
  primaryGoal: "Entrenamiento multimodal sostenible",
  readinessBias: "Rendimiento con margen de recuperación",
  garminMode: "FIT assisted capture",
  garminStatus: "Pending official Garmin integration",
  weekTarget: "Fuerza + cardio + movilidad",
};

const disciplineOrder = ["boyle", "hyrox", "deka", "trail", "crossfit"];

const disciplines = {
  boyle: {
    label: "Base",
    icon: ShieldCheck,
    color: "#23e6c1",
    headline: "Base humana antes que heroicidades",
    focus: "Movement quality, strength hygiene, durable engine.",
    score: 86,
    cards: [
      ["Readiness", "86", "/100", "Prime", 86, "Alta ventana de adaptación"],
      ["Tissue Load", "Low", "", "Safe", 32, "Sin alarmas de impacto"],
      ["Mobility", "14", "min", "Due", 58, "Cadera y T-spine"],
      ["Strength Base", "78", "%", "Build", 78, "Bisagra + unilateral"],
    ],
    prescription: ["Trap bar deadlift 4x4", "Split squat 3x6", "Zone 2 nasal 24 min"],
  },
  hyrox: {
    label: "HYROX",
    icon: Trophy,
    color: "#d6ff35",
    headline: "Motor competitivo con estaciones bajo fatiga",
    focus: "Run economy, sled reserve, wall-ball ceiling.",
    score: 81,
    cards: [
      ["Run Pace", "4:36", "/km", "Race", 76, "Objetivo sostenible"],
      ["Sled Reserve", "88", "%", "Good", 88, "Potencia disponible"],
      ["Wall Balls", "40", "cap", "Limit", 64, "Corte tecnico"],
      ["Comp Score", "812", "pts", "Rising", 82, "Simulacion actual"],
    ],
    prescription: ["1k run repeats x4", "Sled push EMOM 8", "Wall ball density 10 min"],
  },
  deka: {
    label: "DEKA",
    icon: Zap,
    color: "#ff8a1f",
    headline: "Transiciones rapidas, fuerza util, lactato controlado",
    focus: "Ten-zone output with clean pacing decisions.",
    score: 74,
    cards: [
      ["Zone Control", "7.6", "/10", "Watch", 76, "Transiciones mejorables"],
      ["Carry Grip", "91", "%", "Strong", 91, "Ventaja actual"],
      ["Lactate Risk", "Med", "", "Cap", 62, "Evitar salida agresiva"],
      ["Power Repeat", "68", "%", "Build", 68, "Repetibilidad"],
    ],
    prescription: ["DEKA zone circuit 2 rounds", "Farmer carry 6x40m", "Bike flush 12 min"],
  },
  trail: {
    label: "Trail",
    icon: Mountain,
    color: "#49a8ff",
    headline: "Durabilidad, desnivel y decision bajo terreno",
    focus: "Climbing economy, descent resilience, fueling rhythm.",
    score: 69,
    cards: [
      ["Climb Power", "3.8", "W/kg", "Base", 72, "Subida estable"],
      ["Descent Load", "High", "", "Care", 82, "Gemelo/quad watch"],
      ["Fueling", "54", "g/h", "Low", 54, "Subir a 70 g/h"],
      ["Trail Legs", "69", "%", "Build", 69, "Falta acumulacion"],
    ],
    prescription: ["Hill hike-run 45 min", "Downhill eccentrics", "Fueling rehearsal"],
  },
  crossfit: {
    label: "CrossFit",
    icon: Dumbbell,
    color: "#00d5ff",
    headline: "Capacidad mixta sin romper el sistema",
    focus: "Skill, mixed modal density, fatigue-aware intensity.",
    score: 77,
    cards: [
      ["Metcon Load", "77", "%", "Go", 77, "Ventana moderada"],
      ["Skill Freshness", "61", "%", "Build", 61, "Gimnástico técnico"],
      ["Barbell Speed", "0.72", "m/s", "OK", 70, "Mantener forma"],
      ["Recovery Cost", "18", "h", "Fine", 58, "No competir hoy"],
    ],
    prescription: ["EMOM 12 technique", "12 min AMRAP controlled", "Breathing cooldown"],
  },
};

const activityTypes = {
  all: { label: "Todas", color: "#9ca3af" },
  run: { label: "Correr", color: "#42a5ff" },
  trail: { label: "Trail running", color: "#6ee36b" },
  swim: { label: "Natación", color: "#25d7e6" },
  hiit: { label: "HIIT", color: "#d6ff35" },
  hybrid: { label: "Híbrido", color: "#d6ff35" },
  strength: { label: "Fuerza", color: "#ff8a1f" },
  yoga: { label: "Yoga", color: "#c47dff" },
  pilates: { label: "Pilates", color: "#c47dff" },
  cycling: { label: "Ciclismo", color: "#f5c84b" },
  multisport: { label: "Multideporte", color: "#8df018" },
  other: { label: "Otro", color: "#9ca3af" },
};

const GARMIN_PRIMARY_ACTIVITY_FILTERS = [
  ["hiit", "HIIT"],
  ["strength", "Fuerza"],
  ["yoga", "Yoga"],
  ["pilates", "Pilates"],
  ["running", "Carrera"],
  ["trail_running", "Trail running"],
  ["lap_swimming", "Natación en piscina"],
  ["multisport", "Multideporte"],
  ["cycling", "Ciclismo"],
  ["other", "Otro"],
];

const GARMIN_NUMERIC_ACTIVITY_TYPES = {
  62: "hiit",
};

const GARMIN_ACTIVITY_ALIASES = [
  ["trail_running", ["trail_running", "trail_run", "trailrunning", "trail"]],
  ["lap_swimming", ["lap_swimming", "lapswimming", "pool_swimming", "swimming_pool", "pool_swim", "lap_swim", "natacion_piscina", "natacion_en_piscina", "natacion", "piscina", "swimming"]],
  ["cycling", ["cycling", "cycle", "bike", "biking", "ciclismo", "road_biking", "mountain_biking", "mountain_bike", "e_biking"]],
  ["multisport", ["multisport", "multi_sport", "multideporte"]],
  ["yoga", ["yoga"]],
  ["strength", ["strength_training", "strength", "entreno_de_fuerza", "fuerza", "weight_training", "weights", "training", "fitness_equipment"]],
  ["pilates", ["pilates"]],
  ["hiit", ["hiit", "interval_training", "interval", "workout", "cardio_training", "cardio"]],
  ["running", ["running", "run", "carrera", "correr"]],
];

const TARGET_BACKFILL_SESSION_ID = "eedf9854-3176-4d82-b8df-c2bdf1ab1df3";
const garminHrZoneSnapshot = [
  { zone: "Z1", label: "Zona 1", shortLabel: "Z1", name: "Calentamiento", min_bpm: 91, max_bpm: 108, seconds: 1556, percent: 39, color: "#a8b0b6" },
  { zone: "Z2", label: "Zona 2", shortLabel: "Z2", name: "Suave", min_bpm: 109, max_bpm: 126, seconds: 835, percent: 21, color: "#25a9ff" },
  { zone: "Z3", label: "Zona 3", shortLabel: "Z3", name: "Aeróbica", min_bpm: 127, max_bpm: 144, seconds: 461, percent: 11, color: "#7bdc21" },
  { zone: "Z4", label: "Zona 4", shortLabel: "Z4", name: "Umbral", min_bpm: 145, max_bpm: 162, seconds: 197, percent: 4, color: "#ff981f" },
  { zone: "Z5", label: "Zona 5", shortLabel: "Z5", name: "Máximo", min_bpm: 163, max_bpm: null, seconds: 0, percent: 0, color: "#ff3b35" },
];

const activityCardMetadata = [
  { id: "exercise_table", title: "Resumen por bloques", type: "exerciseTable" },
  {
    id: "time",
    title: "Tiempo",
    type: "keyValue",
    fields: [
      { label: "Tiempo total", path: "session.duration_seconds", format: "duration" },
      { label: "Tiempo de trabajo", path: "session.active_seconds", format: "duration" },
      { label: "Tiempo de descanso", path: "session.rest_seconds", format: "duration" },
    ],
  },
  {
    id: "heart",
    title: "Frecuencia cardíaca",
    hiddenWhenTimeline: true,
    type: "keyValue",
    fields: [
      { label: "Frecuencia cardíaca media", path: "session.avg_hr", suffix: " ppm" },
      { label: "Frecuencia cardíaca maxima", path: "session.max_hr", suffix: " ppm" },
    ],
  },
  { id: "hr_timeline", title: "Frecuencia cardíaca", type: "timeline", sampleKey: "heart_rate_bpm", unit: "ppm" },
  {
    id: "training_effect",
    title: "Training Effect",
    type: "trainingEffect",
    fields: [
      { label: "Beneficio principal", path: "session.benefit", fallback: "Sprint (Anaeróbico)" },
      { label: "Aeróbica", path: "session.training_effect_aerobic" },
      { label: "Anaeróbico", path: "session.training_effect_anaerobic" },
      { label: "Carga de ejercicio", path: "session.exercise_load" },
    ],
  },
  { id: "hr_zones", title: "Tiempo en zonas de FC", type: "zones" },
  {
    id: "nutrition",
    title: "Nutrición e hidratación",
    type: "keyValue",
    fields: [
      { label: "Calorías en reposo", path: "session.calories_resting" },
      { label: "Calorías activas", path: "session.calories_active" },
      { label: "Calorías totales", path: "session.calories_total" },
      { label: "Perdida de liquidos estimada", path: "session.fluid_loss_ml", suffix: " ml" },
    ],
  },
  {
    id: "strength_details",
    title: "Detalles de sesión",
    type: "keyValue",
    fields: [
      { label: "Número de bloques", path: "session.block_count" },
      { label: "Series totales", path: "session.total_sets" },
      { label: "Repeticiones totales", path: "session.total_reps" },
      { label: "Media de repeticiones por serie", path: "session.avg_reps_per_set" },
      { label: "Tiempo isométrico total", path: "session.isometric_seconds", format: "duration" },
      { label: "Carga", path: "session.volume_total" },
    ],
  },
];

const initialMessages = [
  {
    role: "assistant",
    content:
      "Cuéntame cómo estás o qué has hecho hoy.",
  },
];

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function getInitialRoute() {
  const hash = window.location.hash.replace("#/", "");
  const visibleRoutes = ["coach", "health", "activities", "profile", "activityDetail", "plannedSessionDetail"];
  return visibleRoutes.includes(hash) ? hash : "coach";
}

function decorateLinkedPlannedActivityDetail(detail, item) {
  if (!detail?.session || !item?.planned) return detail;
  const garminTitle = item.garminTitle || item.executed?.title || detail.session.garmin_original_title || detail.session.title;
  return {
    ...detail,
    plannedSession: item.planned,
    linkedActivityItem: item,
    effectiveStatusLabel: item.statusLabel || "Completada",
    displaySource: item.displaySource || "FIT",
    canRename: false,
    session: {
      ...detail.session,
      title: item.planned.title || detail.session.title,
      garmin_original_title: garminTitle,
      session_status: "completed",
      planned_session_id: item.planned_id,
      linked_completed_session_id: item.executed_id,
    },
  };
}

function fetchTrainingSessionsForActivities(supabaseClient) {
  const fullSelect = "id, user_id, title, session_kind, session_status, duration_seconds, distance_meters, started_at, local_date, created_at, source_id, external_reference, tags, session_structure, summary_metrics";
  const safeSelect = "id, user_id, title, session_kind, session_status, duration_seconds, distance_meters, started_at, local_date, created_at, source_id, external_reference, tags, session_structure";
  const buildQuery = (selectColumns) => supabaseClient
    .from("training_sessions")
    .select(selectColumns)
    .or("session_status.is.null,session_status.neq.archived")
    .order("local_date", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(100);

  return buildQuery(fullSelect).then((result) => (
    result.error ? buildQuery(safeSelect) : result
  ));
}

async function fetchAllSessionSamples(sessionId) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const result = await supabase
      .from("session_samples")
      .select("elapsed_seconds, heart_rate_bpm, temperature_c, sample_order, raw_payload")
      .eq("session_id", sessionId)
      .order("sample_order", { ascending: true })
      .range(from, to);

    if (result.error) return result;

    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  rows.sort((a, b) => Number(a.elapsed_seconds ?? a.sample_order ?? 0) - Number(b.elapsed_seconds ?? b.sample_order ?? 0));
  return { data: rows, error: null };
}

async function fetchAllFitRecordSamples(sessionId) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const result = await supabase
      .from("fit_message_payloads")
      .select("message_order, payload")
      .eq("session_id", sessionId)
      .in("message_type", ["record", "records"])
      .order("message_order", { ascending: true })
      .range(from, to);

    if (result.error) return result;

    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  const samples = rows
    .map((row, index) => fitRecordPayloadToSample(row.payload || {}, row.message_order ?? index, index))
    .filter((sample) => sample.elapsed_seconds != null || sample.heart_rate_bpm != null || sample.raw_payload);
  return { data: samples, error: null };
}

async function fetchFitSessionPayload(sessionId) {
  const result = await supabase
    .from("fit_message_payloads")
    .select("payload")
    .eq("session_id", sessionId)
    .in("message_type", ["session", "sessions"])
    .order("message_order", { ascending: true })
    .limit(1);
  if (result.error) return result;
  return { data: result.data?.[0]?.payload || null, error: null };
}

function fitRecordPayloadToSample(record, messageOrder, index) {
  const elapsed = optionalNumber(record.elapsed_seconds ?? record.elapsed_time ?? record.timer_time);
  return {
    sample_order: optionalNumber(messageOrder) ?? index + 1,
    recorded_at: toIso(record.timestamp),
    elapsed_seconds: elapsed ?? optionalNumber(messageOrder) ?? index,
    heart_rate_bpm: optionalNumber(record.heart_rate ?? record.heart_rate_bpm),
    temperature_c: optionalNumber(record.temperature ?? record.temperature_c),
    raw_payload: record,
  };
}

function mergeTemporalSamples(sessionSamples = [], fitRecordSamples = []) {
  const byPosition = new Map();
  const put = (sample, preferExisting = false) => {
    const elapsed = optionalNumber(sample.elapsed_seconds);
    const order = optionalNumber(sample.sample_order);
    const key = elapsed != null ? `t:${Math.round(elapsed * 10) / 10}` : `o:${order ?? byPosition.size}`;
    const current = byPosition.get(key);
    if (!current) {
      byPosition.set(key, sample);
      return;
    }
    byPosition.set(key, {
      ...current,
      ...sample,
      heart_rate_bpm: preferExisting ? current.heart_rate_bpm ?? sample.heart_rate_bpm : sample.heart_rate_bpm ?? current.heart_rate_bpm,
      temperature_c: preferExisting ? current.temperature_c ?? sample.temperature_c : sample.temperature_c ?? current.temperature_c,
      raw_payload: {
        ...(current.raw_payload || {}),
        ...(sample.raw_payload || {}),
      },
    });
  };
  fitRecordSamples.forEach((sample) => put(sample, false));
  sessionSamples.forEach((sample) => put(sample, true));
  return [...byPosition.values()].sort((a, b) => Number(a.elapsed_seconds ?? a.sample_order ?? 0) - Number(b.elapsed_seconds ?? b.sample_order ?? 0));
}

async function fetchHeartRateZoneProfile(userId) {
  if (!supabase || !userId) return { data: null, error: null };
  const result = await supabase
    .from("user_heart_rate_zone_profiles")
    .select("label, source, max_heart_rate, zones, updated_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    console.warn("Heart rate zone profile unavailable", result.error.message);
    return { data: null, error: result.error };
  }

  return { data: result.data, error: null };
}

async function fetchCanonicalTrainingSession(latestSession) {
  if (!supabase || !latestSession?.id) return { ready: false, session: null, reason: "missing_session" };

  const sessionResult = await supabase
    .from("training_sessions")
    .select("id,title,session_kind,duration_seconds,canonical_session,summary_metrics,completion_score,universal_schema_version")
    .eq("id", latestSession.id)
    .maybeSingle();

  if (sessionResult.error) {
    return { ready: false, session: null, reason: "canonical_columns_unavailable", error: sessionResult.error.message };
  }

  const canonicalJson = sessionResult.data?.canonical_session;
  if (canonicalJson?.schema_version === "enqidu_training_session_v1" && Array.isArray(canonicalJson.blocks) && canonicalJson.blocks.length) {
    return {
      ready: true,
      source: "training_sessions.canonical_session",
      session: {
        ...canonicalJson,
        session: {
          ...(canonicalJson.session || {}),
          id: latestSession.id,
          title: canonicalJson.session?.title || latestSession.title,
          total_duration_s: canonicalJson.session?.total_duration_s ?? latestSession.duration_seconds,
        },
      },
    };
  }

  const blocksResult = await supabase
    .from("session_blocks")
    .select("id,order_index,block_order,block_type,block_format,primary_measurement_type,name,duration_seconds,rounds,rounds_completed,time_cap_s,summary_metrics")
    .eq("session_id", latestSession.id)
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("block_order", { ascending: true, nullsFirst: false });

  if (blocksResult.error) {
    return { ready: false, session: null, reason: "canonical_block_columns_unavailable", error: blocksResult.error.message };
  }

  const blockRows = blocksResult.data || [];
  if (!blockRows.length) return { ready: false, session: null, reason: "no_blocks" };

  const blockIds = blockRows.map((block) => block.id).filter(Boolean);
  if (!blockIds.length) return { ready: false, session: null, reason: "no_block_ids" };

  const itemsResult = await supabase
    .from("block_items")
    .select("id,block_id,order_index,item_type,item_name,station_label,round_index,minute_slot,duration_s,rest_s,summary_metrics")
    .in("block_id", blockIds)
    .order("order_index", { ascending: true });

  if (itemsResult.error) {
    return { ready: false, session: null, reason: "canonical_items_unavailable", error: itemsResult.error.message };
  }

  const itemRows = itemsResult.data || [];
  if (!itemRows.length) return { ready: false, session: null, reason: "no_canonical_items" };

  const itemIds = itemRows.map((item) => item.id).filter(Boolean);
  const exercisesResult = itemIds.length
    ? await supabase
        .from("item_exercises")
        .select("id,block_item_id,exercise_id,order_index,display_name,measurement_type,target_reps,target_reps_per_side,target_load_kg,target_duration_s,target_distance_m,missing_fields,summary_metrics")
        .in("block_item_id", itemIds)
        .order("order_index", { ascending: true })
    : { data: [], error: null };

  if (exercisesResult.error) {
    return { ready: false, session: null, reason: "canonical_exercises_unavailable", error: exercisesResult.error.message };
  }

  const exerciseRows = exercisesResult.data || [];
  const exerciseIds = exerciseRows.map((exercise) => exercise.id).filter(Boolean);
  const [setsResult, metricsResult] = exerciseIds.length
    ? await Promise.all([
        supabase
          .from("performed_sets")
          .select("id,item_exercise_id,set_index,reps,reps_left,reps_right,load_kg,duration_s,distance_m,rpe,rir,rest_s,completed")
          .in("item_exercise_id", exerciseIds)
          .order("set_index", { ascending: true }),
        supabase
          .from("performed_metrics")
          .select("id,item_exercise_id,metric_name,metric_value,metric_unit,confidence")
          .in("item_exercise_id", exerciseIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (setsResult.error || metricsResult.error) {
    return {
      ready: false,
      session: null,
      reason: "canonical_performed_data_unavailable",
      error: setsResult.error?.message || metricsResult.error?.message,
    };
  }

  const itemsByBlock = groupBy(itemRows, "block_id");
  const exercisesByItem = groupBy(exerciseRows, "block_item_id");
  const setsByExercise = groupBy(setsResult.data || [], "item_exercise_id");
  const metricsByExercise = groupBy(metricsResult.data || [], "item_exercise_id");
  const canonical = {
    schema_version: "enqidu_training_session_v1",
    session: {
      id: latestSession.id,
      title: sessionResult.data?.title || latestSession.title || "Sesión",
      session_type: canonicalSessionType(latestSession.session_kind),
      total_duration_s: sessionResult.data?.duration_seconds ?? latestSession.duration_seconds,
      summary_metrics: sessionResult.data?.summary_metrics || {},
    },
    planned: {},
    performed: {},
    interpreted: {},
    blocks: blockRows.map((block, index) => ({
      id: block.id,
      block_id: block.id,
      order_index: block.order_index || block.block_order || index + 1,
      name: block.name,
      block_type: block.block_type || "mixed",
      block_format: block.block_format || "mixed",
      primary_measurement_type: block.primary_measurement_type || "mixed",
      duration_s: block.duration_seconds,
      rounds: block.rounds ?? block.rounds_completed,
      time_cap_s: block.time_cap_s,
      summary_metrics: block.summary_metrics || {},
      items: (itemsByBlock.get(block.id) || []).map((item) => ({
        id: item.id,
        block_item_id: item.id,
        order_index: item.order_index,
        item_type: item.item_type,
        item_name: item.item_name,
        station_label: item.station_label,
        round_index: item.round_index,
        minute_slot: item.minute_slot,
        duration_s: item.duration_s,
        rest_s: item.rest_s,
        summary_metrics: item.summary_metrics || {},
        exercises: (exercisesByItem.get(item.id) || []).map((exercise) => ({
          id: exercise.id,
          item_exercise_id: exercise.id,
          exercise_id: exercise.exercise_id,
          canonical_slug: exercise.exercise_id,
          order_index: exercise.order_index,
          display_name: exercise.display_name,
          measurement_type: exercise.measurement_type,
          target_reps: exercise.target_reps,
          target_reps_per_side: exercise.target_reps_per_side,
          target_load_kg: exercise.target_load_kg,
          target_duration_s: exercise.target_duration_s,
          target_distance_m: exercise.target_distance_m,
          missing_fields: exercise.missing_fields || [],
          summary_metrics: exercise.summary_metrics || {},
          performed_sets: setsByExercise.get(exercise.id) || [],
          performed_metrics: metricsByExercise.get(exercise.id) || [],
        })),
      })),
    })),
    missing_fields: [],
    summary_metrics: sessionResult.data?.summary_metrics || {},
    source_links: [],
  };

  return {
    ready: true,
    source: "canonical_relational_tables",
    session: canonical,
  };
}

function groupBy(rows = [], key) {
  return rows.reduce((map, row) => {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
    return map;
  }, new Map());
}

function canonicalSessionType(value) {
  const text = `${value || ""}`.toLowerCase();
  if (text.includes("run") || text.includes("correr")) return text.includes("trail") ? "trail_running" : "running";
  if (text.includes("swim") || text.includes("nataci")) return "swimming";
  if (text.includes("bike") || text.includes("cycling") || text.includes("cicl")) return "cycling";
  if (text.includes("strength") || text.includes("fuerza")) return "strength";
  if (text.includes("hypertrophy") || text.includes("hipertrof")) return "hypertrophy";
  if (text.includes("mobility") || text.includes("movilidad")) return "mobility";
  if (text.includes("rehab")) return "rehab";
  if (text.includes("prehab")) return "prehab";
  if (text.includes("hiit")) return "hiit";
  if (text.includes("crossfit")) return "crossfit_style";
  if (text.includes("trail")) return "trail_running";
  return "mixed";
}

function App() {
  const [route, setRouteState] = useState(getInitialRoute);
  const [discipline, setDiscipline] = useState("boyle");
  const [profile, setProfile] = useStoredState(storageKeys.profile, profileSeed);
  const [fitImports, setFitImports] = useStoredState(storageKeys.fitImports, []);
  const [messages, setMessages] = useStoredState(storageKeys.messages, initialMessages);
  const [backoffice, setBackoffice] = useStoredState(storageKeys.backoffice, {
    lastSync: null,
    tableStatus: [],
    errors: [],
  });
  const [session, setSession] = useState(null);
  const [authNotice, setAuthNotice] = useState("");
  const [health, setHealth] = useState({});
  const [healthSeries, setHealthSeries] = useState({ sleep: null, hrv: [], bodyBattery: [], stress: [], respiration: [], spo2: [] });
  const [sessions, setSessions] = useState([]);
  const [plannedSessions, setPlannedSessions] = useState([]);
  const [activityDetail, setActivityDetail] = useState(null);
  const [plannedSessionDetail, setPlannedSessionDetail] = useState(null);
  const [dataState, setDataState] = useState({
    loading: false,
    source: supabase ? "Conectado" : "Sin conexión",
    detail: supabase
      ? "Listo para sincronizar datos."
      : "La conexión de datos no está disponible en este entorno.",
  });

  const loadActivityDetail = async (latestSession) => {
    if (!supabase || !latestSession?.id) return null;
    const detailUserId = latestSession.user_id || session?.user?.id;

    const [
      metricsResult,
      samplesResult,
      fitRecordsResult,
      fitSessionResult,
      blocksResult,
      lapsResult,
      enrichmentResult,
      exercisesResult,
      zoneProfileResult,
      canonicalResult,
    ] = await Promise.all([
      supabase
        .from("session_metrics")
        .select("metric_code, metric_name, value_numeric, value_text, value_json, unit")
        .eq("session_id", latestSession.id),
      fetchAllSessionSamples(latestSession.id),
      fetchAllFitRecordSamples(latestSession.id),
      fetchFitSessionPayload(latestSession.id),
      supabase
        .from("session_blocks")
        .select("id, block_order, block_type, name, duration_seconds, start_elapsed_seconds, end_elapsed_seconds, active_seconds, rest_seconds, heart_rate_avg_bpm, heart_rate_max_bpm, temporal_metrics_source, temporal_metrics_confidence, rounds_completed, prescription, execution_notes, data_confidence")
        .eq("session_id", latestSession.id)
        .order("block_order", { ascending: true }),
      supabase
        .from("session_laps")
        .select("id, lap_index, source, start_elapsed_seconds, end_elapsed_seconds, duration_seconds, active_seconds, rest_seconds, distance_meters, heart_rate_avg_bpm, heart_rate_max_bpm, raw_payload")
        .eq("session_id", latestSession.id)
        .order("lap_index", { ascending: true }),
      supabase
        .from("enkidu_conversation_enrichments")
        .select("payload, enrichment_status, created_at")
        .eq("session_id", latestSession.id)
        .in("enrichment_status", ["active", "applied", "completed"] )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("session_exercises")
        .select("block_id, reported_name, exercise_order, sets_completed, reps_per_set, duration_seconds, load_value, load_unit, side, notes, equipment_snapshot, data_confidence")
        .eq("session_id", latestSession.id)
        .order("exercise_order", { ascending: true }),
      fetchHeartRateZoneProfile(detailUserId),
      fetchCanonicalTrainingSession(latestSession),
    ]);

    const metrics = indexMetrics(metricsResult.data || []);
    const samples = mergeTemporalSamples(samplesResult.data || [], fitRecordsResult.data || []);
    const fitSessionPayload = fitSessionResult.data || {};
    const summary = latestSession.session_structure?.garmin_fit_summary || {};
    const enrichmentPayload = enrichmentResult.data?.payload || {};
    const executiveSummaryTable = resolveExecutiveSummaryTable(latestSession.session_structure, enrichmentPayload);
    const trainingEffect = summary.training_effect || {};
    const calories = summary.calories || {};
    const heartRate = summary.heart_rate || {};
    const strengthTracking = summary.strength_tracking || {};
    const garminSeries = mapGarminSeries(summary.garmin_series || summary.sets || []);
    const blocks = mapExerciseBlocks(blocksResult.data || [], exercisesResult.data || []);
    const enrichmentBlocks = !blocks.length ? mapEnrichmentBlocks(enrichmentResult.data?.payload?.blocks || []) : [];
    const renderBlocks = blocks.length ? blocks : enrichmentBlocks;
    const conversationStats = buildConversationSessionStats(renderBlocks);
    const garminRepsTotal = strengthTracking.garmin_repetitions_total ?? strengthTracking.repetitions_total ?? sumNumeric(garminSeries.map((item) => item.repetitions));
    const garminSetsTotal = strengthTracking.garmin_sets_total ?? strengthTracking.set_messages ?? garminSeries.length;
    const avgHr = average(samples.map((item) => item.heart_rate_bpm).filter(Boolean));
    const maxHr = Math.max(...samples.map((item) => Number(item.heart_rate_bpm || 0)), 0);
    const fitTime = timeMetricsFromFitSessionPayload(fitSessionPayload);
    const duration = Number(fitTime.totalSeconds || summary.duration_elapsed_seconds || summary.duration_total_seconds || latestSession.duration_seconds || 0);
    const objectiveRows = lapsResult.error ? [] : lapsResult.data || [];
    const activityTime = getActivityTimeMetrics(latestSession, metrics, blocksResult.data || [], summary, duration, fitSessionPayload, objectiveRows);
    const garminOriginalTitle = originalGarminTitle(latestSession, summary);
    const title = repairMojibakeText(latestSession.title || garminOriginalTitle || "Actividad");
    const heartRateZones = resolveActivityHeartRateZones({
      reported: summary.heart_rate_zones_reported,
      profile: zoneProfileResult.data,
      samples,
      durationSeconds: duration,
    });
    const zones = mapReportedHeartRateZones(heartRateZones, latestSession.id);
    const respiration = buildRespirationModel(samples, summary, metrics);
    const fitSessionRespiration = respirationFromFitSessionPayload(fitSessionPayload);
    const garminBlocks = mapGarminObjectiveBlocks({
      laps: lapsResult.error ? [] : lapsResult.data || [],
      summary,
      samples,
      zones,
    });

    return {
      session: {
        id: latestSession.id,
        title,
        garmin_original_title: repairMojibakeText(garminOriginalTitle),
        external_reference: latestSession.external_reference || summary.fit_identity?.external_reference || null,
        source_id: latestSession.source_id || null,
        fit_identity: summary.fit_identity || null,
        session_status: latestSession.session_status,
        tags: latestSession.tags || [],
        activity_type: classifyActivityTypeFromSummary(summary, latestSession),
        local_date: latestSession.local_date,
        started_at: latestSession.started_at,
        duration_seconds: activityTime.totalSeconds,
        active_seconds: activityTime.activeSeconds,
        rest_seconds: activityTime.restSeconds,
        time_source: activityTime.source,
        time_confidence: activityTime.confidence,
        calories_total: roundOptionalMetric(numberMetric(metrics, ["calories_total", "total_calories"], calories.total_kcal ?? null)),
        calories_active: roundOptionalMetric(numberMetric(metrics, ["active_calories", "calories_active"], calories.active_kcal ?? null)),
        calories_resting: roundOptionalMetric(numberMetric(metrics, ["resting_calories", "calories_resting"], calories.rest_kcal ?? null)),
        fluid_loss_ml: getFluidLossMl(summary, metrics),
        block_count: conversationStats.blockCount || undefined,
        total_reps: conversationStats.totalReps || strengthTracking.repetitions_total || undefined,
        total_sets: conversationStats.totalSets || strengthTracking.active_sets || undefined,
        garmin_reps_total: garminRepsTotal || undefined,
        garmin_sets_total: garminSetsTotal || undefined,
        avg_reps_per_set: conversationStats.avgRepsPerSet || undefined,
        isometric_seconds: conversationStats.isometricSeconds || undefined,
        volume_total: conversationStats.loadLabel || undefined,
        training_effect_aerobic: numberMetric(metrics, ["training_effect_aerobic", "aerobic_training_effect"], trainingEffect.aerobic ?? null),
        training_effect_anaerobic: numberMetric(metrics, ["training_effect_anaerobic", "anaerobic_training_effect"], trainingEffect.anaerobic ?? null),
        exercise_load: roundOptionalMetric(numberMetric(metrics, ["exercise_load", "training_load"], trainingEffect.training_load ?? null)),
        benefit: textMetric(metrics, ["benefit", "primary_benefit", "training_benefit"], benefitFromTrainingEffect(trainingEffect)),
        avg_hr: roundOptionalMetric(numberMetric(metrics, ["avg_heart_rate", "average_heart_rate"], (heartRate.avg_bpm ?? avgHr) || null)),
        max_hr: roundOptionalMetric(numberMetric(metrics, ["max_heart_rate", "maximum_heart_rate"], (heartRate.max_bpm ?? maxHr) || null)),
        respiration_avg_brpm: respiration.avg ?? fitSessionRespiration.avg,
        respiration_max_brpm: respiration.max ?? fitSessionRespiration.max,
        respiration_min_brpm: respiration.min ?? fitSessionRespiration.min,
      },
      exercises: mapExercises(exercisesResult.data || []),
      blocks: renderBlocks,
      garminBlocks,
      garminSeries,
      sessionStructure: latestSession.session_structure || {},
      enrichmentPayload,
      executiveSummaryTable,
      canonicalTrainingSession: canonicalResult.session,
      universalTrainingIntegration: canonicalResult,
      hasConversationBlocks: renderBlocks.length > 0,
      samples,
      respirationSamples: respiration.samples,
      zones,
      summary,
    };
  };

  const loadBackofficeData = async (activeSession = session) => {
    if (!supabase) {
      setDataState({
        loading: false,
        source: "Sin conexión",
        detail: "La conexión de datos no está disponible en este entorno.",
      });
      return;
    }

    setDataState((current) => ({ ...current, loading: true }));
    const userId = activeSession?.user?.id;

    const dailyQuery = supabase
      .from("wearable_health_daily")
      .select(
        "calendar_date, resting_heart_rate_bpm, steps, intensity_minutes, active_kcal, average_stress_level, body_battery_current, spo2_avg_pct, respiration_avg_brpm",
      )
      .order("calendar_date", { ascending: false })
      .limit(1);

    const sessionQuery = fetchTrainingSessionsForActivities(supabase);

    const profileQuery = userId
      ? supabase
          .from("profiles")
          .select("display_name, primary_goal, disciplines, weekly_days, typical_minutes, uses_wearables")
          .eq("id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const connectionQuery = userId
      ? supabase
          .from("user_wearable_connections")
          .select("provider, connection_status, sync_mode, last_sync_at, metadata")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [], error: null });

    const sourceQuery = supabase
      .from("training_sources")
      .select("id, source_type, source_name, original_filename, import_status, imported_at")
      .order("imported_at", { ascending: false })
      .limit(6);

    const sleepQuery = userId
      ? supabase
          .from("wearable_sleep_sessions")
          .select("calendar_date, total_duration_seconds, deep_sleep_seconds, light_sleep_seconds, rem_sleep_seconds, awake_seconds, sleep_score, avg_sleep_heart_rate_bpm, resting_heart_rate_bpm, body_battery_change, spo2_avg_pct, spo2_min_pct, respiration_avg_brpm, hrv_last_night_avg_ms, hrv_last_night_5min_high_ms")
          .eq("user_id", userId)
          .order("calendar_date", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], error: null });

    const hrvQuery = userId
      ? supabase
          .from("wearable_hrv_nightly_summaries")
          .select("calendar_date, last_night_avg_ms, last_night_5min_high_ms, status")
          .eq("user_id", userId)
          .order("calendar_date", { ascending: false })
          .limit(28)
      : Promise.resolve({ data: [], error: null });

    const bodyBatteryQuery = userId
      ? supabase
          .from("wearable_body_battery_samples")
          .select("recorded_at, body_battery_value")
          .eq("user_id", userId)
          .order("recorded_at", { ascending: false })
          .limit(96)
      : Promise.resolve({ data: [], error: null });

    const stressQuery = userId
      ? supabase
          .from("wearable_stress_samples")
          .select("recorded_at, stress_value, stress_status")
          .eq("user_id", userId)
          .order("recorded_at", { ascending: false })
          .limit(96)
      : Promise.resolve({ data: [], error: null });

    const respirationQuery = userId
      ? supabase
          .from("wearable_respiration_samples")
          .select("recorded_at, breaths_per_minute, context")
          .eq("user_id", userId)
          .order("recorded_at", { ascending: false })
          .limit(96)
      : Promise.resolve({ data: [], error: null });

    const spo2Query = userId
      ? supabase
          .from("wearable_spo2_samples")
          .select("recorded_at, spo2_percent, context")
          .eq("user_id", userId)
          .order("recorded_at", { ascending: false })
          .limit(96)
      : Promise.resolve({ data: [], error: null });

    const [
      dailyResult,
      sessionResult,
      profileResult,
      connectionResult,
      sourceResult,
      sleepResult,
      hrvResult,
      bodyBatteryResult,
      stressResult,
      respirationResult,
      spo2Result,
    ] = await Promise.all([
      dailyQuery,
      sessionQuery,
      profileQuery,
      connectionQuery,
      sourceQuery,
      sleepQuery,
      hrvQuery,
      bodyBatteryQuery,
      stressQuery,
      respirationQuery,
      spo2Query,
    ]);

    if (dailyResult.data?.[0]) setHealth(dailyResult.data[0]);
    if (!sessionResult.error) {
      setSessions((sessionResult.data || []).map(mapTrainingSession));
    }
    try {
      setPlannedSessions(await fetchReadonlyPlannedSessions(supabase, userId));
    } catch (error) {
      setPlannedSessions([]);
      if (import.meta.env.DEV) {
        console.warn("[planned-calendar] planned sessions unavailable", error);
      }
    }
    if (sessionResult.data?.[0]?.id) {
      setActivityDetail(null);
      const detail = await loadActivityDetail(sessionResult.data[0]);
      setActivityDetail(detail);
    }
    if (profileResult.data) {
      setProfile((current) => ({
        ...current,
        name: profileResult.data.display_name || current.name,
        primaryGoal: profileResult.data.primary_goal || current.primaryGoal,
        weekTarget: `${profileResult.data.weekly_days ?? "?"} días · ${profileResult.data.typical_minutes ?? "?"} min`,
        garminMode: profileResult.data.uses_wearables ? "Wearables enabled" : current.garminMode,
      }));
    }
    setHealthSeries({
      sleep: sleepResult.data?.[0] || null,
      hrv: hrvResult.data || [],
      bodyBattery: chronological(bodyBatteryResult.data || []),
      stress: chronological(stressResult.data || []),
      respiration: chronological(respirationResult.data || []),
      spo2: chronological(spo2Result.data || []),
    });

    const tableStatus = [
      tableSummary("wearable_health_daily", dailyResult),
      tableSummary("wearable_sleep_sessions", sleepResult),
      tableSummary("wearable_hrv_nightly_summaries", hrvResult),
      tableSummary("wearable_body_battery_samples", bodyBatteryResult),
      tableSummary("wearable_stress_samples", stressResult),
      tableSummary("wearable_respiration_samples", respirationResult),
      tableSummary("wearable_spo2_samples", spo2Result),
      tableSummary("training_sessions", sessionResult),
      tableSummary("profiles", profileResult),
      tableSummary("user_wearable_connections", connectionResult),
      tableSummary("training_sources", sourceResult),
    ];
    const errors = tableStatus.filter((item) => item.error).map((item) => `${item.table}: ${item.error}`);

    setBackoffice({
      lastSync: new Date().toISOString(),
      tableStatus,
      errors,
      connections: connectionResult.data || [],
      sources: sourceResult.data || [],
    });
    setDataState({
      loading: false,
      source: errors.length ? "Sincronización parcial" : "Datos sincronizados",
      detail: errors.length
        ? "Algunos datos no están disponibles para esta cuenta."
        : userId ? `Sesión activa: ${activeSession.user.email}` : "Datos públicos disponibles.",
    });
  };

  const setRoute = (next) => {
    setRouteState(next);
    localStorage.setItem(storageKeys.route, JSON.stringify(next));
    window.location.hash = `/${next}`;
  };

  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.replace("#/", "") || "coach";
      setRouteState(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadBackofficeData(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadBackofficeData(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const activeDiscipline = disciplines[discipline];
  const filteredSessions = useMemo(() => {
    const activeSessions = sessions.filter((session) => !isArchivedSession(session));
    return activeSessions;
  }, [sessions]);

  const openSessionDetail = async (selectedSession) => {
    if (selectedSession?.activityType === "hybrid") setDiscipline("hyrox");
    if (selectedSession?.activityType === "strength") setDiscipline("crossfit");
    if (selectedSession?.activityType === "run") setDiscipline("trail");
    if (selectedSession?.activityType === "pilates") setDiscipline("boyle");
    const executedSession = selectedSession?.kind === "planned_completed"
      ? selectedSession.executed
      : selectedSession;
    if (executedSession?.id) {
      setActivityDetail(null);
      const detail = await loadActivityDetail(executedSession);
      setActivityDetail(selectedSession?.kind === "planned_completed"
        ? decorateLinkedPlannedActivityDetail(detail, selectedSession)
        : detail);
    }
    setRoute("activityDetail");
  };

  const openPlannedSessionDetail = (selectedSession) => {
    setPlannedSessionDetail(selectedSession?.kind === "planned" ? selectedSession : normalizePlannedCalendarItem(selectedSession));
    setRoute("plannedSessionDetail");
  };

  const renameActivitySession = async (sessionId, nextTitle) => {
    const title = `${nextTitle || ""}`.trim();
    if (!sessionId || !title) return;
    if (supabase) {
      const { error } = await supabase
        .from("training_sessions")
        .update({ title })
        .eq("id", sessionId);
      if (error) throw error;
    }
    setActivityDetail((current) => current?.session?.id === sessionId
      ? { ...current, session: { ...current.session, title } }
      : current);
    setSessions((current) => current.map((item) => item.id === sessionId ? { ...item, title } : item));
  };

  return (
    <div className="appShell" style={{ "--discipline": activeDiscipline.color }}>
      <aside className="rail">
        <button className="brandButton" onClick={() => setRoute("coach")} aria-label="Coach">
          <Sparkles size={20} />
          <span>EQ</span>
        </button>
        <NavButton icon={Bot} label="Coach" route="coach" active={route} setRoute={setRoute} />
        <NavButton icon={HeartPulse} label="Salud" route="health" active={route} setRoute={setRoute} />
        <NavButton icon={Activity} label="Actividades" route="activities" active={route} setRoute={setRoute} />
        <NavButton icon={UserRound} label="Perfil" route="profile" active={route} setRoute={setRoute} />
      </aside>

      <main className="phoneCanvas">
        {!["activityDetail", "plannedSessionDetail"].includes(route) && (
          <header className="appHeader">
            <div>
              <span>{routeLabel(route)}</span>
              <h1>ENQIDU</h1>
            </div>
          </header>
        )}

        {route === "health" && (
          <HealthView
            health={health}
            healthSeries={healthSeries}
            discipline={activeDiscipline}
          />
        )}
        {route === "activities" && (
          <ActivitiesOverview
            sessions={filteredSessions}
            plannedSessions={plannedSessions}
            setRoute={setRoute}
            setDiscipline={setDiscipline}
            onOpenSession={openSessionDetail}
            onOpenPlannedSession={openPlannedSessionDetail}
          />
        )}
        {route === "activityDetail" && (
          <ActivityView
            activityDetail={activityDetail}
            onBack={() => setRoute("activities")}
            onRenameSession={renameActivitySession}
          />
        )}
        {route === "plannedSessionDetail" && (
          <PlannedSessionDetail
            plannedSession={plannedSessionDetail}
            onBack={() => setRoute("activities")}
          />
        )}
        {route === "coach" && (
          <CoachView
            messages={messages}
            setMessages={setMessages}
            discipline={activeDiscipline}
            sessions={filteredSessions}
          />
        )}
        {route === "profile" && (
          <ProfileView
            profile={profile}
            setProfile={setProfile}
            fitImports={fitImports}
            setFitImports={setFitImports}
            session={session}
            authNotice={authNotice}
            setAuthNotice={setAuthNotice}
            onSync={() => loadBackofficeData(session)}
            onImportedSession={openSessionDetail}
          />
        )}
      </main>
    </div>
  );
}

function routeLabel(route) {
  return {
    health: "Salud y recuperación",
    activities: "Historial de actividades",
    activityDetail: "Detalle Garmin/FIT",
    plannedSessionDetail: "Detalle planificado",
    coach: "Coach",
    profile: "Cuenta e ingesta",
  }[route] || "Coach";
}

function activitySubtitle(detail) {
  const session = detail?.session || {};
  return [session.activity_type || session.title, session.local_date, session.duration_seconds ? formatDurationClock(session.duration_seconds) : ""]
    .filter(Boolean)
    .join(" · ");
}

function NavButton({ icon: Icon, label, route, active, setRoute }) {
  return (
    <button className={`railButton ${active === route ? "active" : ""}`} onClick={() => setRoute(route)} aria-label={label}>
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

function DisciplineSwitch({ value, onChange }) {
  return (
    <section className="disciplineSwitch" aria-label="Disciplinas">
      {disciplineOrder.map((id) => {
        const item = disciplines[id];
        const Icon = item.icon;
        return (
          <button key={id} className={value === id ? "active" : ""} onClick={() => onChange(id)}>
            <Icon size={15} />
            {item.label}
          </button>
        );
      })}
    </section>
  );
}

function HomeView({ discipline, health, sessions, setRoute, dataState }) {
  return (
    <section className="viewStack">
      <HeroCard discipline={discipline} />
      <div className="smartGrid">
        <SmartCard title="Body Battery" value={health.body_battery_current ?? 72} unit="/100" badge="Garmin" progress={health.body_battery_current ?? 72} />
        <SmartCard title="Stress" value={health.average_stress_level ?? 31} unit="avg" badge="Health" progress={100 - Number(health.average_stress_level ?? 31)} />
        <SmartCard title="Steps" value={compact(health.steps ?? 8740)} unit="" badge="Activity" progress={Math.min(100, ((health.steps ?? 8740) / 10000) * 100)} />
        <SmartCard title="Intensity" value={health.intensity_minutes ?? 126} unit="min" badge="Weekly" progress={Math.min(100, ((health.intensity_minutes ?? 126) / 175) * 100)} />
      </div>
      <ActionPanel title="Hoy toca decidir bien" cta="Abrir Coach" onClick={() => setRoute("coach")}>
        {discipline.prescription.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </ActionPanel>
      <section className="panel">
        <PanelTitle label="Activity" title="Últimas sesiones" />
        <SessionList sessions={sessions} />
      </section>
      <section className="dataBanner">
        <CheckCircle2 size={18} />
        <div>
          <strong>{dataState.source}</strong>
          <span>{dataState.detail}</span>
        </div>
      </section>
    </section>
  );
}

function HeroCard({ discipline }) {
  return (
    <article className="heroCard">
      <div className="heroTop">
        <div>
          <span>Primary mode</span>
          <h2>{discipline.label}</h2>
          <p>{discipline.headline}</p>
        </div>
        <div className="scoreDial">
          <strong>{discipline.score}</strong>
          <span>ready</span>
        </div>
      </div>
      <p className="heroFocus">{discipline.focus}</p>
      <div className="miniBars">
        {discipline.cards.map(([label, , , , progress]) => (
          <div key={label}>
            <span>{label}</span>
            <i style={{ width: `${progress}%` }} />
          </div>
        ))}
      </div>
    </article>
  );
}

function HealthView({ health, healthSeries, discipline }) {
  const readiness = computeHealthReadiness(health);
  const sleep = buildSleepModel(health, healthSeries.sleep, healthSeries.hrv);
  const energyCurve = healthSeries.bodyBattery?.length ? buildEnergyCurve(health, healthSeries.bodyBattery) : [];
  const hrvTrend = buildHrvTrend(healthSeries.hrv, sleep.hrv);
  const hasHealthData = Boolean(health?.calendar_date) && hasRealHealthValues(health, healthSeries);
  const cards = hasHealthData ? buildRealHealthCards(health, sleep, healthSeries) : [];

  return (
    <section className="viewStack">
      {hasHealthData ? (
        <>
          <section className="healthHero">
            <div>
              <span>Salud</span>
              <h2>{readiness.label}</h2>
              <p>{readiness.copy}</p>
              <div className="healthTags">
                <span>{readiness.training}</span>
                <span>{health.calendar_date}</span>
              </div>
            </div>
            <div className="healthScore">
              <strong>{readiness.score}</strong>
              <span>estado</span>
            </div>
          </section>
          {cards.length > 0 && (
            <div className="smartGrid">
              {cards.map(([title, value, unit, badge, progress]) => (
                <SmartCard key={title} title={title} value={value} unit={unit} badge={badge} progress={progress} />
              ))}
            </div>
          )}
          <GarminHighlights health={health} sleep={sleep} readiness={readiness} />
          <GarminMetricGrid health={health} sleep={sleep} curve={energyCurve} hrvTrend={hrvTrend} healthSeries={healthSeries} />
        </>
      ) : (
        <section className="emptyHealthState">
          <Moon size={20} />
          <div>
            <strong>Aún no hay datos de salud para hoy.</strong>
            <span>Cuando existan lecturas conectadas, aquí verás recuperación, sueño, HRV, Body Battery y frecuencia cardíaca.</span>
          </div>
        </section>
      )}
    </section>
  );
}

function hasRealHealthValues(health, healthSeries) {
  return [
    health?.body_battery_current,
    health?.resting_heart_rate_bpm,
    health?.average_stress_level,
    health?.respiration_avg_brpm,
    health?.spo2_avg_pct,
    health?.intensity_minutes,
    health?.sleep_score,
  ].some((value) => value != null) || Boolean(healthSeries?.sleep || healthSeries?.hrv?.length || healthSeries?.bodyBattery?.length);
}

function buildRealHealthCards(health, sleep, healthSeries) {
  const cards = [];
  if (health.body_battery_current != null) {
    cards.push(["Body Battery", health.body_battery_current, "/100", "Garmin", health.body_battery_current]);
  }
  if (sleep.hasSleepData) {
    cards.push(["Sueño", sleep.score, "/100", "Recuperación", sleep.score]);
  }
  if (sleep.hasHrvData) {
    cards.push(["HRV", sleep.hrv, "ms", "Balance", Math.min(100, (sleep.hrv / 70) * 100)]);
  }
  if (health.resting_heart_rate_bpm != null) {
    cards.push(["FC reposo", health.resting_heart_rate_bpm, "ppm", "Cardio", Math.max(20, 100 - (Number(health.resting_heart_rate_bpm) - 42) * 2)]);
  }
  if (health.average_stress_level != null) {
    cards.push(["Estrés", health.average_stress_level, "avg", "Carga", 100 - Number(health.average_stress_level)]);
  }
  if (health.respiration_avg_brpm != null) {
    cards.push(["Respiración", health.respiration_avg_brpm, "rpm", "Respira", 76]);
  }
  if (health.spo2_avg_pct != null) {
    cards.push(["SpO2", health.spo2_avg_pct, "%", "Oxígeno", health.spo2_avg_pct]);
  }
  if (health.intensity_minutes != null) {
    cards.push(["Carga semanal", health.intensity_minutes, "min", "Semana", Math.min(100, (Number(health.intensity_minutes) / 175) * 100)]);
  }
  return cards;
}

function GarminHighlights({ health, sleep, readiness }) {
  const stress = Number(health.average_stress_level ?? 0);
  const battery = Number(health.body_battery_current ?? 0);
  return (
    <section className="garminSection">
      <PanelTitle label="Garmin" title="Resumen principal" />
      <div className="garminCarousel">
        <article className="garminFeatureCard">
          <span>Recuperación</span>
          <div className="readinessGauge" style={{ "--gauge": `${readiness.score * 3.6}deg` }}>
            <strong>{readiness.score}</strong>
          </div>
          <h3>{readiness.score >= 78 ? "Alta" : readiness.score >= 62 ? "Aceptable" : "Bajo"}</h3>
          <p>{readiness.score >= 78 ? "Puedes construir" : readiness.score >= 62 ? "Tómatelo con calma" : "Recuperación primero"}</p>
          <div className="garminFactorGrid">
            {sleep.hasSleepData && <InfoPair label="Sueño" value={sleep.quality} />}
            {health.body_battery_current != null && <InfoPair label="Body Battery" value={battery} />}
            {sleep.hasHrvData && <InfoPair label="Estado VFC" value={sleep.hrv >= 50 ? "Equilibrado" : "Bajo"} />}
            {health.average_stress_level != null && <InfoPair label="Estrés reciente" value={stress < 40 ? "Medio" : "Alto"} />}
          </div>
        </article>
      </div>
    </section>
  );
}

function GarminMetricGrid({ health, sleep, curve, hrvTrend, healthSeries }) {
  const heart = Number(health.resting_heart_rate_bpm ?? 0);
  const battery = Number(health.body_battery_current ?? 0);
  const hasCards =
    sleep.hasSleepData ||
    sleep.hasHrvData ||
    health.body_battery_current != null ||
    health.resting_heart_rate_bpm != null;
  if (!hasCards) return null;
  return (
    <section className="garminSection">
      <PanelTitle label="Gráficas" title="Salud Garmin" />
      <div className="garminMetricGrid">
        {sleep.hasSleepData && (
          <article className="garminMiniCard">
            <span>Puntuación de sueño</span>
            <div className="miniMetricRow">
              <strong>{sleep.score}</strong>
              <b>{sleep.duration}</b>
            </div>
            <MiniSleepChart stages={sleep.stages} />
          </article>
        )}
        {sleep.hasHrvData && (
          <article className="garminMiniCard">
            <span>Estado de VFC</span>
            <div className={`miniStatus ${sleep.hrv < 42 ? "danger" : ""}`}>{sleep.hrv < 42 ? "Bajo" : "Equilibrado"}</div>
            <div className="miniMetricRow">
              <strong>{sleep.hrv} ms</strong>
              <b>Últimas lecturas</b>
            </div>
            <HrvTrend points={hrvTrend} />
          </article>
        )}
        {health.body_battery_current != null && (
          <article className="garminMiniCard">
            <span>Body Battery</span>
            <MiniRing value={battery} />
            {healthSeries.bodyBattery?.length > 0 && <SparkBars points={curve} />}
            <div className="miniStack">
              {health.body_battery_charged != null && <><strong>+{health.body_battery_charged}</strong><span>Cargada</span></>}
              {health.body_battery_drained != null && <><strong>-{health.body_battery_drained}</strong><span>Agotada</span></>}
            </div>
          </article>
        )}
        {health.resting_heart_rate_bpm != null && (
          <article className="garminMiniCard">
            <span>Frecuencia cardíaca</span>
            <MiniRing value={Math.max(18, 100 - (heart - 40) * 2)} label={heart} />
            <div className="miniStack">
              <strong>{heart} ppm</strong>
              <span>Descanso</span>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function InfoPair({ label, value }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function LoadFocus({ label, value, max, color, optimal }) {
  const start = (optimal[0] / max) * 100;
  const width = ((optimal[1] - optimal[0]) / max) * 100;
  return (
    <div className="loadFocus">
      <span>{label}</span>
      <strong>{value}</strong>
      <i>
        <b style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
        <em style={{ left: `${start}%`, width: `${width}%` }} />
      </i>
    </div>
  );
}

function MiniSleepChart({ stages }) {
  const bars = stages?.length
    ? stages.flatMap((stage) => Array.from({ length: Math.max(1, Math.round(stage.value / 8)) }, () => stage.label))
    : ["Deep", "Light", "Awake", "Light", "REM", "Light", "REM"];
  return (
    <div className="miniSleepChart">
      {bars.slice(0, 14).map((stage, index) => (
        <i key={index} className={stage.toLowerCase()} />
      ))}
    </div>
  );
}

function HrvTrend({ points }) {
  const dots = points?.length ? points : [44, 48, 46, 51, 54, 58, 61, 63, 59, 46, 39, 35, 32];
  return (
    <div className="hrvTrend">
      {dots.slice(-13).map((value, index) => (
        <i key={index} className={value < 42 ? "warn" : ""} style={{ bottom: `${Math.max(12, Math.min(86, value))}%` }} />
      ))}
    </div>
  );
}

function SparkBars({ points }) {
  if (!points?.length) return null;
  return (
    <div className="sparkBars">
      {points.slice(-12).map((point) => (
        <i key={point.label} style={{ height: `${Math.max(8, Math.min(100, point.value))}%` }} />
      ))}
    </div>
  );
}

function MiniRing({ value, label }) {
  return (
    <div className="miniRing" style={{ "--ring": `${Math.min(100, Math.max(0, value)) * 3.6}deg` }}>
      <strong>{label ?? value}</strong>
    </div>
  );
}

function SleepCard({ sleep }) {
  return (
    <article className="panel healthPanel">
      <PanelTitle label="Sleep architecture" title="Recuperación nocturna" />
      <div className="sleepHeader">
        <strong>{sleep.duration}</strong>
        <span>{sleep.score}/100 · {sleep.quality}</span>
      </div>
      <div className="sleepStages">
        {sleep.stages.map((stage) => (
          <div key={stage.label} style={{ "--stage": `${stage.value}%` }}>
            <span>{stage.label}</span>
            <i />
            <b>{stage.text}</b>
          </div>
        ))}
      </div>
      <p>{sleep.note}</p>
    </article>
  );
}

function EnergyTimeline({ curve }) {
  return (
    <article className="panel healthPanel">
      <PanelTitle label="Body battery" title="Energia disponible" />
      <div className="energyCurve">
        {curve.map((point) => (
          <div key={point.label}>
            <i style={{ height: `${Math.max(12, point.value)}%` }} />
            <span>{point.label}</span>
          </div>
        ))}
      </div>
      <div className="energyLegend">
        <span>Night charge</span>
        <span>Day drain</span>
        <span>Training window</span>
      </div>
    </article>
  );
}

function PlannedSessionDetail({ plannedSession, onBack }) {
  if (!plannedSession) {
    return (
      <section className="activityDetailView plannedSessionDetail">
        <header className="activityDetailHeader">
          <button className="detailIconButton" onClick={onBack} aria-label="Volver a actividades">
            <ArrowLeft size={22} />
          </button>
          <div className="activityTitleBlock">
            <p>Sesión planificada</p>
            <h1>Sin sesión seleccionada</h1>
            <small>Vuelve al calendario y abre una planificación.</small>
          </div>
        </header>
      </section>
    );
  }

  const blocks = plannedSession.blocks || [];
  const restrictions = plannedSession.restrictions || [];
  const exercises = plannedSession.exercises || [];

  return (
    <section className="activityDetailView plannedSessionDetail">
      <header className="activityDetailHeader">
        <button className="detailIconButton" onClick={onBack} aria-label="Volver a actividades">
          <ArrowLeft size={22} />
        </button>
        <div className="activityTitleBlock">
          <p>{[formatDateLong(plannedSession.date), plannedSession.time].filter(Boolean).join(" · ")}</p>
          <h1>{plannedSession.title}</h1>
          <small>{plannedSession.statusLabel} · {plannedSession.typeLabel}</small>
        </div>
      </header>

      <article className="activityMainCard plannedNoticeCard">
        <ClipboardList size={20} />
        <span>Sesión planificada. Todavía no tiene datos Garmin.</span>
      </article>

      <section className="plannedDetailGrid">
        <PlannedDetailCard title="Objetivo">
          <p>{plannedSession.objective || "Objetivo pendiente de definir."}</p>
        </PlannedDetailCard>

        <PlannedDetailCard title="Plan previsto">
          <dl className="plannedDefinitionList">
            <div>
              <dt>Duración</dt>
              <dd>{plannedSession.plannedDurationLabel || "Sin duración prevista"}</dd>
            </div>
            <div>
              <dt>Intensidad</dt>
              <dd>{plannedSession.intensityLabel || "Sin intensidad prevista"}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{plannedSession.statusLabel}</dd>
            </div>
          </dl>
        </PlannedDetailCard>

        <PlannedDetailCard title="Restricciones">
          {restrictions.length ? (
            <ul>
              {restrictions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p>Sin restricciones registradas.</p>
          )}
        </PlannedDetailCard>

        <PlannedDetailCard title="Notas coach">
          <p>{plannedSession.coachNotes || "Sin notas coach."}</p>
        </PlannedDetailCard>

        <PlannedDetailCard title="Bloques previstos" wide>
          {blocks.length ? (
            <ol className="plannedBlockList">
              {blocks.map((block) => (
                <li key={block.id}>
                  <strong>{block.title}</strong>
                  {block.description && <p>{block.description}</p>}
                  {block.exercises?.length ? <small>{block.exercises.join(" · ")}</small> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p>No hay bloques planificados registrados.</p>
          )}
        </PlannedDetailCard>

        <PlannedDetailCard title="Ejercicios previstos" wide>
          {exercises.length ? (
            <div className="plannedExerciseChips">
              {exercises.map((exercise) => <span key={exercise}>{exercise}</span>)}
            </div>
          ) : (
            <p>No hay ejercicios previstos registrados.</p>
          )}
        </PlannedDetailCard>
      </section>
    </section>
  );
}

function PlannedDetailCard({ title, wide = false, children }) {
  return (
    <article className={`activityElementCard plannedDetailCard ${wide ? "wide" : ""}`}>
      <h2>{title}</h2>
      {children}
    </article>
  );
}

function ActivityView({ activityDetail, onBack, onRenameSession }) {
  if (!activityDetail?.session) return <ActivityDetailSkeleton />;
  if (activityDetail.session.session_status === "archived") return <ArchivedSessionNotice detail={activityDetail} />;
  const conversationView = buildConversationActivityView(activityDetail);
  const hasConversationView = Boolean(conversationView?.blocks?.length);
  return (
    <section className="activityDetailView">
      <ActivityDetailHeader
        detail={activityDetail}
        onBack={onBack}
        onRenameSession={onRenameSession}
        minimal={hasConversationView}
        subtitle={conversationView?.subtitle}
      />
      <LinkedPlannedSessionPanel detail={activityDetail} />
      {!activityDetail.plannedSession && <ActivitySummaryMetrics detail={activityDetail} />}
      {hasConversationView && <ConversationActivityCard view={conversationView} />}
      <PhysiologyCard detail={activityDetail} />
      <ActivityTrainingEffectCard detail={activityDetail} />
    </section>
  );
}

function ArchivedSessionNotice({ detail }) {
  const canonical = detail?.canonicalSession;
  return (
    <section className="viewStack">
      <section className="sectionLead activitySummaryLead">
        <div className="leadIcon"><ShieldCheck size={22} /></div>
        <div>
          <h2>Sesión archivada</h2>
          <p>Esta sesión está archivada y no se renderiza como actividad normal.</p>
          {canonical && <p>Sesión canónica sugerida: {canonical.title} · {canonical.local_date} · {formatDurationClock(canonical.duration_seconds || 0)}</p>}
        </div>
      </section>
    </section>
  );
}

function ActivityDetailSkeleton() {
  return (
    <section className="viewStack activityDetailSkeleton" aria-busy="true">
      <article className="sectionLead activitySummaryLead skeletonCard" />
      <article className="activityElementCard wide skeletonCard">
        <div className="skeletonLine short" />
        <div className="skeletonLine" />
        <div className="skeletonLine" />
      </article>
      <article className="activityElementCard skeletonCard">
        <div className="skeletonLine short" />
        <div className="skeletonLine" />
        <div className="skeletonLine" />
      </article>
    </section>
  );
}

function ActivitySummaryCard({ detail }) {
  const session = detail.session || {};
  const duration = session.duration_seconds ? formatDurationClock(session.duration_seconds) : "";
  return (
    <section className="sectionLead activitySummaryLead">
      <div className="leadIcon">
        <Activity size={22} />
      </div>
      <div>
        <h2>Activity</h2>
        <p>{[session.activity_type || session.title, session.local_date, duration].filter(Boolean).join(" · ")}</p>
      </div>
    </section>
  );
}

function ActivityDetailHeader({ detail, onBack, onRenameSession, minimal = false, subtitle = "" }) {
  const session = detail.session || {};
  const isLinkedPlanned = Boolean(detail.plannedSession);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title || "");
  const [status, setStatus] = useState("");
  const canRename = !minimal && detail.canRename !== false;
  const isEditing = editing && canRename;
  const statusLine = isLinkedPlanned
    ? [detail.effectiveStatusLabel, detail.displaySource].filter(Boolean).join(" · ")
    : [formatActivityDateTime(session.started_at, session.local_date), readableSessionStatus(session.session_status)].filter(Boolean).join(" · ");

  useEffect(() => {
    setDraft(session.title || "");
  }, [session.title]);

  useEffect(() => {
    if (minimal && editing) setEditing(false);
  }, [minimal, editing]);

  const save = async (event) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || title === session.title) {
      setEditing(false);
      return;
    }
    try {
      setStatus("Guardando...");
      await onRenameSession?.(session.id, title);
      setStatus("Nombre actualizado");
      setEditing(false);
    } catch (error) {
      setStatus(error.message || "No se pudo renombrar");
    }
  };

  return (
    <header className="activityDetailHeader">
      <button type="button" className="detailIconButton" onClick={onBack} aria-label="Volver a actividades">
        <ArrowLeft size={22} />
      </button>
      <div className="activityTitleBlock">
        {isEditing ? (
          <form className="activityTitleForm" onSubmit={save}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Nombre de la sesión" autoFocus />
            <button type="submit" className="detailIconButton" aria-label="Guardar nombre">
              <CheckCircle2 size={18} />
            </button>
          </form>
        ) : (
          <div className="activityTitleLine">
            <h1>{session.title}</h1>
            {canRename && <button type="button" className="inlineEditButton" onClick={() => setEditing(true)} aria-label="Renombrar sesión">
              <Edit3 size={17} />
            </button>}
          </div>
        )}
        {subtitle && <p>{subtitle}</p>}
        <p>{statusLine}</p>
        {(!minimal || isLinkedPlanned) && session.garmin_original_title && session.garmin_original_title !== session.title && <small>Garmin: {session.garmin_original_title}</small>}
        {status && <small>{status}</small>}
      </div>
      {!minimal && <div className="activityHeaderActions">
        <button type="button" className="detailIconButton" aria-label="Descargar">
          <Download size={19} />
        </button>
        <button type="button" className="detailIconButton" aria-label="Mas opciones">
          <MoreVertical size={19} />
        </button>
      </div>}
    </header>
  );
}

function LinkedPlannedSessionPanel({ detail }) {
  const planned = detail.plannedSession;
  if (!planned) return null;
  const session = detail.session || {};
  const realMetrics = [
    { label: "Duración real", value: formatOptionalDuration(session.duration_seconds) },
    { label: "FC media", value: session.avg_hr == null ? "" : `${session.avg_hr} ppm` },
    { label: "FC máxima", value: session.max_hr == null ? "" : `${session.max_hr} ppm` },
    { label: "Calorías", value: session.calories_total == null ? "" : `${session.calories_total} kcal` },
    { label: "Training Effect", value: formatTrainingEffectPair(session.training_effect_aerobic, session.training_effect_anaerobic) },
  ].filter((item) => hasLinkedPanelValue(item.value));
  const planMetrics = [
    { label: "Objetivo previsto", value: planned.objective },
    { label: "RPE previsto", value: planned.intensityLabel },
    { label: "Duración prevista", value: planned.plannedDurationLabel },
    { label: "Restricciones", value: planned.restrictions?.join(" · ") },
  ].filter((item) => hasLinkedPanelValue(item.value));
  const blocks = planned.blocks || [];

  return (
    <section className="plannedCompletedDetailGrid" aria-label="Sesión planificada completada">
      <PlannedDetailCard title="Datos Garmin/FIT">
        <dl className="plannedDefinitionList">
          {realMetrics.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </PlannedDetailCard>

      <PlannedDetailCard title="Plan previsto">
        <dl className="plannedDefinitionList">
          {planMetrics.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </PlannedDetailCard>

      <PlannedDetailCard title="Bloques previstos" wide>
        {blocks.length ? (
          <ol className="plannedBlockList">
            {blocks.map((block) => (
              <li key={block.id}>
                <strong>{block.title}</strong>
                {block.description && <p>{block.description}</p>}
                {block.exercises?.length ? <small>{block.exercises.join(" · ")}</small> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p>No hay bloques planificados registrados.</p>
        )}
      </PlannedDetailCard>
    </section>
  );
}

function hasLinkedPanelValue(value) {
  if (value == null) return false;
  const text = `${value}`.trim();
  return Boolean(text) && text !== "N/D";
}

function formatTrainingEffectPair(aerobic, anaerobic) {
  const aerobicValue = optionalNumber(aerobic);
  const anaerobicValue = optionalNumber(anaerobic);
  if (aerobicValue == null && anaerobicValue == null) return "";
  return [aerobicValue, anaerobicValue]
    .map((value) => value == null ? null : value.toFixed(1))
    .filter(Boolean)
    .join(" / ");
}

function ActivitySummaryMetrics({ detail }) {
  const session = detail.session || {};
  const metrics = [
    durationMetricTile("Tiempo total", session.duration_seconds, Clock3, "lime", { requirePositive: true }),
    durationMetricTile("Tiempo activo", session.active_seconds, Play, "lime"),
    durationMetricTile("Descanso total", session.rest_seconds, Coffee, "cyan"),
    numberMetricTile("Calorías", session.calories_total, Flame, "orange", "kcal"),
  ].filter(Boolean);
  if (!metrics.length) return null;
  return (
    <section className="activityMetricRow" aria-label="Resumen de actividad">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className={`activityMetricTile ${metric.tone}`} key={metric.label}>
            <Icon size={25} />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        );
      })}
    </section>
  );
}

function durationMetricTile(label, value, icon, tone, options = {}) {
  const seconds = optionalNumber(value);
  if (seconds == null || seconds < 0) return null;
  if (options.requirePositive && seconds <= 0) return null;
  return { label, value: formatDurationClock(seconds), icon, tone };
}

function numberMetricTile(label, value, icon, tone, unit = "") {
  const number = optionalNumber(value);
  if (number == null) return null;
  return { label, value: `${formatNumberValue(number)}${unit ? ` ${unit}` : ""}`, icon, tone };
}

function ConversationActivityCard({ view }) {
  if (!view?.blocks?.length) return null;
  return (
    <article className="activityMainCard conversationActivityCard">
      <section className="conversationSummary">
        <span>Resumen</span>
        <p>{view.summaryText}</p>
        {view.compactLine && <small>{view.compactLine}</small>}
      </section>

      {view.keyChips.length > 0 && (
        <section className="conversationKeyData" aria-label="Datos clave">
          {view.keyChips.map((chip) => <span key={chip}>{chip}</span>)}
        </section>
      )}

      <section className="conversationBlocks">
        <h2>Bloques realizados</h2>
        <div>
          {view.blocks.map((block) => (
            <details className="conversationBlockCard" key={block.id}>
              <summary>
                <span>{block.order}</span>
                <div>
                  <strong>{block.type}</strong>
                  <p>{block.closedSummary}</p>
                  <small>{block.volume}</small>
                </div>
                <ChevronRight size={18} />
              </summary>
              <div className="conversationBlockDetail">
                <ConversationExerciseList exercises={block.exercises} fallback={block.workPerformed} />
                <ConversationDetailLine label="Volumen / dato clave" value={block.volume} />
                <ConversationDetailLine label="Objetivo" value={block.objective} />
                {block.pendingNote && <small className="conversationPendingNote">{block.pendingNote}</small>}
              </div>
            </details>
          ))}
        </div>
      </section>
    </article>
  );
}

function ConversationExerciseList({ exercises = [], fallback }) {
  if (!exercises.length) return <ConversationDetailLine label="Trabajo realizado" value={fallback} />;
  return (
    <section className="conversationExerciseSection">
      <span>Trabajo realizado</span>
      <ol className="conversationExerciseList">
        {exercises.map((exercise, index) => (
          <li key={`${exercise.name}-${index}`}>
            <strong>{exercise.name}</strong>
            {exercise.detailText && <small>{exercise.detailText}</small>}
            {exercise.notes && <em>{exercise.notes}</em>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConversationDetailLine({ label, value }) {
  if (!hasDisplayValue(value)) return null;
  return (
    <section>
      <span>{label}</span>
      <p>{value}</p>
    </section>
  );
}

function buildConversationActivityView(detail = {}) {
  const executiveRows = normalizeExecutiveSummaryRows(detail.executiveSummaryTable);
  if (executiveRows.length) return executiveRowsView(detail, executiveRows);
  const legacyRows = legacyConversationRows(detail.blocks || []);
  if (legacyRows.length) return executiveRowsView(detail, legacyRows, { source: "legacy" });
  return null;
}

function executiveRowsView(detail, rows, options = {}) {
  const richBlocksByOrder = new Map((detail.blocks || []).map((block, index) => [`${block.orderText || index + 1}`, block]));
  const blocks = rows.map((row, index) => {
    const order = row.block || row.order || index + 1;
    const richBlock = richBlocksByOrder.get(`${order}`) || detail.blocks?.[index] || null;
    const exercises = richBlock?.exerciseDetails || [];
    const volume = formatBlockKeyVolume(richBlock) || cleanText(row.volume_key_data || row.volumeKeyData || row.volume || row.data);
    const work = cleanText(row.work_performed || row.workPerformed || row.summary || row.name);
    const objective = cleanText(row.objective || row.goal);
    const closedSummary = exercises.length
      ? compactExerciseSummary(exercises)
      : compactConversationText(work, 72);
    return {
      id: row.id || `${options.source || "executive"}-${row.block || index + 1}`,
      order,
      type: cleanText(row.type || row.name || `Bloque ${index + 1}`),
      closedSummary,
      workPerformed: exercises.length ? exercises.map((exercise) => exercise.name).join(" · ") : work,
      volume,
      objective,
      exercises,
      pendingNote: pendingNoteFromRow(row, volume),
    };
  });
  return {
    subtitle: conversationalActivitySubtitle(detail.session?.activity_type, detail.session?.title),
    summaryText: resolveConversationSummary(detail, blocks),
    compactLine: conversationCompactLine(blocks),
    keyChips: conversationKeyChips(blocks),
    blocks,
  };
}

function normalizeExecutiveSummaryRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === "object")
    .map((row, index) => ({
      ...row,
      block: row.block ?? row.block_order ?? row.order ?? index + 1,
      type: row.type || row.block_type || row.name,
      work_performed: row.work_performed || row.workPerformed || row.work || row.summary,
      volume_key_data: row.volume_key_data || row.volumeKeyData || row.volume || row.key_data,
      objective: row.objective || row.goal,
    }))
    .filter((row) => hasDisplayValue(row.type) || hasDisplayValue(row.work_performed) || hasDisplayValue(row.volume_key_data));
}

function legacyConversationRows(blocks = []) {
  return blocks
    .filter((block) => hasDisplayValue(block.name) || hasDisplayValue(block.summaryText) || hasDisplayValue(block.executionText))
    .map((block, index) => {
      const exercises = (block.exerciseDetails || []).map((exercise) => exercise.name).filter(Boolean).join(", ");
      return {
        id: block.id || `legacy-${index + 1}`,
        block: block.orderText && block.orderText !== "N/D" ? block.orderText : index + 1,
        type: block.name || block.typeLabel || `Bloque ${index + 1}`,
        work_performed: block.summaryText && block.summaryText !== "N/D" ? block.summaryText : exercises,
        volume_key_data: formatBlockKeyVolume(block),
        objective: block.sensationText && block.sensationText !== "N/D" ? block.sensationText : block.typeLabel,
        pending_note: block.warningText,
      };
    });
}

function resolveExecutiveSummaryTable(sessionStructure = {}, enrichmentPayload = {}) {
  return firstArray(
    sessionStructure?.executive_summary_table,
    sessionStructure?.conversation_summary?.executive_summary_table,
    sessionStructure?.coach_summary?.executive_summary_table,
    sessionStructure?.enrichment?.executive_summary_table,
    enrichmentPayload?.executive_summary_table,
    enrichmentPayload?.conversation_summary?.executive_summary_table,
    enrichmentPayload?.coach_summary?.executive_summary_table,
  );
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) || [];
}

function resolveConversationSummary(detail, blocks) {
  const candidates = [
    detail.sessionStructure?.conversation_summary?.summary,
    detail.sessionStructure?.conversation_summary?.text,
    detail.sessionStructure?.summary,
    detail.enrichmentPayload?.conversation_summary?.summary,
    detail.enrichmentPayload?.summary,
    detail.enrichmentPayload?.session_summary,
  ];
  const found = candidates.map(cleanText).find(Boolean);
  if (found) return found;
  const hybridCount = blocks.filter((block) => /h[ií]brido|hybrid/i.test(block.type)).length;
  const circuitCount = blocks.filter((block) => /circuit/i.test(block.type)).length;
  const types = [...new Set(blocks.map((block) => block.type).filter(Boolean))].slice(0, 3).join(", ");
  if (hybridCount || circuitCount) {
    return `Sesión híbrida full body con ${blocks.length} bloques${hybridCount ? `, ${hybridCount} híbridos` : ""}${circuitCount ? ` y ${circuitCount} circuito final` : ""}.`;
  }
  return `Sesión estructurada en ${blocks.length} bloques${types ? `: ${types}` : ""}.`;
}

function conversationCompactLine(blocks) {
  const hybridCount = blocks.filter((block) => /h[ií]brido|hybrid/i.test(block.type)).length;
  const circuitCount = blocks.filter((block) => /circuit/i.test(block.type)).length;
  return [
    `${blocks.length} bloques`,
    hybridCount ? `${hybridCount} híbridos` : null,
    circuitCount ? `${circuitCount} circuito final` : null,
  ].filter(Boolean).join(" · ");
}

function conversationKeyChips(blocks) {
  const chips = [];
  blocks.forEach((block) => {
    extractKeyChips(block.volume).forEach((chip) => {
      if (chips.length < 6 && !chips.includes(chip)) chips.push(chip);
    });
  });
  return chips;
}

function compactExerciseSummary(exercises = []) {
  const names = exercises.map((exercise) => simplifyExerciseName(exercise.name)).filter(Boolean);
  if (!names.length) return "";
  if (names.length <= 3) return names.join(" · ");
  return `${names.slice(0, 3).join(" · ")} · +${names.length - 3}`;
}

function extractKeyChips(text = "") {
  const source = cleanText(text);
  if (!source || /sin tiempo exacto|pendiente/i.test(source)) return [];
  const patterns = [
    /remo\s*~?\d+[\d,.]*\s*m(?:\/ronda)?/ig,
    /assault\s*~?\d+[\d,.]*\s*rpm/ig,
    /push press\s*~?\d+[\d,.]*\s*(?:kg|reps)/ig,
    /wall ball\s*~?\d+[\d,.]*\s*kg/ig,
    /press\s*~?\d+[\d,.]*\s*kg/ig,
    /\d+\s*rondas?/ig,
    /\d+\s*\/\s*lado/ig,
  ];
  return patterns.flatMap((pattern) => source.match(pattern) || []).map((item) => compactConversationText(item, 26));
}

function pendingNoteFromRow(row, volume) {
  const explicit = cleanText(row.pending_note || row.pending || row.warning);
  if (explicit) return explicit;
  if (/pendiente/i.test(`${volume || ""}`)) return "Hay datos pendientes por completar.";
  return "";
}

function compactConversationText(value, maxLength = 86) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  const words = text.split(/\s+/);
  let result = "";
  for (const word of words) {
    const next = result ? `${result} ${word}` : word;
    if (next.length > maxLength) break;
    result = next;
  }
  return result ? `${result}...` : text.slice(0, maxLength);
}

function cleanText(value) {
  return repairMojibakeText(value).replace(/\s+/g, " ").trim();
}

function repairMojibakeText(value) {
  if (value == null) return "";
  const replacements = [
    ["\u00c2\u00b7", "·"],
    ["\u00c3\u00a1", "á"],
    ["\u00c3\u00a9", "é"],
    ["\u00c3\u00ad", "í"],
    ["\u00c3\u00b3", "ó"],
    ["\u00c3\u00ba", "ú"],
    ["\u00c3\u00b1", "ñ"],
    ["\u00c3\u0161", "Ú"],
    ["\u00e2\u20ac\u201d", "—"],
    ["\u00c2", ""],
  ];
  return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), `${value}`);
}

function conversationalActivitySubtitle(activityType, title = "") {
  const text = `${activityType || ""} ${title || ""}`.toLowerCase();
  if (text.includes("hiit") || text.includes("hybrid") || text.includes("hibrid")) return "Entrenamiento híbrido";
  if (text.includes("strength") || text.includes("fuerza")) return "Entrenamiento de fuerza";
  if (text.includes("yoga")) return "Yoga";
  if (text.includes("run") || text.includes("correr")) return "Entrenamiento de carrera";
  if (text.includes("swim") || text.includes("nataci")) return "Entrenamiento de natación";
  return "Entrenamiento";
}

function readableSessionStatus(status) {
  const text = `${status || ""}`.toLowerCase();
  if (!text) return "";
  if (["completed", "complete", "done"].includes(text)) return "Completado";
  if (text === "planned") return "Planificado";
  if (text === "imported") return "Importado";
  if (text === "draft") return "Borrador";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function TrainingSessionCard({ detail }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessionModel, setSessionModel] = useState(() => buildUniversalSessionView(detail));
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    setSessionModel(buildUniversalSessionView(detail));
    setSelectedIndex(0);
    setSaveStatus("");
  }, [detail]);

  const view = useMemo(() => buildTrainingSessionCardView(sessionModel, selectedIndex), [sessionModel, selectedIndex]);
  const blocks = view.session_summary.blocks || [];
  const metrics = view.session_summary.metrics || {};
  const selectedBlock = view.block_detail;
  if (!blocks.length) return null;

  const handleQuickEditSave = async ({ block, item, exercise, values }) => {
    setSaveStatus("Guardando...");
    try {
      const localId = exercise.item_exercise_id || exercise.id || exercise.exercise_id;
      const preview = applyQuickEditToTrainingSession(sessionModel, localId, values);
      const persisted = await persistQuickTrainingEdit({
        sessionId: detail.session?.id,
        block,
        item,
        exercise,
        values,
        summaryMetrics: preview.summary_metrics,
      });
      setSessionModel((current) => {
        const itemExerciseId = persisted.itemExerciseId || exercise.item_exercise_id || exercise.id || exercise.exercise_id;
        const next = applyQuickEditToTrainingSession(current, itemExerciseId, values);
        return persisted.itemExerciseId && itemExerciseId !== persisted.itemExerciseId
          ? applyQuickEditToTrainingSession(next, persisted.itemExerciseId, values)
          : next;
      });
      setSaveStatus("Guardado");
    } catch (error) {
      setSaveStatus(error.message || "No se pudo guardar");
      throw error;
    }
  };

  return (
    <article className="activityMainCard trainingSessionCard">
      <div className="trainingSessionCardHead">
        <div>
          <h2>{view.session_summary.title}</h2>
          <p>{sessionQuantLine(metrics)}</p>
        </div>
        <CompletionScoreBadge value={metrics.completion_score} />
      </div>

      <div className="trainingMetricStrip" aria-label="Métricas de sesión">
        <TrainingMetric label="Bloques" value={metrics.total_blocks || blocks.length} />
        <TrainingMetric label="Ejercicios" value={metrics.total_exercises} />
        <TrainingMetric label="Tiempo" value={formatMetricDuration(metrics.total_duration_s)} />
        <TrainingMetric label="Rondas" value={metrics.total_rounds} />
        <TrainingMetric label="Series" value={metrics.total_sets} />
        <TrainingMetric label="Reps" value={metrics.total_reps || metrics.total_reps_per_side} />
        <TrainingMetric label="Volumen" value={formatKg(metrics.total_load_volume_kg)} />
        <TrainingMetric label="Pendientes" value={metrics.missing_fields_count} />
      </div>

      <div className="trainingTwoLevelGrid">
        <div className="trainingBlockSummaryList" aria-label="Resumen por bloques">
          {blocks.map((block, index) => (
            <TrainingBlockSummaryRow
              key={block.id}
              block={block}
              active={index === selectedIndex}
              onSelect={() => setSelectedIndex(index)}
            />
          ))}
        </div>
        {selectedBlock && <TrainingBlockDetail block={selectedBlock} onQuickEditSave={handleQuickEditSave} />}
      </div>
      {saveStatus && <small className="trainingSaveStatus">{saveStatus}</small>}
    </article>
  );
}

function TrainingMetric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{safeMetric(value)}</strong>
    </div>
  );
}

function TrainingBlockSummaryRow({ block, active, onSelect }) {
  const meta = [
    block.exercise_count ? `${block.exercise_count} ejercicios` : null,
    block.rounds ? `${block.rounds} rondas` : null,
    block.duration_s ? formatDurationClock(block.duration_s) : null,
    block.measurement,
  ].filter(Boolean).join(" · ");
  return (
    <button type="button" className={active ? "active" : ""} onClick={onSelect}>
      <span>{block.order_index}</span>
      <div>
        <strong>{readableBlockName(block)}</strong>
        <small>{meta}</small>
        <em>{block.missing_fields_count ? `${block.missing_fields_count} pendientes` : "Completo"}</em>
      </div>
      <ChevronRight size={17} />
    </button>
  );
}

function TrainingBlockDetail({ block, onQuickEditSave }) {
  const metrics = [
    block.rounds ? `${block.rounds} rondas` : null,
    block.duration_s ? formatDurationClock(block.duration_s) : null,
    block.measurement,
  ].filter(Boolean).join(" · ");
  return (
    <section className="trainingBlockDetail" aria-label="Detalle de bloque">
      <header>
        <div>
          <span>Bloque {block.order_index}</span>
          <h3>{readableBlockName(block)}</h3>
          <p>{metrics || "Medicion pendiente"}</p>
        </div>
        <MeasurementTypeBadge label={block.block_format} />
      </header>
      <div className="blockItemRows">
        {block.items.map((item) => (
          <BlockItemRow key={item.id} block={block} item={item} onQuickEditSave={onQuickEditSave} />
        ))}
      </div>
    </section>
  );
}

function BlockItemRow({ block, item, onQuickEditSave }) {
  return (
    <div className="blockItemRow">
      <div className="blockItemLabel">
        <span>{item.station_label || item.minute_slot ? item.station_label || `Minuto ${item.minute_slot}` : item.item_type}</span>
        <strong>{item.item_name}</strong>
      </div>
      <div className="exerciseMetricLines">
        {item.exercises.map((exercise) => (
          <ExerciseMetricLine key={exercise.id} block={block} item={item} exercise={exercise} onQuickEditSave={onQuickEditSave} />
        ))}
      </div>
    </div>
  );
}

function ExerciseMetricLine({ block, item, exercise, onQuickEditSave }) {
  return (
    <div className="exerciseMetricLine">
      <div>
        <strong>{exercise.display_name}</strong>
        <span>{measurementText(exercise)}</span>
      </div>
      <MissingFieldsBadge fields={exercise.missing_fields} />
      {exercise.performed_sets?.length > 0 && <PerformedSetList sets={exercise.performed_sets} />}
      {exercise.missing_fields?.length > 0 && (
        <QuickMissingFieldsEditor
          fields={exercise.missing_fields}
          onSave={(values) => onQuickEditSave?.({ block, item, exercise, values })}
        />
      )}
    </div>
  );
}

function PerformedSetList({ sets }) {
  return (
    <div className="performedSetList">
      {sets.map((set) => (
        <span key={set.set_index}>
          {set.set_index}
          {set.reps != null ? ` · ${set.reps} reps` : ""}
          {set.reps_left != null || set.reps_right != null ? ` · ${set.reps_left || 0}/${set.reps_right || 0}` : ""}
          {set.load_kg != null ? ` · ${formatNumberValue(set.load_kg)} kg` : ""}
          {set.duration_s != null ? ` · ${formatDurationClock(set.duration_s)}` : ""}
          {set.distance_m != null ? ` · ${formatNumberValue(set.distance_m)} m` : ""}
        </span>
      ))}
    </div>
  );
}

function QuickMissingFieldsEditor({ fields, onSave }) {
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!fields?.length) return null;
  return (
    <form
      className="missingFieldEditor"
      onSubmit={async (event) => {
        event.preventDefault();
        const values = parseQuickEditValues(draft);
        if (!Object.keys(values).length) {
          setError("Introduce al menos un valor");
          return;
        }
        try {
          setError("");
          setSaving(true);
          await onSave?.(values);
          setSaved(true);
        } catch (saveError) {
          setSaved(false);
          setError(saveError.message || "No se pudo guardar");
        } finally {
          setSaving(false);
        }
      }}
    >
      {fields.slice(0, 4).map((field) => (
        <label key={field}>
          <span>{fieldLabel(field)}</span>
          <input
            inputMode="decimal"
            value={draft[field] || ""}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({ ...current, [field]: event.target.value }));
            }}
          />
        </label>
      ))}
      <button type="submit" disabled={saving}>{saving ? "Guardando" : "Guardar"}</button>
      {saved && <small>Actualizado</small>}
      {error && <small className="fieldError">{error}</small>}
    </form>
  );
}

function MissingFieldsBadge({ fields = [] }) {
  if (!fields.length) return <span className="missingFieldsBadge complete"><CheckCircle2 size={13} />Completo</span>;
  return <span className="missingFieldsBadge">{fields.length} pendientes</span>;
}

function CompletionScoreBadge({ value }) {
  const score = optionalNumber(value);
  return <strong className="completionScoreBadge">{score == null ? "Pendiente" : `${score}%`}</strong>;
}

function MeasurementTypeBadge({ label }) {
  return <span className="measurementTypeBadge">{label || "mixed"}</span>;
}

function sessionQuantLine(metrics) {
  return [
    metrics.total_blocks ? `${metrics.total_blocks} bloques` : null,
    metrics.total_exercises ? `${metrics.total_exercises} ejercicios` : null,
    metrics.total_duration_s ? formatDurationClock(metrics.total_duration_s) : null,
    metrics.total_rounds ? `${metrics.total_rounds} rondas` : null,
    metrics.missing_fields_count != null ? `Completitud ${metrics.completion_score ?? "pendiente"}%` : null,
  ].filter(Boolean).join(" · ");
}

function readableBlockName(block) {
  return {
    strength_main: "Fuerza principal",
    strength_accessory: "Fuerza accesoria",
    mobility: "Movilidad",
    conditioning: "Cardio",
    cooldown: "Cooldown",
    warmup: "Calentamiento",
    emom: "EMOM",
    amrap: "AMRAP",
    intervals: "Intervalos",
    swim_main_set: "Main set",
    bike_interval: "Intervalos bici",
    rehab: "Rehab",
    prehab: "Prehab",
    mixed: "Mixto",
  }[block.block_type] || block.title || block.block_type || "Bloque";
}

function fieldLabel(field) {
  return {
    reps: "Reps",
    reps_per_side: "Reps/lado",
    load_kg: "Peso kg",
    duration_s: "Tiempo s",
    distance_m: "Distancia m",
    sets: "Series",
    rpe: "RPE",
    rir: "RIR",
    pace_s_per_km: "Ritmo",
    power_w: "Potencia W",
    score: "Score",
  }[field] || field;
}

function measurementText(exercise) {
  const volume = optionalNumber(exercise.summary_metrics?.load_volume_kg);
  return [
    exercise.measurement_type,
    volume ? `${formatNumberValue(volume)} kg` : null,
  ].filter(Boolean).join(" · ");
}

function formatMetricDuration(value) {
  const seconds = optionalNumber(value);
  return seconds == null ? null : formatDurationClock(seconds);
}

function formatKg(value) {
  const number = optionalNumber(value);
  return number == null ? null : `${formatNumberValue(number)} kg`;
}

function safeMetric(value) {
  return value == null || value === "" || value === 0 ? "—" : value;
}

function parseQuickEditValues(draft = {}) {
  return Object.fromEntries(
    Object.entries(draft)
      .map(([key, value]) => [key, numericInput(value)])
      .filter(([, value]) => value != null),
  );
}

function numericInput(value) {
  if (value == null || `${value}`.trim() === "") return null;
  const number = Number(`${value}`.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

async function persistQuickTrainingEdit({ sessionId, block, item, exercise, values, summaryMetrics }) {
  if (!supabase) throw new Error("Sin conexión de datos");
  if (!sessionId) throw new Error("Sesión no disponible");

  const itemExerciseId = await ensureItemExerciseForQuickEdit({ block, item, exercise });
  const setPatch = performedSetPayload(values);
  const metricRows = performedMetricPayload(values);

  if (Object.keys(setPatch).length) {
    const { error } = await supabase
      .from("performed_sets")
      .upsert(
        {
          item_exercise_id: itemExerciseId,
          set_index: 1,
          ...setPatch,
          completed: true,
        },
        { onConflict: "item_exercise_id,set_index" },
      );
    if (error) throw new Error(error.message);
  }

  if (metricRows.length) {
    const { error } = await supabase
      .from("performed_metrics")
      .upsert(
        metricRows.map((row) => ({ ...row, item_exercise_id: itemExerciseId })),
        { onConflict: "item_exercise_id,metric_name" },
      );
    if (error) throw new Error(error.message);
  }

  const missingFields = (exercise.missing_fields || []).filter((field) => !quickEditFieldProvided(field, values));
  const { error: exerciseError } = await supabase
    .from("item_exercises")
    .update({ missing_fields: missingFields })
    .eq("id", itemExerciseId);
  if (exerciseError) throw new Error(exerciseError.message);

  if (summaryMetrics) {
    const { error: sessionError } = await supabase
      .from("training_sessions")
      .update({
        summary_metrics: summaryMetrics,
        completion_score: summaryMetrics.completion_score ?? null,
      })
      .eq("id", sessionId);
    if (sessionError) throw new Error(sessionError.message);
  }

  return { itemExerciseId };
}

async function ensureItemExerciseForQuickEdit({ block, item, exercise }) {
  if (isUuid(exercise.item_exercise_id)) return exercise.item_exercise_id;
  const blockId = block.block_id || block.id;
  if (!isUuid(blockId)) throw new Error("Bloque canonico no disponible para persistir");

  const blockItemId = isUuid(item.block_item_id)
    ? item.block_item_id
    : await upsertBlockItemForQuickEdit(blockId, item);

  const exerciseId = exercise.exercise_id || exercise.canonical_slug || slugFromText(exercise.display_name);
  const { data, error } = await supabase
    .from("item_exercises")
    .upsert(
      {
        block_item_id: blockItemId,
        order_index: item.order_index || 1,
        exercise_id: exerciseId,
        display_name: exercise.display_name || exerciseId,
        measurement_type: exercise.measurement_type || "mixed",
        missing_fields: exercise.missing_fields || [],
        summary_metrics: exercise.summary_metrics || {},
      },
      { onConflict: "block_item_id,order_index" },
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

async function upsertBlockItemForQuickEdit(blockId, item) {
  const { data, error } = await supabase
    .from("block_items")
    .upsert(
      {
        block_id: blockId,
        order_index: item.order_index || 1,
        item_type: item.item_type || "exercise_direct",
        item_name: item.item_name || "Ejercicio",
        station_label: item.station_label || null,
        minute_slot: item.minute_slot || null,
        duration_s: item.duration_s || null,
        rest_s: item.rest_s || null,
        summary_metrics: {},
      },
      { onConflict: "block_id,order_index" },
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

function performedSetPayload(values = {}) {
  const payload = {};
  if (values.reps != null) payload.reps = values.reps;
  if (values.reps_per_side != null) {
    payload.reps_left = values.reps_per_side;
    payload.reps_right = values.reps_per_side;
  }
  if (values.load_kg != null) payload.load_kg = values.load_kg;
  if (values.duration_s != null) payload.duration_s = values.duration_s;
  if (values.distance_m != null) payload.distance_m = values.distance_m;
  if (values.rpe != null) payload.rpe = values.rpe;
  if (values.rir != null) payload.rir = values.rir;
  return payload;
}

function performedMetricPayload(values = {}) {
  const setFields = new Set(["reps", "reps_per_side", "load_kg", "duration_s", "distance_m", "rpe", "rir"]);
  return Object.entries(values)
    .filter(([key]) => !setFields.has(key))
    .map(([metric_name, metric_value]) => ({
      metric_name,
      metric_value,
      metric_unit: metricUnit(metric_name),
      confidence: "user_reported",
    }));
}

function metricUnit(field) {
  if (field.endsWith("_s")) return "s";
  if (field.endsWith("_m")) return "m";
  if (field.endsWith("_kg")) return "kg";
  return "";
}

function quickEditFieldProvided(field, values = {}) {
  if (field === "sets") return Object.keys(values).some((key) => ["reps", "reps_per_side", "load_kg", "duration_s", "distance_m"].includes(key));
  return values[field] != null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${value || ""}`);
}

function slugFromText(value) {
  return `${value || "exercise"}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function hasHeartRateData(detail) {
  const session = detail.session || {};
  return positiveMetric(session.avg_hr) ||
    positiveMetric(session.max_hr) ||
    Boolean(detail.samples?.some((sample) => positiveMetric(sample.heart_rate_bpm)));
}

function hasRespirationData(detail) {
  const session = detail.session || {};
  return positiveMetric(session.respiration_avg_brpm) ||
    positiveMetric(session.respiration_max_brpm) ||
    Boolean(detail.respirationSamples?.some((sample) => positiveMetric(sample.respiration_brpm)));
}

function positiveMetric(value) {
  const number = optionalNumber(value);
  return number != null && number > 0;
}

function hasDisplayValue(value) {
  if (value == null) return false;
  const text = `${value}`.trim();
  return Boolean(text) && text !== "N/D";
}

function PhysiologyCard({ detail }) {
  const [tab, setTab] = useState("session");
  const hasBlocks = Boolean(detail.garminBlocks?.length);
  const hasSessionData = hasHeartRateData(detail) || hasRespirationData(detail) || Boolean(detail.zones?.length);
  const activeTab = !hasSessionData && hasBlocks ? "blocks" : tab;
  if (!hasBlocks && !hasSessionData) return null;
  return (
    <article className="activityMainCard physiologyCard">
      <h2>Frecuencia cardíaca y respiración</h2>
      {hasBlocks && hasSessionData && (
        <div className="detailSegmented" role="tablist" aria-label="Frecuencia cardíaca y respiración">
          <button type="button" className={activeTab === "session" ? "active" : ""} onClick={() => setTab("session")}>Sesión</button>
          <button type="button" className={activeTab === "blocks" ? "active" : ""} onClick={() => setTab("blocks")}>Bloques</button>
        </div>
      )}
      {activeTab === "blocks" && hasBlocks ? <GarminBlocksTab detail={detail} /> : <SessionPhysiologyTab detail={detail} />}
    </article>
  );
}

function SessionPhysiologyTab({ detail }) {
  const session = detail.session || {};
  const durationSeconds = Number(session.duration_seconds || Math.max(...detail.samples.map((sample) => Number(sample.elapsed_seconds || 0)), 0));
  const hasHr = hasHeartRateData(detail);
  const hasZones = Boolean(detail.zones?.length);
  const hasRespiration = hasRespirationData(detail);
  return (
    <div className="sessionPhysiologyTab">
      {(hasHr || hasZones) && (
        <section className="hrSessionGrid">
          {hasHr && (
            <div className="chartPane">
              <PhysioSectionHeader title="Frecuencia cardíaca" unit="ppm" avg={session.avg_hr} max={session.max_hr} />
              <HeartRateGarminLikeChart
                samples={detail.samples}
                avgHr={session.avg_hr ?? 0}
                durationSeconds={durationSeconds}
                mode="zones"
                zones={detail.zones}
                blocks={[]}
                height={300}
              />
            </div>
          )}
          {hasZones && <HeartRateZoneList zones={detail.zones} title="Zonas de frecuencia cardíaca por tiempo" />}
        </section>
      )}
      {hasRespiration && (
        <section className="respirationPane">
          <PhysioSectionHeader title="Frecuencia respiratoria" unit="brpm" avg={session.respiration_avg_brpm} max={session.respiration_max_brpm} />
          <RespirationTimelineChart samples={detail.respirationSamples} durationSeconds={durationSeconds} avg={session.respiration_avg_brpm} />
        </section>
      )}
    </div>
  );
}

function PhysioSectionHeader({ title, unit, avg, max }) {
  const stats = [
    avg == null ? null : { label: "Media", value: avg },
    max == null ? null : { label: "Máxima", value: max },
  ].filter(Boolean);
  return (
    <div className="physioSectionHeader">
      <h3>{title} <CircleGauge size={15} /></h3>
      {stats.length > 0 && (
        <div className="physioStats">
          {stats.map((item) => (
            <div key={item.label}><strong>{item.value}</strong><span>{unit} {item.label}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeartRateZoneList({ zones = [], title }) {
  const displayZones = displayHeartRateZones(zones);
  if (!displayZones.length) return null;
  return (
    <aside className="heartZonePanel">
      <h3>{title} <CircleGauge size={15} /></h3>
      <div className="heartZoneRows">
        {displayZones.map((zone) => (
          <div className="heartZoneRow" key={zone.key || zone.label}>
            <i style={{ background: zone.color }} />
            <strong>{zone.label}</strong>
            <span>{zone.range} · {zone.name}</span>
            <b>{formatDurationClock(zone.seconds || 0)}</b>
            <em>{zone.percent || 0}%</em>
            <small><u style={{ width: `${Math.min(100, zone.percent || 0)}%`, background: zone.color }} /></small>
          </div>
        ))}
      </div>
    </aside>
  );
}

function RespirationTimelineChart({ samples = [], durationSeconds = 0, avg = null }) {
  if (!samples.length) return null;
  const width = 920;
  const height = 230;
  const padding = { top: 18, right: 26, bottom: 42, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = samples.map((sample) => Number(sample.respiration_brpm)).filter((value) => value > 0);
  const yMin = values.length ? Math.max(0, Math.floor((Math.min(...values) - 4) / 4) * 4) : 8;
  const yMax = values.length ? Math.max(32, Math.ceil((Math.max(...values) + 4) / 4) * 4) : 48;
  const xScale = (seconds) => padding.left + (Number(seconds || 0) / Math.max(1, durationSeconds)) * plotWidth;
  const yScale = (value) => padding.top + (1 - (Number(value || yMin) - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
  const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];
  const prepared = samples.length ? downsampleRespirationSamples(samples, 420) : [];
  const topLine = prepared.map((point) => `${xScale(point.elapsed_seconds).toFixed(2)},${yScale(point.respiration_brpm).toFixed(2)}`).join(" ");
  const area = prepared.length
    ? `${xScale(prepared[0].elapsed_seconds).toFixed(2)},${yScale(yMin).toFixed(2)} ${topLine} ${xScale(prepared[prepared.length - 1].elapsed_seconds).toFixed(2)},${yScale(yMin).toFixed(2)}`
    : "";
  return (
    <div className="respirationChart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de frecuencia respiratoria">
        <rect x="0" y="0" width={width} height={height} />
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yScale(tick)} y2={yScale(tick)} />
            <text x={padding.left - 10} y={yScale(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        {getTimeTicks(durationSeconds).map((tick) => (
          <text key={tick} x={xScale(tick)} y={height - 14} textAnchor="middle">{formatElapsedTime(tick)}</text>
        ))}
        {area && <polygon points={area} />}
        {topLine && <polyline points={topLine} />}
        {avg != null && <line className="respAvg" x1={padding.left} x2={width - padding.right} y1={yScale(avg)} y2={yScale(avg)} />}
      </svg>
    </div>
  );
}

function GarminBlocksTab({ detail }) {
  const blocks = detail.garminBlocks || [];
  return (
    <div className="garminBlocksTab">
      <div className="blocksIntro">
        <h3>Segmentos objetivos</h3>
      </div>
      {blocks.length ? (
        <div className="garminBlockList">
          {blocks.map((block) => <GarminBlockCard key={block.id} block={block} />)}
        </div>
      ) : (
        <div className="softEmpty">Sin segmentos objetivos identificados.</div>
      )}
    </div>
  );
}

function GarminBlockCard({ block }) {
  const duration = optionalNumber(block.active_seconds ?? block.duration_seconds);
  const metrics = [
    block.heart_rate_avg_bpm == null ? null : ["FC media", `${block.heart_rate_avg_bpm} ppm`],
    block.heart_rate_max_bpm == null ? null : ["FC máxima", `${block.heart_rate_max_bpm} ppm`],
    block.respiration_avg_brpm == null ? null : ["Resp. media", `${block.respiration_avg_brpm} brpm`],
    block.respiration_max_brpm == null ? null : ["Resp. máxima", `${block.respiration_max_brpm} brpm`],
  ].filter(Boolean);
  return (
    <article className="garminBlockCard" style={{ "--block": garminBlockColor(block.order) }}>
      <header>
        <div>
          <h4>Bloque {block.order}</h4>
          <p>{formatGarminBlockMeta(block)}</p>
        </div>
        {duration != null && <strong>{formatDurationClock(duration)}</strong>}
      </header>
      {metrics.length > 0 && (
        <div className="garminBlockMetrics">
          {metrics.map(([label, value]) => (
            <div key={label}><span>{label}</span><b>{value}</b></div>
          ))}
        </div>
      )}
      <ZoneStrip zones={block.zones} />
      {block.association_status && (
        <footer>
          <span>Asociación conversacional</span>
          <b>{block.association_status}</b>
        </footer>
      )}
    </article>
  );
}

function ZoneStrip({ zones = [] }) {
  const displayZones = zones.filter((zone) => optionalNumber(zone.seconds) != null);
  const trackZones = displayZones.filter((zone) => optionalNumber(zone.percent) > 0);
  if (!displayZones.length || !trackZones.length) return null;
  return (
    <div className="zoneStrip">
      <span>Zonas FC</span>
      <div className="zoneStripTrack">
        {trackZones.map((zone) => (
          <i
            key={zone.key || zone.label}
            style={{ width: `${Math.max(0, zone.percent || 0)}%`, flexBasis: `${Math.max(0, zone.percent || 0)}%`, background: zone.color }}
            title={`${zone.label} ${formatDurationClock(zone.seconds || 0)} (${zone.percent || 0}%)`}
          />
        ))}
      </div>
      <div className="zoneStripLabels">
        {displayZones.map((zone) => (
          <small key={zone.key || zone.label}>{zone.shortLabel || zone.label} {formatDurationClock(zone.seconds || 0)} · {zone.percent || 0}%</small>
        ))}
      </div>
    </div>
  );
}

function CoachLogCard({ detail }) {
  const blocks = detail.hasConversationBlocks ? detail.blocks : [];
  return (
    <article className="activityMainCard coachLogCard">
      <div className="cardTitleWithIcon">
        <MessageSquareText size={28} />
        <div>
          <h2>Registro del coach</h2>
          <p>Información registrada desde el chat</p>
        </div>
      </div>
      {blocks.length ? <CoachBlockTable blocks={blocks} /> : <div className="softEmpty">Sin bloques coach registrados.</div>}
    </article>
  );
}

function CoachBlockTable({ blocks }) {
  const columns = [
    {
      key: "block",
      label: "Bloque",
      track: "78px",
      render: (block) => <span><i />{block.orderText}</span>,
    },
    {
      key: "type",
      label: "Tipo",
      track: "minmax(110px, 0.6fr)",
      visible: blocks.some((block) => hasDisplayValue(block.typeLabel)),
      render: (block) => <b>{block.typeLabel}</b>,
    },
    {
      key: "execution",
      label: "Ejecución",
      track: "minmax(140px, 0.8fr)",
      visible: blocks.some((block) => hasDisplayValue(block.executionText)),
      render: (block) => <em>{block.executionText}</em>,
    },
    {
      key: "summary",
      label: "Resumen",
      track: "minmax(220px, 1.4fr)",
      visible: blocks.some((block) => hasDisplayValue(block.summaryText)),
      render: (block) => <strong>{block.summaryText}</strong>,
    },
  ].filter((column) => column.visible !== false);
  const gridTemplateColumns = columns.map((column) => column.track).join(" ");
  return (
    <div className="coachBlockTable">
      <div className="coachBlockHeader" style={{ gridTemplateColumns }}>
        {columns.map((column) => <span key={column.key}>{column.label}</span>)}
      </div>
      {blocks.map((block, index) => (
        <div className="coachBlockRow" key={block.id || block.orderText} style={{ "--block": garminBlockColor(index + 1), gridTemplateColumns }}>
          {columns.map((column) => (
            <React.Fragment key={column.key}>
              {hasDisplayValue(column.key === "block" ? block.orderText : block[`${column.key}Text`] ?? block[`${column.key}Label`])
                ? column.render(block)
                : <span aria-hidden="true" />}
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

function ActivityTrainingEffectCard({ detail }) {
  const aerobicValue = optionalNumber(detail.session?.training_effect_aerobic);
  const anaerobicValue = optionalNumber(detail.session?.training_effect_anaerobic);
  const effectSections = [
    aerobicValue == null ? null : { label: "Aeróbico", value: aerobicValue, type: "aerobic" },
    anaerobicValue == null ? null : { label: "Anaeróbico", value: anaerobicValue, type: "anaerobic" },
  ].filter(Boolean);
  if (!effectSections.length) return null;
  const benefit = detail.session?.benefit || benefitFromTrainingEffect({ aerobic: aerobicValue, anaerobic: anaerobicValue });
  return (
    <article className="activityMainCard trainingEffectDetailCard">
      <div className="cardTitleWithIcon">
        <Target size={29} />
        <div>
          <h2>Training Effect</h2>
        </div>
      </div>
      <div className="trainingEffectDetailGrid">
        {effectSections.map((item) => (
          <section key={item.type}>
            <strong>{item.value.toFixed(1)}</strong>
            <span>{item.label}</span>
            <TrainingEffectGarminScale label="" value={item.value} type={item.type} />
          </section>
        ))}
        <aside>
          <span>Beneficio principal</span>
          <b><HeartPulse size={24} />{benefit}</b>
        </aside>
      </div>
    </article>
  );
}

function ActivitiesOverview({ sessions, plannedSessions = [], setRoute, setDiscipline, onOpenSession, onOpenPlannedSession }) {
  const typedSessions = sessions.filter((session) => !isArchivedSession(session)).map(classifySession);
  const calendarItems = mergeExecutedAndPlannedForCalendar(typedSessions, plannedSessions);
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = dateKey(today);
  const [viewMode, setViewMode] = useState("week");
  const [periodDate, setPeriodDate] = useState(today);
  const [selectedDates, setSelectedDates] = useState([]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const typeOptions = buildActivityTypeFilterOptions(calendarItems);
  const filteredSessions = calendarItems.filter((item) => matchesActivityFilters(item, sourceFilter, typeFilter));
  const period = buildActivityPeriod(viewMode, periodDate);
  const periodSessions = filteredSessions.filter((item) => isDateWithinPeriod(sessionDateKey(item), period));
  const visibleSessions = periodSessions
    .filter((item) => !selectedDates.length || selectedDates.includes(sessionDateKey(item)))
    .sort(sortSessionsChronological);
  const periodSummary = summarizeActivityPeriod(visibleSessions.filter((item) => item.kind !== "planned"), selectedDates.length || period.dayCount);
  const dayFilterLabel = formatActivityDayFilterLabel(viewMode, period, selectedDates);

  const openDetail = (item) => {
    if (resolveCalendarItemRoute(item) === "plannedSessionDetail") {
      if (onOpenPlannedSession) onOpenPlannedSession(item);
      else setRoute("plannedSessionDetail");
      return;
    }
    if (item.activityType === "hybrid") setDiscipline("hyrox");
    if (item.activityType === "strength") setDiscipline("crossfit");
    if (item.activityType === "run") setDiscipline("trail");
    if (onOpenSession) onOpenSession(item);
    else setRoute("activityDetail");
  };

  const movePeriod = (direction) => {
    const next = shiftActivityPeriod(periodDate, viewMode, direction);
    setPeriodDate(next);
    setSelectedDates([]);
  };

  const goToday = () => {
    const next = startOfDay(new Date());
    setPeriodDate(next);
    setSelectedDates([]);
  };

  const changeViewMode = (nextMode) => {
    setViewMode(nextMode);
    setSelectedDates([]);
  };

  const toggleDateFilter = (key) => {
    setSelectedDates((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key].sort());
  };

  return (
    <section className="activitiesOverview viewStack">
      <section className="activitiesHero">
        <div>
          <span>ACTIVIDADES</span>
          <h2>Historial y planificación</h2>
          <p>Sesiones ejecutadas y planificadas agrupadas por día, con detalle separado para cada tipo.</p>
        </div>
      </section>

      <section className="activityTimeControlCard">
        <ActivityViewSwitch value={viewMode} onChange={changeViewMode} />
        <div className="activityPeriodNav">
          <button type="button" className="periodArrow" onClick={() => movePeriod(-1)} aria-label="Periodo anterior">
            <ChevronRight size={18} />
          </button>
          <div>
            <span>{activityViewLabel(viewMode)}</span>
            <strong>{formatActivityPeriodTitle(viewMode, period)}</strong>
          </div>
          <button type="button" className="todayButton" onClick={goToday}>Hoy</button>
          <button type="button" className="periodArrow next" onClick={() => movePeriod(1)} aria-label="Periodo siguiente">
            <ChevronRight size={18} />
          </button>
        </div>

        <ActivityPeriodSummary summary={periodSummary} />

        <ActivityFilterChips
          sourceFilter={sourceFilter}
          typeFilter={typeFilter}
          typeOptions={typeOptions}
          onSourceChange={setSourceFilter}
          onTypeChange={setTypeFilter}
        />

        {viewMode === "week" && (
          <ActivityWeekStrip
            days={buildActivityWeekForPeriod(period.start, filteredSessions)}
            selectedDates={selectedDates}
            todayKey={todayKey}
            onSelect={toggleDateFilter}
          />
        )}

        {viewMode === "month" && (
          <ActivityMonthGrid
            days={buildActivityMonthGrid(period.start, filteredSessions)}
            selectedDates={selectedDates}
            todayKey={todayKey}
            onSelect={toggleDateFilter}
          />
        )}

      </section>

      <section className="activityListPanel">
        <div className="selectedDayHeader">
          <div>
            <span>{dayFilterLabel.eyebrow}</span>
            <h3>{dayFilterLabel.title}</h3>
          </div>
          <small>{formatSessionCount(visibleSessions.length)}</small>
        </div>
        <ActivitySelectedDayFilters dates={selectedDates} onRemove={toggleDateFilter} />
        <div className="activityList">
          {visibleSessions.map((item) => (
            <ActivityHistoryCard key={item.id} item={item} onOpen={() => openDetail(item)} />
          ))}
        </div>
        {!visibleSessions.length && (
          <p className="emptyText">{selectedDates.length ? "No hay sesiones para los días seleccionados." : "No hay sesiones registradas en este periodo."}</p>
        )}
      </section>
    </section>
  );
}

function ActivityViewSwitch({ value, onChange }) {
  const options = [
    ["week", "Semana"],
    ["month", "Mes"],
  ];
  return (
    <div className="activityViewSwitch" role="tablist" aria-label="Vista temporal">
      {options.map(([id, label]) => (
        <button key={id} type="button" className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ActivityPeriodSummary({ summary }) {
  const cards = [
    { label: "Tiempo total", value: formatDurationLong(summary.totalSeconds), icon: Clock3 },
    { label: "Media diaria", value: formatDurationLong(summary.averageSeconds), icon: CircleGauge },
    { label: "Sesiones", value: summary.sessions, icon: Activity },
    { label: "Días activos", value: `${summary.activeDays}/${summary.dayCount}`, icon: CalendarDays },
  ];
  return (
    <div className="activityPeriodSummary" aria-label="Resumen del periodo">
      {cards.map((item) => {
        const Icon = item.icon;
        return (
          <section key={item.label}>
            <Icon size={18} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </section>
        );
      })}
    </div>
  );
}

function ActivityFilterChips({ sourceFilter, typeFilter, typeOptions, onSourceChange, onTypeChange }) {
  const sourceOptions = [
    ["all", "Todo"],
    ["garmin", "Garmin/FIT"],
    ["coach", "Coach"],
    ["mixed", "Mixto"],
    ["planned", "Planificadas"],
  ];
  return (
    <div className="activityFilterStack">
      <ActivityChipRow options={sourceOptions} value={sourceFilter} onChange={onSourceChange} />
      <ActivityChipRow options={[["all", "Todos"], ...typeOptions]} value={typeFilter} onChange={onTypeChange} />
    </div>
  );
}

function ActivityChipRow({ options, value, onChange }) {
  return (
    <div className="activityChipRow">
      {options.map(([id, label]) => (
        <button key={id} type="button" className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ActivityWeekStrip({ days, selectedDates, todayKey, onSelect }) {
  return (
    <div className="activityWeekStrip" aria-label="Selector semanal">
      {days.map((day) => {
        const key = dateKey(day.date);
        const count = day.items.length;
        const isToday = key === todayKey;
        const isSelected = selectedDates.includes(key);
        return (
          <button
            key={key}
            type="button"
            className={`${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${count ? "hasItems" : ""}`}
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
          >
            <span>{day.label}</span>
            <strong>{day.date.getDate()}</strong>
            <small>{formatSessionCount(count)}</small>
            {isToday && <em>Hoy</em>}
            <i aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function ActivityMonthGrid({ days, selectedDates, todayKey, onSelect }) {
  return (
    <div className="activityMonthGrid" aria-label="Vista mensual">
      {["L", "M", "X", "J", "V", "S", "D"].map((day) => <span key={day}>{day}</span>)}
      {days.map((day) => {
        if (!day.date) return <i key={day.key} aria-hidden="true" />;
        const key = dateKey(day.date);
        const count = day.items.length;
        const isSelected = selectedDates.includes(key);
        return (
          <button
            key={key}
            type="button"
            className={`${isSelected ? "selected" : ""} ${key === todayKey ? "today" : ""} ${count ? "hasItems" : ""}`}
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
          >
            <strong>{day.date.getDate()}</strong>
            {count > 0 && <small>{count}</small>}
          </button>
        );
      })}
    </div>
  );
}

function ActivitySelectedDayFilters({ dates, onRemove }) {
  if (!dates.length) return null;
  return (
    <div className="selectedDayChips" aria-label="Filtros de día activos">
      {dates.map((key) => (
        <button key={key} type="button" onClick={() => onRemove(key)} aria-label={`Quitar filtro ${formatCompactDayLabel(key)}`}>
          <span>{formatCompactDayLabel(key)}</span>
          <b aria-hidden="true">x</b>
        </button>
      ))}
    </div>
  );
}

function ActivityHistoryCard({ item, onOpen }) {
  if (item.kind === "planned_completed") return <PlannedCompletedActivityHistoryCard item={item} onOpen={onOpen} />;
  if (item.kind === "planned") return <PlannedActivityHistoryCard item={item} onOpen={onOpen} />;
  const type = activityTypes[item.activityType] || activityTypes.hybrid;
  const status = readableSessionStatus(item.session_status);
  return (
    <button className="activityHistoryCard" onClick={onOpen} style={{ "--type": type.color }}>
      <div className="activityBadge">
        <Activity size={18} />
      </div>
      <div className="activityHistoryMain">
        <strong>{item.title}</strong>
        <span>{activityTrainingSubtitle(item.activityType)}</span>
        <em>{[formatActivityTime(item), status].filter(Boolean).join(" · ")}</em>
        <div className="activityMetrics">
          <ActivityMetric icon={ClockIcon} label={formatDurationClock(item.duration_seconds || item.durationSeconds || 0)} />
          {item.distance_meters > 0 && <ActivityMetric icon={MapDistanceIcon} label={`${(item.distance_meters / 1000).toFixed(1)} km`} />}
          {item.avg_hr && <ActivityMetric icon={HeartPulse} label={`${Math.round(item.avg_hr)} ppm`} />}
          {item.max_hr && <ActivityMetric icon={Gauge} label={`${Math.round(item.max_hr)} max`} />}
          {item.calories_total && <ActivityMetric icon={Flame} label={`${Math.round(item.calories_total)} kcal`} />}
        </div>
      </div>
      <div className="activityFlags">
        <span>FIT</span>
        {item.garmin_sets_total ? <span>{item.garmin_sets_total} series</span> : null}
        {item.has_conversation ? <span>coach</span> : null}
        <ChevronRight size={16} />
      </div>
    </button>
  );
}

function PlannedCompletedActivityHistoryCard({ item, onOpen }) {
  const type = activityTypes[item.activityType] || activityTypes.hybrid;
  const metricItems = linkedActivityMetricItems(item);
  return (
    <button className="activityHistoryCard plannedCompletedActivityHistoryCard" onClick={onOpen} style={{ "--type": type.color }}>
      <div className="activityBadge plannedActivityBadge">
        <CheckCircle2 size={18} />
      </div>
      <div className="activityHistoryMain">
        <strong>{item.displayTitle || item.title}</strong>
        <span>{[item.statusLabel || "Completada", item.displaySource].filter(Boolean).join(" · ")}</span>
        <div className="activityMetrics">
          {metricItems.map((metric) => (
            <ActivityMetric key={metric.label} icon={metric.icon} label={metric.label} />
          ))}
        </div>
        {item.garminTitle && <em>Garmin: {item.garminTitle}</em>}
      </div>
      <div className="activityFlags plannedActivityFlags">
        <span>Plan</span>
        <span>{item.displaySource || "FIT"}</span>
        <ChevronRight size={16} />
      </div>
    </button>
  );
}

function linkedActivityMetricItems(item = {}) {
  const duration = optionalNumber(item.duration_seconds ?? item.durationSeconds);
  const avgHr = optionalNumber(item.avg_hr);
  const maxHr = optionalNumber(item.max_hr);
  const calories = optionalNumber(item.calories_total);
  return [
    duration && duration > 0 ? { icon: ClockIcon, label: formatDurationClock(duration) } : null,
    avgHr ? { icon: HeartPulse, label: `${Math.round(avgHr)} ppm` } : null,
    maxHr ? { icon: Gauge, label: `${Math.round(maxHr)} max` } : null,
    calories ? { icon: Flame, label: `${Math.round(calories)} kcal` } : null,
  ].filter(Boolean);
}

function PlannedActivityHistoryCard({ item, onOpen }) {
  const type = activityTypes[item.activityType] || activityTypes.hybrid;
  const detailLine = [
    item.intensityLabel,
    item.plannedDurationLabel,
    item.restrictions?.[0],
  ].filter(Boolean).join(" · ");

  return (
    <button className="activityHistoryCard plannedActivityHistoryCard" onClick={onOpen} style={{ "--type": type.color }}>
      <div className="activityBadge plannedActivityBadge">
        <ClipboardList size={18} />
      </div>
      <div className="activityHistoryMain">
        <strong>{item.title}</strong>
        <span>{item.typeLabel}</span>
        <em>{[formatActivityTime(item), item.statusLabel].filter(Boolean).join(" · ")}</em>
        {detailLine && <p>{detailLine}</p>}
        <div className="activityMetrics plannedActivityChips">
          {item.chips.map((chip) => (
            <ActivityMetric key={chip} icon={CalendarDays} label={chip} />
          ))}
        </div>
      </div>
      <div className="activityFlags plannedActivityFlags">
        <span>Plan</span>
        {item.blocksCount ? <span>{item.blocksCount} bloques</span> : null}
        <ChevronRight size={16} />
      </div>
    </button>
  );
}

function ActivityMetric({ icon: Icon, label }) {
  return (
    <span>
      <Icon size={13} />
      {label}
    </span>
  );
}

function ClockIcon(props) {
  return <CalendarDays {...props} />;
}

function MapDistanceIcon(props) {
  return <ArrowUpRight {...props} />;
}

function StackedWeekBars({ week }) {
  const maxSeconds = Math.max(...week.map((day) => day.totalSeconds), 1);
  return (
    <div className="stackedWeek">
      {week.map((day) => (
        <div key={day.label} className="weekDay">
          <div className="stackTrack">
            {day.items.map((item, index) => (
              <i
                key={`${item.id}-${index}`}
                style={{
                  height: `${Math.max(8, (Number(item.duration_seconds || item.durationSeconds || 0) / maxSeconds) * 100)}%`,
                  background: activityTypes[item.activityType].color,
                }}
              />
            ))}
          </div>
          <span>{day.label}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityElements({ detail }) {
  const cards = activityCardMetadata.filter((card) => !(card.hiddenWhenTimeline && detail.samples?.length));
  return (
    <section className="activityElements">
      {cards.map((card) => (
        <ActivitySmartElement key={card.id} card={card} detail={detail} />
      ))}
    </section>
  );
}

function ActivitySmartElement({ card, detail }) {
  if (card.type === "exerciseTable") {
    return (
      <ExerciseTableCard
        title={card.title}
        blocks={detail.hasConversationBlocks ? detail.blocks : []}
        exercises={detail.exercises}
      />
    );
  }
  if (card.type === "keyValue") return <KeyValueCard card={card} detail={detail} />;
  if (card.type === "timeline") return <TimelineCard card={card} detail={detail} />;
  if (card.type === "zones") return <HeartRateZonesCard title={card.title} zones={detail.zones} />;
  if (card.type === "trainingEffect") return <TrainingEffectCard card={card} detail={detail} />;
  return null;
}

function GarminObjectiveSection({ detail }) {
  const session = detail.session || {};
  const series = detail.garminSeries || [];
  return (
    <article className="activityElementCard wide">
      <PanelTitle label="Garmin/FIT" title="Datos Garmin" />
      <div className="blockMetricCards">
        <MetricListCard
          title="Tiempo y carga"
          items={[
            { label: "Tiempo total", value: formatOptionalDuration(session.duration_seconds) },
            { label: "Tiempo de trabajo", value: formatOptionalDuration(session.active_seconds) },
            { label: "Tiempo de descanso", value: formatOptionalDuration(session.rest_seconds) },
            { label: "Calorías", value: session.calories_total == null ? "N/D" : `${session.calories_total} kcal` },
          ]}
        />
        <MetricListCard
          title="Fisiología"
          items={[
            { label: "FC media", value: session.avg_hr == null ? "N/D" : `${session.avg_hr} ppm` },
            { label: "FC máxima", value: session.max_hr == null ? "N/D" : `${session.max_hr} ppm` },
            { label: "Training Effect aeróbico", value: session.training_effect_aerobic ?? "N/D" },
            { label: "Training Effect anaeróbico", value: session.training_effect_anaerobic ?? "N/D" },
          ]}
        />
        <MetricListCard
          title="Fuerza Garmin"
          items={[
            { label: "Series Garmin", value: session.garmin_sets_total ?? "N/D" },
            { label: "Repeticiones Garmin", value: session.garmin_reps_total ?? "N/D" },
            { label: "Carga de ejercicio", value: session.exercise_load ?? "N/D" },
            { label: "Fuente", value: detail.summary?.fit_identity?.external_reference || "Garmin/FIT" },
          ]}
        />
      </div>
      <GarminSeriesTable series={series} />
    </article>
  );
}

function GarminSeriesTable({ series = [] }) {
  if (!series.length) {
    return (
      <div className="blockReconciliationWarning">
        Series Garmin no importadas todavía: el FIT actual conserva records/samples y métricas globales, pero no expone sets/laps mapeables en la base de datos.
      </div>
    );
  }
  return (
    <>
      <PanelTitle label="Garmin/FIT" title="Series Garmin" />
      <div className="garminSeriesTable" role="table" aria-label="Series Garmin">
        <div className="garminSeriesHeader" role="row">
          {["Serie", "Ejercicio Garmin", "Tiempo", "Descanso", "Rep.", "Peso", "FC media", "FC máx."].map((column) => (
            <span key={column} role="columnheader">{column}</span>
          ))}
        </div>
        {series.map((item) => (
          <div className="garminSeriesRow" role="row" key={item.id || item.order}>
            <span>{item.order}</span>
            <strong>{item.name || "N/D"}</strong>
            <span>{formatOptionalDuration(item.active_seconds ?? item.duration_seconds)}</span>
            <span>{formatOptionalDuration(item.rest_seconds)}</span>
            <span>{item.repetitions ?? "N/D"}</span>
            <span>{item.load_label || "N/D"}</span>
            <span>{item.heart_rate_avg_bpm == null ? "N/D" : item.heart_rate_avg_bpm}</span>
            <span>{item.heart_rate_max_bpm == null ? "N/D" : item.heart_rate_max_bpm}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ExerciseTableCard({ title, blocks = [], exercises = [] }) {
  const hasBlocks = blocks.length > 0;
  const hasExercises = exercises.length > 0;

  return (
    <article className="activityElementCard wide">
      <PanelTitle label="Conversacional / coach" title={hasBlocks ? "Bloques coach" : title} />
      {hasBlocks ? (
        <BlockSummaryTable blocks={blocks} />
      ) : !hasExercises ? (
        <div className="blockReconciliationWarning">Sin bloques coach/conversacionales registrados.</div>
      ) : (
        <>
          <div className="blockReconciliationWarning">Sin bloques coach/conversacionales registrados.</div>
          <ExerciseFlatTable exercises={exercises} />
        </>
      )}
    </article>
  );
}

function BlockSummaryTable({ blocks }) {
  const warnings = [...new Set(blocks.map((block) => block.warningText).filter(Boolean))];

  return (
    <>
      {warnings.map((warning) => (
        <div className="blockReconciliationWarning" key={warning}>{warning}</div>
      ))}
      <div className="blockSummaryTable" role="table" aria-label="Resumen por bloques">
        <div className="blockSummaryHeader" role="row">
          {["Bloque", "Tipo", "Ejecución", "Resumen"].map((column) => (
            <span key={column} role="columnheader">{column}</span>
          ))}
        </div>
        {blocks.map((block) => (
          <ConversationBlockRow key={block.id || block.block_order} block={block} />
        ))}
      </div>
    </>
  );
}

function ConversationBlockRow({ block }) {
  return (
    <details className="blockSummaryRow">
      <summary>
        <span>{block.orderText}</span>
        <span>{block.typeLabel}</span>
        <span>{block.executionText}</span>
        <strong>{block.summaryText}</strong>
      </summary>
      <div className="blockExpandedDetail">
        <header>
          <div>
            <span>{block.orderText} · {block.typeLabel}</span>
            <h4>{block.name}</h4>
          </div>
        </header>
        {block.warningText && <p className="blockWarningText">{block.warningText}</p>}
        <div className="blockDetailGrid">
          <section>
            <span>Sensaciones / coach</span>
            <p>{block.sensationText}</p>
          </section>
        </div>
        <div className="blockExerciseDetailList">
          {block.exerciseDetails.map((exercise, index) => (
            <div key={`${exercise.name}-${index}`}>
              <strong>{exercise.name}</strong>
              <span>{exercise.detailText}</span>
              {exercise.notes && <em>{exercise.notes}</em>}
            </div>
          ))}
        </div>
        {block.temporalReconciled && (
          <div className="blockMetricCards">
            <MetricListCard
              title="Tiempo reconciliado"
              items={[
                { label: "Tiempo total", value: block.temporal.tiempo },
                { label: "Tiempo de trabajo", value: block.temporal.activo },
                { label: "Tiempo de descanso", value: block.temporal.descanso },
              ]}
            />
            <MetricListCard
              title="FC reconciliada"
              items={[
                { label: "Frecuencia cardíaca media", value: block.temporal.fcMedia === "N/D" ? "N/D" : `${block.temporal.fcMedia} ppm` },
                { label: "Frecuencia cardíaca máxima", value: block.temporal.fcMax === "N/D" ? "N/D" : `${block.temporal.fcMax} ppm` },
              ]}
            />
          </div>
        )}
        <details className="blockDebugDetails">
          <summary>Detalle avanzado</summary>
          <p>{block.sourceText}</p>
        </details>
      </div>
    </details>
  );
}

function MetricListCard({ title, items, variant = "embedded" }) {
  const Tag = variant === "global" ? "article" : "section";
  return (
    <Tag className={`metricListCard ${variant === "global" ? "activityElementCard" : ""}`}>
      <h5>{title}</h5>
      <div>
        {items.map((item) => (
          <InfoRow key={item.label} label={item.label} value={safeValue(item.value)} />
        ))}
      </div>
    </Tag>
  );
}

function ExerciseFlatTable({ exercises }) {
  return (
    <div className="exerciseTable">
      <div className="exerciseHeader">
        <span>Serie</span>
        <span>Nombre</span>
        <span>Tiempo</span>
        <span>Rep.</span>
        <span>Peso</span>
      </div>
      {exercises.map((exercise, index) => (
        <ExerciseFlatRow key={`${exercise.set}-${index}`} exercise={exercise} />
      ))}
    </div>
  );
}

function ExerciseFlatRow({ exercise }) {
  return (
    <div className="exerciseRow">
      <span>{exercise.set}</span>
      <strong>{exercise.name}</strong>
      <span>{exercise.active_seconds ? formatDurationClock(exercise.active_seconds) : "N/D"}</span>
      <span>{exercise.reps}</span>
      <span>{exercise.weight}</span>
      {exercise.rest_seconds > 0 && (
        <>
          <span />
          <em>Descanso</em>
          <em>{formatDurationClock(exercise.rest_seconds)}</em>
          <span />
          <span />
        </>
      )}
    </div>
  );
}

function KeyValueCard({ card, detail }) {
  return (
    <MetricListCard
      title={card.title}
      variant="global"
      items={card.fields.map((field) => ({
        label: field.label,
        value: formatField(getPath(detail, field.path), field),
      }))}
    />
  );
}

function TrainingEffectCard({ card, detail }) {
  const aerobicValue = optionalNumber(getPath(detail, "session.training_effect_aerobic"));
  const anaerobicValue = optionalNumber(getPath(detail, "session.training_effect_anaerobic"));
  const aerobic = aerobicValue ?? 0;
  const anaerobic = anaerobicValue ?? 0;
  return (
    <article className="activityElementCard">
      <PanelTitle title={card.title} />
      <div className="trainingEffectSummary">
        <div><strong>{aerobicValue == null ? "N/D" : aerobicValue.toFixed(1)}</strong><span>Aeróbica</span></div>
        <div><strong>{anaerobicValue == null ? "N/D" : anaerobicValue.toFixed(1)}</strong><span>Anaeróbico</span></div>
      </div>
      <TrainingEffectGarminScale label="Aeróbica" value={aerobic} type="aerobic" />
      <TrainingEffectGarminScale label="Anaeróbico" value={anaerobic} type="anaerobic" />
      <div className="kvList compact">
        {card.fields.map((field) => (
          <InfoRow key={field.label} label={field.label} value={formatField(getPath(detail, field.path), field)} />
        ))}
      </div>
    </article>
  );
}

function TimelineCard({ card, detail }) {
  const [mode, setMode] = useState("classic");
  const values = detail.samples.map((sample) => Number(sample[card.sampleKey] || 0)).filter(Boolean);
  const avgValue = optionalNumber(detail.session?.avg_hr) ?? (values.length ? average(values) : null);
  const maxValue = optionalNumber(detail.session?.max_hr) ?? (values.length ? Math.max(...values) : null);
  const avg = avgValue == null ? null : Math.round(avgValue);
  const max = maxValue == null ? null : Math.round(maxValue);
  const durationSeconds = Number(detail.session?.duration_seconds || Math.max(...detail.samples.map((sample) => Number(sample.elapsed_seconds || 0)), 0));
  const hasBlocks = detail.blocks?.some((block) => block.temporalWindow?.start != null && block.temporalWindow?.end != null);
  const chartZones = zonesHaveThresholds(detail.zones) ? detail.zones : [];
  const modes = [
    { id: "classic", label: "Clásica" },
    { id: "zones", label: "Zonas", disabled: !detail.samples?.length || !chartZones.length },
    { id: "blocks", label: "Bloques", disabled: !hasBlocks },
  ];
  return (
    <article className="activityElementCard wide">
      <div className="timelineHeader">
        <PanelTitle title={card.title} />
        <div className="chartModeToggle" role="group" aria-label="Modo de color de frecuencia cardíaca">
          {modes.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? "active" : ""}
              disabled={item.disabled}
              onClick={() => setMode(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="timelineStats">
        <div><strong>{avg == null ? "N/D" : avg}</strong><span>{card.unit} Media</span></div>
        <div><strong>{max == null ? "N/D" : max}</strong><span>{card.unit} Máximo</span></div>
      </div>
      {card.sampleKey === "heart_rate_bpm" ? (
        <HeartRateGarminLikeChart
          samples={detail.samples}
          avgHr={avg ?? 0}
          maxHr={max ?? 0}
          durationSeconds={durationSeconds}
          mode={mode}
          zones={chartZones}
          blocks={detail.blocks}
        />
      ) : (
        <AreaTimeline samples={detail.samples} sampleKey={card.sampleKey} />
      )}
    </article>
  );
}

function HeartRateZonesCard({ title, zones: reportedZones }) {
  const zones = zonesHaveThresholds(reportedZones) ? reportedZones : [];
  return (
    <article className="activityElementCard wide">
      <PanelTitle title={title} />
      {zones.length ? (
        <div className="zoneList">
          {zones.map((zone) => (
            <div key={zone.label} className="zoneRow">
              <div className="zoneRowTop">
                <div>
                  <strong>{zone.label}</strong>
                  <span>{zone.range} · {zone.name}</span>
                </div>
                <b>{formatDurationClock(zone.seconds)} · {zone.percent}%</b>
              </div>
              <i><b style={{ width: `${zone.percent}%`, background: zone.color }} /></i>
            </div>
          ))}
        </div>
      ) : (
        <div className="blockReconciliationWarning">Zonas de FC no disponibles.</div>
      )}
    </article>
  );
}

function AreaTimeline({ samples, sampleKey }) {
  const values = samples.map((sample) => Number(sample[sampleKey] || 0)).filter(Boolean);
  const min = Math.min(...values, 70);
  const max = Math.max(...values, 170);
  return (
    <div className="areaTimeline">
      {samples.slice(0, 120).map((sample, index) => {
        const value = Number(sample[sampleKey] || min);
        const height = ((value - min) / Math.max(1, max - min)) * 100;
        return <i key={index} style={{ height: `${Math.max(6, height)}%` }} />;
      })}
      <em />
    </div>
  );
}

function HeartRateGarminLikeChart({ samples, avgHr, durationSeconds, mode = "classic", zones = [], blocks = [], height = 285 }) {
  const width = 920;
  const padding = { top: 20, right: 30, bottom: 54, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const prepared = buildHeartRateSegments(samples);
  const { yMin, yMax, ticks: yTicks } = getHrDomain(prepared.validValues);
  const xTicks = getTimeTicks(durationSeconds);
  const avg = Number(avgHr || average(prepared.validValues) || 0);
  const xScale = (seconds) => padding.left + (Number(seconds || 0) / Math.max(1, durationSeconds)) * plotWidth;
  const yScale = (hr) => padding.top + (1 - (Number(hr || yMin) - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
  const baselineY = yScale(yMin);
  const segments = prepared.segments.flatMap((segment) => splitHeartRateSegmentByMode(segment, mode, zones, blocks)).map((segment) => {
    const top = segment.map((point) => `${xScale(point.elapsed_seconds).toFixed(2)},${yScale(point.heart_rate_bpm).toFixed(2)}`).join(" ");
    const first = segment[0];
    const last = segment[segment.length - 1];
    return {
      id: `${first.elapsed_seconds}-${last.elapsed_seconds}`,
      line: top,
      area: `${xScale(first.elapsed_seconds).toFixed(2)},${baselineY.toFixed(2)} ${top} ${xScale(last.elapsed_seconds).toFixed(2)},${baselineY.toFixed(2)}`,
      color: segment.color || "#f23a43",
    };
  });

  return (
    <div className="garminHrChart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de frecuencia cardíaca Garmin-like">
        <rect x="0" y="0" width={width} height={height} />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="hrGridLine" x1={padding.left} x2={width - padding.right} y1={yScale(tick)} y2={yScale(tick)} />
            <text className="hrAxisText" x={padding.left - 10} y={yScale(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={tick}>
            <circle className="hrTickDot" cx={xScale(tick)} cy={baselineY + 16} r="3" />
            <text className="hrAxisText" x={xScale(tick)} y={height - 18} textAnchor="middle">{formatElapsedTime(tick)}</text>
          </g>
        ))}
        {segments.map((segment) => (
          <polygon key={`${segment.id}-area`} className="hrArea" points={segment.area} style={{ fill: segment.color }} />
        ))}
        {segments.map((segment) => (
          <polyline key={`${segment.id}-line`} className="hrLine" points={segment.line} style={{ stroke: segment.color }} />
        ))}
        {avg > 0 && (
          <line className="hrAverageLine" x1={padding.left} x2={width - padding.right} y1={yScale(avg)} y2={yScale(avg)} />
        )}
      </svg>
    </div>
  );
}

function TrainingEffectGarminScale({ label, value, max = 5, type }) {
  const marker = Math.min(100, Math.max(0, (Number(value || 0) / max) * 100));
  const markerColor = trainingEffectMarkerColor(Number(value || 0));
  const segments = [
    { className: "teGrey", flex: 18 },
    { className: "teGrey", flex: 20 },
    { className: "teBlue", flex: 20 },
    { className: "teGreen", flex: 20 },
    { className: "teOrange", flex: 20 },
    { className: "teRed", flex: 2 },
  ];

  return (
    <div className={`effectScale garminEffectScale ${type}`}>
      <span>{label}</span>
      <i>
        {segments.map((segment, index) => (
          <em key={`${segment.className}-${index}`} className={segment.className} style={{ flex: segment.flex }} />
        ))}
        <b style={{ left: `${marker}%`, "--marker-color": markerColor }} />
      </i>
    </div>
  );
}

function CoachView({ messages, setMessages, discipline, sessions }) {
  const [draft, setDraft] = useStoredState(storageKeys.coachDraft, "");
  const [micNotice, setMicNotice] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (overrideDraft) => {
    const text = (overrideDraft ?? draft).trim();
    if (!text || sending) return;
    const userMessage = { role: "user", content: text };
    const pendingAnswer = {
      role: "assistant",
      content: "Consultando tu contexto ENQIDU...",
    };
    const nextMessages = [...messages, userMessage, pendingAnswer];
    setMessages(nextMessages);
    setDraft("");
    localStorage.removeItem(storageKeys.coachDraft);

    try {
      setSending(true);
      const result = await requestCoachReply({
        message: text,
        mode: "today_coach",
      });
      const content = result.ok && result.answer
        ? result.answer
        : buildCoachFallbackReply(text, discipline, sessions, result.error);
      setMessages((current) => replaceLastAssistantMessage(current, content));
    } catch (error) {
      setMessages((current) => replaceLastAssistantMessage(
        current,
        buildCoachFallbackReply(text, discipline, sessions, error?.message),
      ));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="coachView">
      <div className="chatLog">
        {messages.map((message, index) => (
          <CopyableChatMessage
            key={`${message.role}-${index}`}
            message={message}
            onCopied={() => setMicNotice("Copiado")}
          />
        ))}
        <div ref={endRef} />
      </div>
      {micNotice && <p className="composerNotice">{micNotice}</p>}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={send}
        onMicNotice={setMicNotice}
        disabled={sending}
      />
    </section>
  );
}

function replaceLastAssistantMessage(messages, content) {
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.role === "assistant") {
      next[index] = { ...next[index], content };
      return next;
    }
  }
  return [...next, { role: "assistant", content }];
}

function CopyableChatMessage({ message, onCopied }) {
  const [copied, setCopied] = useState(false);
  const pressTimerRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const pressPointRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(feedbackTimerRef.current);
  }, []);

  const clearPressTimer = () => {
    clearTimeout(pressTimerRef.current);
    pressPointRef.current = null;
  };

  const copyMessage = async () => {
    clearPressTimer();
    const text = repairMojibakeText(message.content).trim();
    if (!text) return;
    const ok = await copyPlainText(text);
    if (!ok) return;
    setCopied(true);
    onCopied?.();
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setCopied(false), 1200);
  };

  const startPressTimer = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearPressTimer();
    pressPointRef.current = { x: event.clientX, y: event.clientY };
    pressTimerRef.current = setTimeout(copyMessage, 650);
  };

  const cancelCopyOnScroll = (event) => {
    const point = pressPointRef.current;
    if (!point) return;
    const moved = Math.hypot(event.clientX - point.x, event.clientY - point.y);
    if (moved > 10) clearPressTimer();
  };

  const copyFromContextMenu = (event) => {
    event.preventDefault();
    copyMessage();
  };

  return (
    <div
      className={`bubble ${message.role}`}
      onPointerDown={startPressTimer}
      onPointerMove={cancelCopyOnScroll}
      onPointerUp={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onPointerLeave={clearPressTimer}
      onContextMenu={copyFromContextMenu}
      title="Mantén pulsado para copiar"
    >
      {message.content}
      {copied && <small className="copyToast">Copiado</small>}
    </div>
  );
}

async function copyPlainText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary textarea below.
  }
  try {
    const node = document.createElement("textarea");
    node.value = text;
    node.setAttribute("readonly", "");
    node.style.position = "fixed";
    node.style.opacity = "0";
    document.body.appendChild(node);
    node.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(node);
    return copied;
  } catch {
    return false;
  }
}

function mergeDictationTranscript(current, addition) {
  const base = repairMojibakeText(current).replace(/\s+/g, " ").trim();
  const extra = repairMojibakeText(addition).replace(/\s+/g, " ").trim();
  if (!base) return extra;
  if (!extra) return base;

  const baseComparable = comparableDictationText(base);
  const extraComparable = comparableDictationText(extra);
  if (!extraComparable || baseComparable.endsWith(extraComparable)) return base;
  if (extraComparable.startsWith(baseComparable)) return extra;

  const baseWords = base.split(/\s+/);
  const extraWords = extra.split(/\s+/);
  const baseComparableWords = baseWords.map(comparableDictationText);
  const extraComparableWords = extraWords.map(comparableDictationText);
  const maxOverlap = Math.min(baseWords.length, extraWords.length, 32);

  for (let size = maxOverlap; size > 0; size -= 1) {
    const baseTail = baseComparableWords.slice(-size).join(" ");
    const extraHead = extraComparableWords.slice(0, size).join(" ");
    if (baseTail && baseTail === extraHead) {
      const tail = extraWords.slice(size).join(" ");
      return tail ? `${base} ${tail}` : base;
    }
  }

  return `${base} ${extra}`;
}

function dictationTranscriptDelta(previous, current) {
  const before = repairMojibakeText(previous).replace(/\s+/g, " ").trim();
  const now = repairMojibakeText(current).replace(/\s+/g, " ").trim();
  if (!now) return "";
  if (!before) return now;
  if (comparableDictationText(now) === comparableDictationText(before)) return "";

  const beforeWords = before.split(/\s+/);
  const nowWords = now.split(/\s+/);
  const beforeComparableWords = beforeWords.map(comparableDictationText);
  const nowComparableWords = nowWords.map(comparableDictationText);
  const maxOverlap = Math.min(beforeWords.length, nowWords.length, 64);

  for (let size = maxOverlap; size > 0; size -= 1) {
    const beforeTail = beforeComparableWords.slice(-size).join(" ");
    const nowHead = nowComparableWords.slice(0, size).join(" ");
    if (beforeTail && beforeTail === nowHead) {
      return nowWords.slice(size).join(" ");
    }
  }

  return now;
}

function isDuplicateSegment(next, previous) {
  if (!next || !previous) return false;
  const a = comparableDictationText(next);
  const b = comparableDictationText(previous);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 20 && b.includes(a)) return true;
  if (b.length > 20 && a.includes(b) && a.length - b.length < 8) return true;
  return false;
}

function dedupeConsecutiveDictationText(value) {
  const text = repairMojibakeText(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const chunks = text
    .split(/(?<=[.!?])\s+|\s{2,}/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length <= 1) return text;
  return chunks.reduce((parts, chunk) => {
    const previous = parts[parts.length - 1];
    if (!isDuplicateSegment(chunk, previous)) parts.push(chunk);
    return parts;
  }, []).join(" ");
}

function comparableDictationText(value) {
  return repairMojibakeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ChatComposer({ value, onChange, onSend, onMicNotice, disabled = false }) {
  const textareaRef = useRef(null);
  const dictation = useLongDictation({
    value,
    onChange,
    onNotice: onMicNotice,
  });
  const displayValue = dictation.interimTranscript
    ? [value.trim(), dictation.interimTranscript].filter(Boolean).join(value.trim() ? " " : "")
    : value;

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(180, Math.max(46, node.scrollHeight))}px`;
  }, [displayValue]);

  const submit = () => {
    if (disabled) return;
    const text = dictation.commitInterim();
    dictation.stop({ commitInterim: false });
    onSend(text);
  };

  return (
    <div className="coachComposer">
      <textarea
        ref={textareaRef}
        value={displayValue}
        onChange={(event) => {
          dictation.clearInterim();
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") submit();
        }}
        placeholder="Escribe o dicta tu actualización"
        rows={1}
        disabled={disabled}
      />
      <button
        type="button"
        className={`iconAction ${dictation.isListening ? "listening" : ""}`}
        onClick={dictation.isActive ? dictation.stop : dictation.start}
        aria-label={dictation.isActive ? "Detener dictado" : "Iniciar dictado"}
        title={dictation.isActive ? "Detener dictado" : "Dictar"}
      >
        {dictation.isActive ? <Pause size={20} /> : <Mic size={20} />}
      </button>
      <button type="button" className="sendAction" onClick={submit} aria-label="Enviar" disabled={disabled}>
        <Send size={20} />
      </button>
      {!dictation.supported && <small>Tu navegador no permite dictado continuo aquí.</small>}
    </div>
  );
}

function useLongDictation({ value, onChange, onNotice }) {
  const SpeechRecognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState(SpeechRecognition ? "idle" : "unsupported");
  const [permissionError, setPermissionError] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef(null);
  const activeRef = useRef(false);
  const listeningRef = useRef(false);
  const startingRef = useRef(false);
  const manualStopRef = useRef(false);
  const restartTimerRef = useRef(null);
  const restartDelayRef = useRef(450);
  const valueRef = useRef(value);
  const interimRef = useRef("");
  const lastFinalTranscriptRef = useRef("");

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => () => {
    activeRef.current = false;
    clearTimeout(restartTimerRef.current);
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
  }, []);

  const appendTranscript = (transcript) => {
    const text = repairMojibakeText(transcript).replace(/\s+/g, " ").trim();
    if (!text) return;
    if (isDuplicateSegment(text, lastFinalTranscriptRef.current)) return;
    const current = valueRef.current || "";
    const next = dedupeConsecutiveDictationText(mergeDictationTranscript(current, text));
    if (next === current) return;
    lastFinalTranscriptRef.current = text;
    valueRef.current = next;
    onChange(next);
    localStorage.setItem(storageKeys.coachDraft, JSON.stringify(next));
  };

  const appendRecognitionTranscript = (transcript) => {
    appendTranscript(transcript);
  };

  const commitInterim = () => {
    const text = interimRef.current;
    if (text) appendRecognitionTranscript(text);
    interimRef.current = "";
    setInterimTranscript("");
    const next = dedupeConsecutiveDictationText(valueRef.current || "");
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
      localStorage.setItem(storageKeys.coachDraft, JSON.stringify(next));
    }
    return next;
  };

  const isSecureMicrophoneContext = () => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(host);
  };

  const ensureRecognition = () => {
    if (!SpeechRecognition) {
      setStatus("unsupported");
      onNotice("Este navegador no soporta dictado continuo. Usa el dictado del teclado móvil o escribe el entrenamiento.");
      return null;
    }
    if (recognitionRef.current) return recognitionRef.current;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "es-ES";
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      startingRef.current = false;
      listeningRef.current = true;
      restartDelayRef.current = 450;
      setPermissionError("");
      setIsListening(true);
      setStatus("listening");
      onNotice("Escuchando. Puedes hablar durante varios minutos; enviarás cuando quieras.");
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = repairMojibakeText(result?.[0]?.transcript || "").replace(/\s+/g, " ").trim();
        if (!transcript) continue;
        if (result?.isFinal) appendTranscript(transcript);
        else interim = mergeDictationTranscript(interim, transcript);
      }
      interimRef.current = interim;
      setInterimTranscript(interim);
    };
    recognition.onerror = (event) => {
      startingRef.current = false;
      listeningRef.current = false;
      setIsListening(false);
      const error = event.error || "error";
      if (["not-allowed", "service-not-allowed"].includes(error)) {
        const message = "No se ha podido acceder al micrófono. Revisa permisos del navegador y vuelve a intentarlo.";
        activeRef.current = false;
        manualStopRef.current = true;
        setIsActive(false);
        setPermissionError(message);
        setStatus("permission");
        onNotice(message);
        return;
      }
      if (error === "audio-capture") {
        const message = "No se ha detectado un micrófono disponible. El texto ya dictado se conserva.";
        activeRef.current = false;
        manualStopRef.current = true;
        setIsActive(false);
        setPermissionError(message);
        setStatus("microphoneError");
        onNotice(message);
        return;
      }
      setStatus("reconnecting");
      if (error !== "no-speech") onNotice("El reconocimiento se ha interrumpido. Reintentando sin borrar el texto.");
    };
    recognition.onend = () => {
      startingRef.current = false;
      listeningRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
      if (!activeRef.current || manualStopRef.current) {
        setStatus(manualStopRef.current ? "stopped" : "paused");
        return;
      }
      setStatus("reconnecting");
      const delay = restartDelayRef.current;
      restartDelayRef.current = Math.min(3500, Math.round(delay * 1.35));
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (activeRef.current && !manualStopRef.current) startRecognition();
      }, delay);
    };
    recognitionRef.current = recognition;
    return recognition;
  };

  const startRecognition = () => {
    if (startingRef.current || listeningRef.current) return;
    if (!isSecureMicrophoneContext()) {
      const message = "El micrófono requiere HTTPS o localhost.";
      activeRef.current = false;
      setIsActive(false);
      setPermissionError(message);
      setStatus("secureContext");
      onNotice(message);
      return;
    }
    const recognition = ensureRecognition();
    if (!recognition) return;
    try {
      startingRef.current = true;
      recognition.start();
    } catch {
      startingRef.current = false;
      if (!activeRef.current || manualStopRef.current) return;
      setStatus("reconnecting");
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (activeRef.current && !manualStopRef.current) startRecognition();
      }, 900);
    }
  };

  const requestMicrophonePermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      const noDevice = ["NotFoundError", "DevicesNotFoundError"].includes(error?.name);
      const message = noDevice
        ? "No se ha detectado un micrófono disponible. El texto ya dictado se conserva."
        : "No se ha podido acceder al micrófono. Revisa permisos del navegador y vuelve a intentarlo.";
      activeRef.current = false;
      manualStopRef.current = true;
      setIsActive(false);
      setPermissionError(message);
      setStatus(noDevice ? "microphoneError" : "permission");
      onNotice(message);
      return false;
    }
  };

  const start = async () => {
    clearTimeout(restartTimerRef.current);
    setPermissionError("");
    if (!SpeechRecognition) {
      setStatus("unsupported");
      onNotice("Este navegador no soporta dictado continuo. Usa el dictado del teclado móvil o escribe el entrenamiento.");
      return;
    }
    if (!isSecureMicrophoneContext()) {
      const message = "El micrófono requiere HTTPS o localhost.";
      setPermissionError(message);
      setStatus("secureContext");
      onNotice(message);
      return;
    }
    activeRef.current = true;
    manualStopRef.current = false;
    restartDelayRef.current = 450;
    setIsActive(true);
    setStatus("reconnecting");
    const permissionGranted = await requestMicrophonePermission();
    if (!permissionGranted || !activeRef.current) return;
    startRecognition();
  };

  const stop = ({ commitInterim: shouldCommitInterim = true } = {}) => {
    if (shouldCommitInterim) commitInterim();
    manualStopRef.current = true;
    activeRef.current = false;
    setIsActive(false);
    setIsListening(false);
    setStatus("stopped");
    setInterimTranscript("");
    clearTimeout(restartTimerRef.current);
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // Recognition may already be stopped by the browser after onend/onerror.
    }
    onNotice("Dictado detenido. Puedes revisar, editar o enviar.");
  };

  const clearInterim = () => {
    interimRef.current = "";
    setInterimTranscript("");
  };

  const statusLabel = {
    idle: "Pausado",
    listening: "Escuchando",
    reconnecting: "Reconectando micro",
    paused: "Pausado",
    stopped: "Dictado detenido",
    permission: "Error de permisos",
    microphoneError: "Micrófono no disponible",
    secureContext: "HTTPS o localhost",
    unsupported: "Dictado continuo no soportado",
  }[status] || "Pausado";

  return {
    supported: Boolean(SpeechRecognition),
    isActive,
    isListening,
    permissionError,
    interimTranscript,
    statusLabel,
    start,
    stop,
    clearInterim,
    commitInterim,
  };
}

function ProfileView({ profile, setProfile, fitImports, setFitImports, session, authNotice, setAuthNotice, onSync, onImportedSession }) {
  return (
    <section className="viewStack profileView">
      <section className="profileCard accountCard">
        <div className="avatar">{profile.avatar}</div>
        <div>
          <span>Cuenta ENQIDU</span>
          <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
          <p>{session ? session.user.email : "Inicia sesión para sincronizar tus datos."}</p>
        </div>
      </section>
      <AuthPanel session={session} notice={authNotice} setNotice={setAuthNotice} onSync={onSync} />
      <FitDropzone fitImports={fitImports} setFitImports={setFitImports} session={session} onSync={onSync} onImportedSession={onImportedSession} />
    </section>
  );
}

function AuthPanel({ session, notice, setNotice, onSync }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!supabase) {
      setNotice("El acceso ENQIDU no está disponible en este entorno.");
      return;
    }
    if (!email.trim() || !password.trim()) {
      setNotice("Introduce email y contraseña.");
      return;
    }

    setLoading(true);
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (result.error) {
      setNotice(result.error.message);
      return;
    }

    setNotice(mode === "signup" ? "Cuenta creada. Revisa tu email si hace falta confirmar el acceso." : "Sesión iniciada.");
    if (onSync) onSync();
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setNotice("Sesión cerrada.");
  };

  return (
    <section className="authPanel">
      <div className="authHeader">
        <div className="leadIcon">
          {session ? <CheckCircle2 size={22} /> : <LockKeyhole size={22} />}
        </div>
        <div>
          <span>Cuenta ENQIDU</span>
          <h3>{session ? "Sesión activa" : "Acceso ENQIDU"}</h3>
          <p>{session ? session.user.email : "Accede para sincronizar tus datos personales."}</p>
        </div>
      </div>
      {!session ? (
        <div className="authForm">
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" type="email" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="password" type="password" />
          <div className="segmented">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Crear</button>
          </div>
          <button className="primaryAction" onClick={submit} disabled={loading}>
            <LogIn size={16} />
            {loading ? "Conectando..." : "Conectar"}
          </button>
        </div>
      ) : (
        <div className="authActions">
          <button className="primaryAction" onClick={onSync}>
            <RefreshCw size={16} />
            Refrescar datos
          </button>
          <button className="ghostAction" onClick={logout}>
            <LogOut size={16} />
            Salir
          </button>
        </div>
      )}
      {notice && <p className="notice">{notice}</p>}
    </section>
  );
}

function FitDropzone({ fitImports, setFitImports, session, onSync, onImportedSession }) {
  const [dragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState({ status: "idle", message: "" });

  const processFiles = async (files) => {
    const selectedFiles = [...files];
    if (!selectedFiles.length) {
      setUploadState({ status: "error", message: "No he recibido ningun archivo desde el selector." });
      return;
    }

    setUploadState({ status: "loading", message: `Procesando ${selectedFiles.length} archivo(s)...` });
    try {
      const parsed = await Promise.all(selectedFiles.map((file) => parseFitFile(file, session)));
      setFitImports(mergeFitImports(parsed, fitImports));
      const failed = parsed.filter((item) => item.backoffice?.toLowerCase().includes("error"));
      setUploadState({
        status: failed.length ? "warning" : "ok",
        message: failed.length
          ? `${parsed.length} FIT procesado(s), pero ${failed.length} no pudieron registrarse completos.`
          : `${parsed.length} FIT cargado(s) y registrado(s).`,
      });
      if (onSync) onSync();
      const importedSession = parsed.find((item) => item.sessionId);
      if (importedSession?.sessionId && onImportedSession) {
        onImportedSession({
          id: importedSession.sessionId,
          user_id: session?.user?.id,
          title: importedSession.summary?.activity_type || importedSession.name || "Actividad Garmin",
          session_kind: "completed",
          session_status: "completed",
          tags: ["garmin_fit", "parsed"],
          session_structure: importedSession.summary ? { garmin_fit_summary: importedSession.summary } : {},
        });
      }
    } catch (error) {
      setUploadState({ status: "error", message: error.message || "Error inesperado procesando FIT." });
    }
  };

  return (
    <section
      className={`fitDropzone ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        processFiles(event.dataTransfer.files);
      }}
    >
      <FileUp size={26} />
      <div>
        <strong>Importar archivo FIT</strong>
        <span>Selecciona un .fit o un .zip exportado de Garmin. En móvil usa Archivos/Mis archivos.</span>
      </div>
      <label>
        Elegir archivo
        <input
          type="file"
          accept=".fit,.FIT,.zip,.ZIP,application/zip,application/x-zip-compressed,application/vnd.ant.fit"
          multiple
          onChange={(event) => {
            processFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {uploadState.message && <p className={`uploadState ${uploadState.status}`}>{uploadState.message}</p>}
      {fitImports.length > 0 && (
        <div className="fitList">
          {mergeFitImports([], fitImports).slice(0, 4).map((item) => (
            <InfoRow key={`${item.name}-${item.importedAt}`} label={item.name} value={`${item.sizeKb} KB · ${item.status}`} />
          ))}
        </div>
      )}
    </section>
  );
}

async function parseFitFile(file, session) {
  const originalBuffer = await file.arrayBuffer();
  const extracted = await extractFitPayload(file, originalBuffer);
  const buffer = extracted.buffer;
  const bytes = new Uint8Array(buffer.slice(0, 16));
  const headerText = String.fromCharCode(...bytes);
  const valid = headerText.includes(".FIT");
  const checksum = await sha256(buffer);
  const displayName = file.name || `garmin-upload-${new Date().toISOString()}.fit`;
  const sourceLabel = extracted.innerName ? `${displayName} -> ${extracted.innerName}` : displayName;
  const baseImport = {
    name: sourceLabel,
    sizeKb: Math.round(file.size / 1024),
    importedAt: new Date().toISOString(),
    checksum,
    status: valid
      ? extracted.innerName
        ? "ZIP con FIT OK"
        : "FIT header OK"
      : extracted.error || `FIT pendiente validar (${file.type || "sin tipo"})`,
  };

  if (!supabase || !session?.user?.id) {
    return { ...baseImport, backoffice: "local only" };
  }

  const sourcePayload = {
    user_id: session.user.id,
    source_type: "garmin_fit",
    source_name: sourceLabel,
    source_system: "garmin",
    source_version: "fit-manual-upload",
    original_filename: displayName,
    original_content_type: file.type || "application/octet-stream",
    original_json: {
      fileName: displayName,
      innerFitName: extracted.innerName,
      fileSize: file.size,
      extractedFitSize: buffer.byteLength,
      fitHeaderValid: valid,
      containerType: extracted.containerType,
      importedFrom: "sport-elements-app",
    },
    file_checksum: checksum,
    import_status: valid ? "validated" : "received",
    validation_errors: valid ? [] : [{ code: "fit_header_unconfirmed", message: "No .FIT marker in first 16 bytes" }],
    provenance: {
      channel: "fit_manual_upload",
      uploadedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      binaryStored: false,
    },
  };

  const { data: sourceData, error: sourceError } = await supabase
    .from("training_sources")
    .upsert(sourcePayload, { onConflict: "user_id,file_checksum" })
    .select("id, import_status")
    .single();

  if (sourceError) {
    return { ...baseImport, backoffice: `training_sources error: ${sourceError.message}` };
  }

  const parsedSession = valid ? await persistParsedFitSession({
    buffer,
    checksum,
    sourceId: sourceData.id,
    userId: session.user.id,
  }) : { sessionId: null, status: "needs_user_context", summary: null, error: null };

  const activityPayload = {
    user_id: session.user.id,
    provider: "garmin",
    provider_mode: "manual_upload",
    ingestion_channel: "fit_manual_upload",
    external_activity_id: checksum,
    notification_mode: "manual_calibration",
    source_file_available: true,
    source_id: sourceData.id,
    session_id: parsedSession.sessionId,
    parser_version: "sport-elements-fit-parser-v1",
    processing_status: parsedSession.status,
    retry_count: 0,
    last_error: parsedSession.error ? { message: parsedSession.error } : {},
    provider_payload: {
      fileName: displayName,
      innerFitName: extracted.innerName,
      size: file.size,
      extractedFitSize: buffer.byteLength,
      checksum,
      fitHeaderValid: valid,
      containerType: extracted.containerType,
    },
    processing_summary: {
      status: parsedSession.status,
      session_id: parsedSession.sessionId,
      summary: parsedSession.summary,
      next: parsedSession.sessionId ? "loaded into training_sessions/session_samples/session_metrics" : "parse failed or source needs user context",
    },
  };

  const { error: activityError } = await supabase
    .from("wearable_activity_imports")
    .upsert(activityPayload, { onConflict: "user_id,provider,external_activity_id" });

  return {
    ...baseImport,
    sourceId: sourceData.id,
    sessionId: parsedSession.sessionId,
    summary: parsedSession.summary,
    backoffice: activityError
      ? `source/session OK, activity import error: ${activityError.message}`
      : parsedSession.sessionId
        ? "FIT parseado OK · training_sessions + samples + metrics"
        : "training_sources + activity_import OK",
  };
}

function mergeFitImports(incoming, current) {
  const rank = (item) => {
    const text = `${item.status || ""} ${item.backoffice || ""}`.toLowerCase();
    if (text.includes("parseado ok") || text.includes("samples + metrics")) return 4;
    if (text.includes("activity_import ok") || text.includes("activity import ok")) return 3;
    if (text.includes("source/session ok")) return 2;
    if (text.includes("error") || text.includes("violates")) return 0;
    return 1;
  };
  const byKey = new Map();
  [...incoming, ...current].forEach((item) => {
    const key = item.checksum || item.sourceId || item.name;
    const existing = byKey.get(key);
    if (!existing || rank(item) > rank(existing) || (rank(item) === rank(existing) && item.importedAt > existing.importedAt)) {
      byKey.set(key, item);
    }
  });
  return [...byKey.values()].sort((a, b) => new Date(b.importedAt || 0) - new Date(a.importedAt || 0));
}

async function persistParsedFitSession({ buffer, checksum, sourceId, userId }) {
  try {
    const fitParser = new FitParser({
      force: true,
      elapsedRecordField: true,
      mode: "both",
      lengthUnit: "m",
      speedUnit: "m/s",
      temperatureUnit: "celsius",
    });
    const binary = Buffer.from(new Uint8Array(buffer));
    const fit = await fitParser.parseAsync(binary);
    const rawMessages = parseFitMessageGroups(binary);
    const normalized = normalizeParsedFit(fit, checksum, rawMessages);

    const { data: existingByReference } = await supabase
      .from("training_sessions")
      .select("id, title, session_structure, tags")
      .eq("external_reference", `fit:${checksum}`)
      .maybeSingle();

    // FIT imports are only merged into an existing session when a strong
    // file identity matches. Same-day Garmin sessions can be distinct workouts,
    // so local_date/tags alone must never be used as an overwrite signal.
    const { data: existingByFingerprint } = !existingByReference?.id && normalized.fitFingerprint
      ? await supabase
          .from("training_sessions")
          .select("id, title, session_structure, tags")
          .eq("user_id", userId)
          .contains("tags", [`fit_fingerprint:${normalized.fitFingerprint}`])
          .neq("session_status", "archived")
          .limit(1)
          .maybeSingle()
      : { data: null };

    const existing = existingByReference || existingByFingerprint;

    let sessionId = existing?.id;
    if (!sessionId) {
      const { data: inserted, error: sessionError } = await supabase
        .from("training_sessions")
        .insert({
          user_id: userId,
          source_id: sourceId,
          external_reference: `fit:${checksum}`,
          title: normalized.title,
          session_kind: "completed",
          session_status: "completed",
          started_at: normalized.startedAt,
          local_date: normalized.localDate,
          duration_seconds: normalized.durationSeconds,
          distance_meters: normalized.distanceMeters,
          session_structure: mergeGarminFitSummary(null, normalized.summary),
          tags: mergeTags([normalized.activityType], ["garmin_fit", "parsed", `fit_checksum:${checksum}`, normalized.fitFingerprint ? `fit_fingerprint:${normalized.fitFingerprint}` : null]),
        })
        .select("id")
        .single();
      if (sessionError) throw sessionError;
      sessionId = inserted.id;
    } else {
      const { error: updateError } = await supabase
        .from("training_sessions")
        .update({
          source_id: sourceId,
          title: existing.title || normalized.title,
          session_kind: "completed",
          session_status: "completed",
          started_at: normalized.startedAt,
          local_date: normalized.localDate,
          duration_seconds: normalized.durationSeconds,
          distance_meters: normalized.distanceMeters,
          session_structure: mergeGarminFitSummary(existing.session_structure, normalized.summary),
          tags: mergeTags(existing.tags, ["garmin_fit", "parsed", `fit_checksum:${checksum}`, normalized.fitFingerprint ? `fit_fingerprint:${normalized.fitFingerprint}` : null]),
        })
        .eq("id", sessionId);
      if (updateError) throw updateError;
    }

    await supabase.from("session_source_links").upsert({
      session_id: sessionId,
      source_id: sourceId,
      source_role: "garmin_fit",
      is_primary: true,
    });

    await insertFitMessagePayloadRows(sessionId, sourceId, normalized.fitMessages);
    await backfillGarminRelationalRows(sessionId, {
      garminSets: normalized.garminSets,
      sessionLaps: normalized.sessionLaps,
    });

    if (!existing?.id) {
      await insertMetricRows(sessionId, normalized.metrics);
      await insertSampleRows(sessionId, sourceId, normalized.samples);
      await insertExerciseRows(sessionId, normalized.exercises);
    }

    await reconcileSessionTemporalBlocks(sessionId);

    return {
      sessionId,
      status: "persisted",
      summary: {
        title: normalized.title,
        duration_seconds: normalized.durationSeconds,
        samples: normalized.samples.length,
        exercises: normalized.exercises.length,
        fit_messages: normalized.fitMessages.length,
        garmin_sets: normalized.garminSets.length,
        session_laps: normalized.sessionLaps.length,
        temporal_segments: normalized.summary.temporal_segments?.length || 0,
      },
      error: null,
    };
  } catch (error) {
    return {
      sessionId: null,
      status: "error",
      summary: null,
      error: error.message || "FIT parse failed",
    };
  }
}

function normalizeParsedFit(fit, checksum, rawMessages = {}) {
  const session = firstItem(fit.sessions) || {};
  const sport = firstItem(fit.sports) || {};
  const parsedRecords = Array.isArray(fit.records) ? fit.records : collectNestedRecords(fit.sessions);
  const rawRecordMessages = messageRows(rawMessages, "record", rawMessages.records);
  const records = parsedRecords.map((record, index) => mergeRecordRespiration(record, rawRecordMessages[index]));
  const sets = messageRows(rawMessages, "set", fit.sets || fit.set);
  const laps = messageRows(rawMessages, "lap", fit.laps || fit.lap || fit.activity?.sessions?.flatMap((item) => item.laps || []));
  const events = messageRows(rawMessages, "event", fit.events || fit.event || fit.activity?.events);
  const sessions = messageRows(rawMessages, "session", fit.sessions || fit.session);
  const workoutSteps = messageRows(rawMessages, "workout_step", fit.workout_steps || fit.workout_step);
  const workouts = messageRows(rawMessages, "workout", fit.workouts || fit.workout);
  const lengths = messageRows(rawMessages, "length", fit.lengths || fit.length);
  const splits = messageRows(rawMessages, "split", fit.splits || fit.split);
  const splitSummaries = messageRows(rawMessages, "split_summary", fit.split_summaries || fit.split_summary);
  const zonesTarget = firstItem(fit.zones_targets || fit.zones_target);
  const userProfile = firstItem(fit.user_profiles || fit.user_profile);
  const fileId = firstItem(messageRows(rawMessages, "file_id", fit.file_id || fit.file_ids));
  const startedAt = toIso(session.start_time || session.start_date || firstItem(records)?.timestamp || fit.timestamp);
  const sessionTime = timeMetricsFromFitSessionPayload(session);
  const objectiveTime = timeMetricsFromObjectiveRows(splits.length ? splits : laps.length ? laps : splitSummaries, sessionTime.totalSeconds);
  const elapsedSeconds = Math.round(Number(sessionTime.totalSeconds || session.total_elapsed_time || session.total_elapsed_time_seconds || 0));
  const timerSeconds = Math.round(Number(sessionTime.activeSeconds || session.total_timer_time || session.total_timer_time_seconds || fit.active_time || 0));
  const durationSeconds = objectiveTime.totalSeconds || elapsedSeconds || timerSeconds || 0;
  const activityType = activityLabel(session.sport || sport.sport, session.sub_sport || sport.sub_sport);
  const garminOriginalName = garminActivityName({ fit, session, sport, fallback: activityType });
  const temporalSegments = normalizeFitTemporalSegments({ laps, sets, splits, events, records, startedAt });
  const garminSeries = normalizeGarminSeriesFromFit({ sets, laps, splits, workoutSteps, startedAt });
  let sessionLaps = normalizeSessionLapsFromFit({ laps, splits, splitSummaries, startedAt });
  const fitMessages = buildFitMessagePayloads({
    sessions,
    laps,
    records,
    events,
    sets,
    workouts,
    workout_steps: workoutSteps,
    lengths,
    splits,
    split_summaries: splitSummaries,
    file_id: messageRows(rawMessages, "file_id", fit.file_id || fit.file_ids),
    sports: messageRows(rawMessages, "sport", fit.sports || fit.sport),
    hr_zone: messageRows(rawMessages, "hr_zone", fit.hr_zone),
    power_zone: messageRows(rawMessages, "power_zone", fit.power_zone),
    time_in_zone: messageRows(rawMessages, "time_in_zone", fit.time_in_zone),
    activity_metrics: messageRows(rawMessages, "activity_metrics", fit.activity_metrics),
    developer_data_ids: messageRows(rawMessages, "developer_data_id", fit.developer_data_ids),
    field_descriptions: messageRows(rawMessages, "field_description", fit.field_descriptions),
  });
  const samples = records
    .map((record, index) => ({
      session_id: null,
      source_id: null,
      sample_order: index + 1,
      recorded_at: toIso(record.timestamp),
      elapsed_seconds: Number(record.elapsed_time ?? record.timer_time ?? index),
      distance_m: nullableNumber(record.distance),
      heart_rate_bpm: nullableNumber(record.heart_rate),
      speed_mps: nullableNumber(record.speed),
      cadence_rpm: nullableNumber(record.cadence),
      power_w: nullableNumber(record.power),
      altitude_m: nullableNumber(record.altitude),
      temperature_c: nullableNumber(record.temperature),
      raw_payload: compactRecordPayload(record),
      parser_version: "sport-elements-fit-parser-v1",
    }))
    .filter((sample) => sample.recorded_at || sample.heart_rate_bpm != null);

  const heartValues = samples.map((sample) => Number(sample.heart_rate_bpm || 0)).filter(Boolean);
  const respirationValues = samples.map(sampleRespirationValue).filter((value) => value != null && value > 0 && value < 80);
  const temperatures = samples.map((sample) => Number(sample.temperature_c || 0)).filter(Boolean);
  sessionLaps = enrichLapRowsWithSampleStats(sessionLaps, samples);
  const workSeconds = objectiveTime.activeSeconds ?? timerSeconds ?? durationSeconds;
  const restSeconds = objectiveTime.restSeconds ?? Math.max(0, durationSeconds - workSeconds);
  const trainingEffect = {
    aerobic: nullableNumber(session.total_training_effect ?? session.aerobic_training_effect),
    anaerobic: nullableNumber(session.total_anaerobic_training_effect ?? session.anaerobic_training_effect),
    training_load: nullableNumber(session.training_load ?? session.total_training_load),
  };
  const exercises = normalizeFitSets(sets);
  const repsTotal = exercises.reduce((sum, exercise) => sum + Number(exercise.reps || 0), 0);
  const reportedZones = normalizeReportedZones(session.time_in_hr_zone, durationSeconds, zonesTarget, userProfile);

  const summary = {
    sport: session.sport || sport.sport,
    sub_sport: session.sub_sport || sport.sub_sport,
    activity_type: activityType,
    garmin_original_name: garminOriginalName,
    local_date: startedAt ? startedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    start_time_utc: startedAt,
    duration_total_seconds: durationSeconds,
    duration_elapsed_seconds: Math.round(Number(session.total_elapsed_time || durationSeconds)),
    duration_work_seconds: workSeconds,
    duration_rest_seconds: restSeconds,
    heart_rate: {
      avg_bpm: nullableNumber(session.avg_heart_rate) ?? (heartValues.length ? Math.round(average(heartValues)) : null),
      max_bpm: nullableNumber(session.max_heart_rate) ?? (heartValues.length ? Math.round(Math.max(...heartValues)) : null),
    },
    respiration: {
      avg_brpm: nullableNumber(session.enhanced_avg_respiration_rate ?? session.avg_respiration_rate ?? session.average_respiration_rate ?? session.avg_breathing_rate) ??
        (respirationValues.length ? Math.round(average(respirationValues)) : null),
      max_brpm: nullableNumber(session.enhanced_max_respiration_rate ?? session.max_respiration_rate ?? session.maximum_respiration_rate ?? session.max_breathing_rate) ??
        (respirationValues.length ? Math.round(Math.max(...respirationValues)) : null),
      min_brpm: nullableNumber(session.enhanced_min_respiration_rate ?? session.min_respiration_rate ?? session.minimum_respiration_rate ?? session.min_breathing_rate) ??
        (respirationValues.length ? Math.round(Math.min(...respirationValues)) : null),
    },
    calories: {
      total_kcal: nullableNumber(session.total_calories),
      active_kcal: nullableNumber(session.active_calories),
      rest_kcal: nullableNumber(session.resting_calories),
    },
    hydration: {
      estimated_fluid_loss_ml: nullableNumber(session.estimated_sweat_loss ?? session.total_fluid_loss),
    },
    temperature: {
      min_c: temperatures.length ? Math.min(...temperatures) : 0,
      max_c: temperatures.length ? Math.max(...temperatures) : 0,
      avg_c: temperatures.length ? Math.round(average(temperatures)) : 0,
    },
    training_effect: trainingEffect,
    strength_tracking: {
      active_sets: exercises.length || nullableNumber(session.num_active_sets) || garminSeries.length || 0,
      set_messages: sets.length,
      repetitions_total: repsTotal || sumNumeric(garminSeries.map((item) => item.repetitions)),
      garmin_sets_total: garminSeries.length || sets.length || nullableNumber(session.num_active_sets) || 0,
      garmin_repetitions_total: sumNumeric(garminSeries.map((item) => item.repetitions)) || repsTotal || 0,
    },
    fit_debug: buildFitDebugSummary({ records, laps, sessions, events, sets, workoutSteps, lengths, splits, splitSummaries }),
    laps,
    events,
    sets,
    workout_steps: workoutSteps,
    workouts,
    lengths,
    splits,
    split_summaries: splitSummaries,
    temporal_segments: temporalSegments,
    garmin_series: garminSeries,
    heart_rate_zones_reported: reportedZones,
    checksum,
    fit_identity: {
      external_reference: `fit:${checksum}`,
      checksum_sha256: checksum,
      fingerprint: buildFitFingerprint({ fileId, session, activity: fit.activity, sport, checksum }),
      garmin_original_name: garminOriginalName,
      fingerprint_fields: {
        file_id_serial_number: fileId?.serial_number,
        file_id_time_created: toIso(fileId?.time_created),
        activity_timestamp: toIso(fit.activity?.timestamp),
        session_start_time: startedAt,
        total_timer_time: nullableNumber(session.total_timer_time),
        total_elapsed_time: nullableNumber(session.total_elapsed_time),
        total_distance: nullableNumber(session.total_distance),
        sport: session.sport || sport.sport,
        sub_sport: session.sub_sport || sport.sub_sport,
        manufacturer: fileId?.manufacturer,
        product: fileId?.product,
      },
    },
  };

  return {
    title: garminOriginalName,
    activityType: classifyActivityTypeFromSummary(summary),
    startedAt,
    localDate: summary.local_date,
    durationSeconds,
    distanceMeters: nullableNumber(session.total_distance),
    samples,
    exercises,
    garminSets: garminSeries,
    sessionLaps,
    fitMessages,
    summary,
    fitFingerprint: summary.fit_identity.fingerprint,
    metrics: buildSessionMetrics(summary),
  };
}

function buildFitFingerprint({ fileId = {}, session = {}, activity = {}, sport = {}, checksum }) {
  const fields = [
    fileId.serial_number,
    toIso(fileId.time_created),
    toIso(activity?.timestamp),
    toIso(session.start_time || session.start_date),
    session.total_timer_time,
    session.total_elapsed_time,
    session.total_distance,
    session.sport || sport.sport,
    session.sub_sport || sport.sub_sport,
    fileId.manufacturer,
    fileId.product,
  ].map((value) => (value == null || value === "" ? "-" : `${value}`));
  const strongFieldCount = fields.filter((value) => value !== "-").length;
  return strongFieldCount >= 4 ? btoa(unescape(encodeURIComponent(fields.join("|")))).replace(/=+$/g, "").slice(0, 96) : checksum;
}

function arrayFromFitValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function messageRows(rawMessages, messageType, fallback) {
  return rawMessages?.[messageType]?.length ? rawMessages[messageType] : arrayFromFitValue(fallback);
}

function mergeRecordRespiration(record = {}, rawRecord = {}) {
  const respiration = sampleRespirationValue(rawRecord);
  if (respiration == null) return record;
  return {
    ...record,
    enhanced_respiration_rate: record.enhanced_respiration_rate ?? respiration,
    respiration_rate: record.respiration_rate ?? respiration,
    respiration_brpm: record.respiration_brpm ?? respiration,
  };
}

function parseFitMessageGroups(buffer) {
  try {
    const blob = new Uint8Array(getArrayBuffer(buffer));
    const headerLength = blob[0];
    const protocolVersion = blob[1];
    if (protocolVersion < 16 || headerLength < 12) return {};
    const dataLength = blob[4] | (blob[5] << 8) | (blob[6] << 16) | (blob[7] << 24);
    const crcStart = headerLength + dataLength;
    const options = {
      force: true,
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: true,
      pressureUnit: "bar",
      mode: "both",
    };
    const messageTypes = [];
    const developerFields = [];
    const groups = {};
    let loopIndex = headerLength;
    let startDate;
    let lastStopTimestamp;
    let pausedTime = 0;

    while (loopIndex < crcStart) {
      const { nextIndex, messageType, message } = readRecord(blob, messageTypes, developerFields, loopIndex, options, startDate, pausedTime);
      loopIndex = nextIndex;
      if (!messageType || !message) continue;
      if (messageType === "record" && !startDate) startDate = message.timestamp;
      if (messageType === "event" && message.event === "timer") {
        if (message.event_type === "stop_all") lastStopTimestamp = message.timestamp;
        else if (message.event_type === "start" && lastStopTimestamp) pausedTime += (message.timestamp - lastStopTimestamp) / 1000;
      }
      if (!groups[messageType]) groups[messageType] = [];
      groups[messageType].push(message);
    }

    return augmentRecordMessagesWithRespiration(groups, buffer);
  } catch (error) {
    console.warn("FIT raw message grouping failed", error);
    return {};
  }
}

function augmentRecordMessagesWithRespiration(groups, buffer) {
  const records = groups.record || groups.records || [];
  if (!records.length) return groups;
  const respirationSeries = extractFitRecordRespirationSeries(buffer);
  if (!respirationSeries.some((value) => value != null)) return groups;
  const enhancedRecords = records.map((record, index) => {
    const respiration = respirationSeries[index];
    if (respiration == null) return record;
    return {
      ...record,
      enhanced_respiration_rate: respiration,
      respiration_rate: respiration,
      respiration_brpm: respiration,
    };
  });
  return {
    ...groups,
    record: groups.record ? enhancedRecords : groups.record,
    records: groups.records ? enhancedRecords : groups.records,
  };
}

function extractFitRecordRespirationSeries(buffer) {
  try {
    const blob = new Uint8Array(getArrayBuffer(buffer));
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
  } catch (error) {
    console.warn("FIT respiration extraction failed", error);
    return [];
  }
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

function buildFitMessagePayloads(groups) {
  const rows = [];
  Object.entries(groups).forEach(([messageType, values]) => {
    arrayFromFitValue(values).forEach((payload, index) => {
      rows.push({
        message_type: messageType,
        message_order: rows.length + 1,
        recorded_at: toIso(payload?.timestamp || payload?.start_time || payload?.start_date),
        payload: {
          ...payload,
          _message_type: messageType,
          _message_index: index,
        },
      });
    });
  });
  return rows;
}

function buildFitDebugSummary({ records, laps, sessions, events, sets, workoutSteps, lengths, splits, splitSummaries }) {
  return {
    records_count: records.length,
    laps_count: laps.length,
    sessions_count: sessions.length,
    events_count: events.length,
    sets_count: sets.length,
    workout_steps_count: workoutSteps.length,
    lengths_count: lengths.length,
    splits_count: splits.length,
    split_summaries_count: splitSummaries.length,
    session_keys: Object.keys(sessions[0] || {}),
    event_keys: Object.keys(events[0] || {}),
    workout_step_keys: Object.keys(workoutSteps[0] || {}),
    set_keys: Object.keys(sets[0] || {}),
  };
}

function normalizeFitTemporalSegments({ laps = [], sets = [], splits = [], events = [], records = [], startedAt }) {
  const candidates = [
    ...segmentsFromRows(laps, "garmin_lap_direct", startedAt),
    ...segmentsFromRows(sets, "garmin_set_direct", startedAt),
    ...segmentsFromRows(splits, "garmin_split_direct", startedAt),
  ].filter((segment) => segment.duration_seconds != null || (segment.start_elapsed_seconds != null && segment.end_elapsed_seconds != null));
  if (candidates.length) return candidates;
  return segmentsFromTimerEvents(events, records, startedAt);
}

function normalizeGarminSeriesFromFit({ sets = [], workoutSteps = [], startedAt }) {
  const setSeries = seriesFromRows(sets, "garmin_fit_set", startedAt);
  if (setSeries.length) return setSeries;
  return seriesFromRows(workoutSteps, "garmin_fit_workout_step", startedAt);
}

function seriesFromRows(rows, source, startedAt) {
  const baseTime = startedAt ? new Date(startedAt).getTime() : null;
  let cursor = 0;
  return rows
    .map((row, index) => {
      const explicitStart = elapsedFromFitRow(row, ["start_elapsed_seconds", "start_time_seconds", "start_elapsed_time"], "start_time", baseTime);
      const time = garminObjectiveTimeParts(row);
      const work = time.active;
      const rest = time.rest;
      const total = time.total;
      const start = explicitStart ?? cursor;
      const end = elapsedFromFitRow(row, ["end_elapsed_seconds", "end_time_seconds", "end_elapsed_time"], "end_time", baseTime) ?? (start != null && total != null ? start + total : null);
      if (end != null) cursor = Math.max(cursor, end);
      const repetitions = nullableNumber(row.repetitions ?? row.reps ?? row.num_reps);
      return {
        source,
        series_order: fitMessageOrder(row.message_index ?? row.message_number ?? row.lap_index ?? row.set_index) ?? index + 1,
        garmin_exercise_name: row.exercise_name || row.name || row.category || row.sport || null,
        start_elapsed_seconds: start,
        end_elapsed_seconds: end,
        duration_seconds: total == null ? null : Math.round(total),
        active_seconds: work == null ? null : Math.round(work),
        rest_seconds: rest == null ? null : Math.round(rest),
        repetitions,
        load_value: nullableNumber(row.weight ?? row.load_value),
        load_unit: row.weight || row.load_value ? row.load_unit || "kg" : null,
        heart_rate_avg_bpm: nullableNumber(row.avg_heart_rate ?? row.average_heart_rate ?? row.heart_rate_avg_bpm),
        heart_rate_max_bpm: nullableNumber(row.max_heart_rate ?? row.maximum_heart_rate ?? row.heart_rate_max_bpm),
        confidence: source === "garmin_fit_set" ? "reported" : "derived",
        raw_payload: row,
      };
    })
    .filter((row) =>
      row.duration_seconds != null ||
      row.active_seconds != null ||
      row.rest_seconds != null ||
      row.repetitions != null ||
      row.garmin_exercise_name,
    )
    .sort((a, b) => a.series_order - b.series_order);
}

function normalizeSessionLapsFromFit({ laps = [], splits = [], splitSummaries = [], startedAt }) {
  const lapRows = lapRowsFromRows(laps, "garmin_fit_lap", startedAt);
  if (lapRows.length) return lapRows;
  const splitRows = lapRowsFromRows(splits, "garmin_fit_split", startedAt);
  if (splitRows.length) return splitRows;
  return lapRowsFromRows(splitSummaries, "garmin_fit_split_summary", startedAt);
}

function enrichLapRowsWithSampleStats(rows = [], samples = []) {
  if (!rows.length || !samples.length) return rows;
  return rows.map((row) => {
    const start = optionalNumber(row.start_elapsed_seconds);
    const duration = optionalNumber(row.duration_seconds);
    const end = optionalNumber(row.end_elapsed_seconds) ?? (start != null && duration != null ? start + duration : null);
    const heartRate = heartRateStatsForWindow(samples, start, end, {
      avg: row.heart_rate_avg_bpm,
      max: row.heart_rate_max_bpm,
    });
    const respiration = respirationStatsForWindow(samples, start, end, row.raw_payload?._enqidu_computed);
    const computed = {
      ...(row.raw_payload?._enqidu_computed || {}),
      heart_rate_avg_bpm: heartRate.avg,
      heart_rate_max_bpm: heartRate.max,
      respiration_avg_brpm: respiration.avg,
      respiration_max_brpm: respiration.max,
    };
    return {
      ...row,
      heart_rate_avg_bpm: row.heart_rate_avg_bpm ?? heartRate.avg,
      heart_rate_max_bpm: row.heart_rate_max_bpm ?? heartRate.max,
      raw_payload: {
        ...(row.raw_payload || {}),
        _enqidu_computed: computed,
      },
    };
  });
}

function lapRowsFromRows(rows, source, startedAt) {
  const baseTime = startedAt ? new Date(startedAt).getTime() : null;
  let cursor = 0;
  return rows
    .map((row, index) => {
      const explicitStart = elapsedFromFitRow(row, ["start_elapsed_seconds", "start_time_seconds", "start_elapsed_time"], "start_time", baseTime);
      const time = garminObjectiveTimeParts(row);
      const active = time.active;
      const total = time.total;
      const start = explicitStart ?? cursor;
      const end = elapsedFromFitRow(row, ["end_elapsed_seconds", "end_time_seconds", "end_elapsed_time"], "end_time", baseTime) ?? (start != null && total != null ? start + total : null);
      if (end != null) cursor = Math.max(cursor, end);
      const rest = time.rest;
      return {
        lap_index: index + 1,
        source,
        start_elapsed_seconds: start == null ? null : Math.round(start),
        end_elapsed_seconds: end == null ? null : Math.round(end),
        duration_seconds: total == null ? null : Math.round(total),
        active_seconds: active == null ? null : Math.round(active),
        rest_seconds: rest == null ? null : Math.round(rest),
        distance_meters: nullableNumber(row.total_distance ?? row.distance),
        heart_rate_avg_bpm: nullableNumber(row.avg_heart_rate ?? row.average_heart_rate ?? row.heart_rate_avg_bpm),
        heart_rate_max_bpm: nullableNumber(row.max_heart_rate ?? row.maximum_heart_rate ?? row.heart_rate_max_bpm),
        raw_payload: row,
      };
    })
    .filter((row) => row.duration_seconds != null || (row.start_elapsed_seconds != null && row.end_elapsed_seconds != null))
    .sort((a, b) => a.lap_index - b.lap_index);
}


function segmentsFromRows(rows, source, startedAt) {
  const baseTime = startedAt ? new Date(startedAt).getTime() : null;
  return rows
    .map((row, index) => {
      const start = elapsedFromFitRow(row, ["start_elapsed_seconds", "start_time_seconds", "start_elapsed_time", "elapsed_time"], "start_time", baseTime);
      const time = garminObjectiveTimeParts(row);
      const active = time.active;
      const total = time.total;
      const rest = time.rest;
      const end = elapsedFromFitRow(row, ["end_elapsed_seconds", "end_time_seconds", "end_elapsed_time"], "end_time", baseTime) ?? (start != null && total != null ? start + total : null);
      return {
        source,
        order: index + 1,
        start_elapsed_seconds: start,
        end_elapsed_seconds: end,
        duration_seconds: total,
        active_seconds: active,
        rest_seconds: rest,
        raw: row,
      };
    })
    .filter((segment) => segment.duration_seconds != null || (segment.start_elapsed_seconds != null && segment.end_elapsed_seconds != null));
}

function elapsedFromFitRow(row, relativeKeys, absoluteKey, baseTime) {
  for (const key of relativeKeys) {
    const value = nullableNumber(row[key]);
    if (value != null) return value;
  }
  if (!absoluteKey || !baseTime) return null;
  const value = row[absoluteKey];
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (time - baseTime) / 1000);
}

function fitMessageOrder(value) {
  if (value == null) return null;
  if (typeof value === "object") return nullableNumber(value.value);
  return nullableNumber(value);
}

function segmentsFromTimerEvents(events = [], records = [], startedAt) {
  const firstTime = new Date(startedAt || records[0]?.timestamp || events[0]?.timestamp || 0).getTime();
  if (!Number.isFinite(firstTime) || firstTime <= 0) return [];
  const timerEvents = events
    .filter((event) => `${event.event || ""}`.toLowerCase() === "timer" && event.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const segments = [];
  let openStart = null;

  timerEvents.forEach((event, index) => {
    const eventType = `${event.event_type || ""}`.toLowerCase();
    const elapsed = Math.max(0, Math.round((new Date(event.timestamp).getTime() - firstTime) / 1000));
    if (eventType === "start" || eventType === "marker") {
      if (openStart == null) openStart = elapsed;
      return;
    }
    if ((eventType === "stop" || eventType === "stop_all") && openStart != null && elapsed > openStart) {
      segments.push({
        source: "garmin_event_timer_direct",
        order: segments.length,
        start_elapsed_seconds: openStart,
        end_elapsed_seconds: elapsed,
        duration_seconds: elapsed - openStart,
        active_seconds: elapsed - openStart,
        rest_seconds: null,
        raw: { start_event_index: index, stop_event: event },
      });
      openStart = null;
    }
  });

  return segments;
}

function firstItem(value) {
  return Array.isArray(value) ? value[0] : value;
}

function collectNestedRecords(sessions = []) {
  return (sessions || []).flatMap((session) => (session.laps || []).flatMap((lap) => lap.records || []));
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value) {
  const number = nullableNumber(value);
  return number == null ? null : Math.round(number);
}

function activityLabel(sport, subSport) {
  const sportText = fitValueText(sport);
  const subSportText = fitValueText(subSport);
  const joined = `${sportText} ${subSportText}`.toLowerCase();
  if (joined.includes("strength")) return "Fuerza";
  if (joined.includes("pilates")) return "Pilates";
  if (joined.includes("yoga")) return "Yoga";
  if (joined.includes("swim")) return "Natación";
  if (joined.includes("running") || joined.includes("trail")) return "Correr";
  if (
    joined.includes("hiit") ||
    joined.includes("cardio_training") ||
    joined.includes("cardio") ||
    joined.includes("training") ||
    joined.includes("workout") ||
    joined.includes("fitness_equipment")
  ) return "HIIT";
  if (joined.includes("fitness")) return "Fuerza";
  return sportText ? sportText.replaceAll("_", " ") : "Actividad";
}

function fitValueText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return `${value}`;
  if (typeof value === "object") {
    return value.name || value.label || value.value || value.type || value.sport || JSON.stringify(value);
  }
  return `${value}`;
}

function compactRecordPayload(record) {
  return {
    timestamp: record.timestamp,
    heart_rate: record.heart_rate,
    temperature: record.temperature,
    elapsed_time: record.elapsed_time,
    timer_time: record.timer_time,
    respiration_rate: record.respiration_rate,
    respiratory_rate: record.respiratory_rate,
    breathing_rate: record.breathing_rate,
    breaths_per_minute: record.breaths_per_minute,
    enhanced_respiration_rate: record.enhanced_respiration_rate,
  };
}

function normalizeFitSets(sets = []) {
  return sets
    .map((set, index) => {
      const duration = nullableNumber(set.duration || set.total_timer_time || set.elapsed_time);
      const reps = nullableNumber(set.repetitions || set.reps);
      const type = `${set.category || set.type || ""}`.toLowerCase();
      return {
        reported_name: set.exercise_name || set.name || set.category || "Unknown",
        exercise_order: index + 1,
        sets_completed: 1,
        reps_per_set: {
          total: reps || 0,
          rest_seconds: type.includes("rest") ? duration || 0 : 0,
        },
        duration_seconds: type.includes("rest") ? 0 : Math.round(duration || 0),
        load_value: nullableNumber(set.weight),
        load_unit: set.weight ? "kg" : null,
        data_confidence: "reported",
      };
    })
    .filter((set) => set.duration_seconds || set.reps_per_set.total || set.reps_per_set.rest_seconds);
}

function normalizeReportedZones(timeInHrZone, durationSeconds, zonesTarget = {}, userProfile = {}) {
  if (!Array.isArray(timeInHrZone) || !timeInHrZone.length) return { source: "not_reported", zones: [] };
  const maxHeartRate = nullableNumber(
    zonesTarget?.max_heart_rate ??
      zonesTarget?.default_max_heart_rate ??
      userProfile?.default_max_heart_rate ??
      userProfile?.max_heart_rate,
  );
  const thresholds = maxHeartRate ? heartRateZoneThresholds(maxHeartRate) : null;
  const zones = timeInHrZone.slice(0, 6).map((seconds, index) => ({
    zone: index === 0 ? "below_z1" : `Z${index}`,
    seconds: Math.round(Number(seconds || 0)),
    time: formatDurationClock(seconds || 0),
    ...(thresholds?.[index === 0 ? "below_z1" : `Z${index}`] || {}),
  }));
  return {
    source: maxHeartRate ? "fit_reported_time_in_zone_with_zones_target" : "fit_reported_time_in_zone_without_thresholds",
    max_heart_rate: maxHeartRate,
    total_seconds: durationSeconds,
    zones,
  };
}

function resolveActivityHeartRateZones({ reported, profile, samples = [], durationSeconds = 0 }) {
  if (reportedHasThresholds(reported)) {
    return {
      ...reported,
      source: reported.source || "fit_session_zone_snapshot",
      total_seconds: reported.total_seconds || durationSeconds,
    };
  }

  const profileZones = normalizeHeartRateZoneProfile(profile);
  if (profileZones?.zones?.length) {
    if (samples.length) {
      return classifyHeartRateSamplesIntoZones(samples, profileZones, durationSeconds);
    }
    if (reported?.zones?.length) {
      return applyZoneThresholdsToReportedSeconds(reported, profileZones, durationSeconds);
    }
  }

  const reportedMaxProfile = normalizeHeartRateZoneProfile({
    source: reported?.source,
    max_heart_rate: reported?.max_heart_rate,
  });
  if (reportedMaxProfile?.zones?.length) {
    if (samples.length) {
      return classifyHeartRateSamplesIntoZones(samples, reportedMaxProfile, durationSeconds);
    }
    if (reported?.zones?.length) {
      return applyZoneThresholdsToReportedSeconds(reported, reportedMaxProfile, durationSeconds);
    }
  }

  return { source: "not_available", total_seconds: durationSeconds, zones: [] };
}

function reportedHasThresholds(reported) {
  return Array.isArray(reported?.zones) && reported.zones.some((zone) => nullableNumber(zone.min_bpm ?? zone.min_heart_rate_bpm) != null);
}

function normalizeHeartRateZoneProfile(profile) {
  if (!profile) return null;
  const zones = normalizeHeartRateZoneList(profile.zones);
  if (zones.length) {
    return {
      source: profile.source || "user_heart_rate_zone_profile",
      max_heart_rate: nullableNumber(profile.max_heart_rate),
      zones,
    };
  }

  const maxHeartRate = nullableNumber(profile.max_heart_rate ?? profile.default_max_heart_rate);
  if (!maxHeartRate) return null;
  return {
    source: profile.source || "user_max_heart_rate_profile",
    max_heart_rate: maxHeartRate,
    zones: Object.entries(heartRateZoneThresholds(maxHeartRate))
      .filter(([key]) => key !== "below_z1")
      .map(([zone, threshold]) => ({ zone, ...threshold })),
  };
}

function normalizeHeartRateZoneList(value) {
  const rawZones = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value).map(([zone, config]) => ({ zone, ...(config || {}) }))
      : [];

  return rawZones
    .map((zone, index) => {
      const key = zone.zone || zone.id || zone.label || `Z${index + 1}`;
      return {
        zone: `${key}`.toUpperCase().replace("ZONA ", "Z"),
        min_bpm: nullableNumber(zone.min_bpm ?? zone.min ?? zone.min_heart_rate_bpm),
        max_bpm: nullableNumber(zone.max_bpm ?? zone.max ?? zone.max_heart_rate_bpm),
      };
    })
    .filter((zone) => /^Z[1-5]$/.test(zone.zone) && zone.min_bpm != null)
    .sort((a, b) => Number(a.zone.slice(1)) - Number(b.zone.slice(1)));
}

function classifyHeartRateSamplesIntoZones(samples, profileZones, durationSeconds) {
  const secondsByZone = new Map(profileZones.zones.map((zone) => [zone.zone, 0]));
  const validSamples = samples
    .map((sample) => ({
      elapsed_seconds: nullableNumber(sample.elapsed_seconds),
      heart_rate_bpm: nullableNumber(sample.heart_rate_bpm),
    }))
    .filter((sample) => sample.elapsed_seconds != null && sample.heart_rate_bpm != null && sample.heart_rate_bpm >= 30 && sample.heart_rate_bpm <= 230)
    .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);
  const defaultSeconds = estimateSampleSeconds(validSamples);

  validSamples.forEach((sample, index) => {
    const zone = findHeartRateZone(sample.heart_rate_bpm, profileZones.zones);
    if (!zone) return;
    secondsByZone.set(zone.zone, secondsByZone.get(zone.zone) + sampleSecondsAt(validSamples, index, defaultSeconds));
  });

  return {
    source: `${profileZones.source}_classified_samples`,
    max_heart_rate: profileZones.max_heart_rate,
    total_seconds: durationSeconds,
    zones: profileZones.zones.map((zone) => ({
      ...zone,
      seconds: Math.round(secondsByZone.get(zone.zone) || 0),
    })),
  };
}

function applyZoneThresholdsToReportedSeconds(reported, profileZones, durationSeconds) {
  const secondsByZone = new Map((reported?.zones || []).map((zone) => [zone.zone, Number(zone.seconds || 0)]));
  return {
    source: `${profileZones.source}_with_fit_reported_seconds`,
    max_heart_rate: profileZones.max_heart_rate,
    total_seconds: reported?.total_seconds || durationSeconds,
    zones: profileZones.zones.map((zone) => ({
      ...zone,
      seconds: Math.round(secondsByZone.get(zone.zone) || 0),
    })),
  };
}

function findHeartRateZone(heartRate, zones) {
  return zones.find((zone) => heartRate >= Number(zone.min_bpm) && (zone.max_bpm == null || heartRate <= Number(zone.max_bpm)));
}

function sampleSecondsAt(samples, index, fallbackSeconds) {
  const current = Number(samples[index]?.elapsed_seconds);
  const next = Number(samples[index + 1]?.elapsed_seconds);
  const delta = next - current;
  if (Number.isFinite(delta) && delta > 0 && delta <= 30) return delta;
  return fallbackSeconds;
}

function heartRateZoneThresholds(maxHeartRate) {
  const z1Min = Math.round(maxHeartRate * 0.5);
  const z2Min = Math.round(maxHeartRate * 0.6);
  const z3Min = Math.round(maxHeartRate * 0.7);
  const z4Min = Math.round(maxHeartRate * 0.8);
  const z5Min = Math.round(maxHeartRate * 0.9);
  return {
    below_z1: { min_bpm: null, max_bpm: z1Min - 1 },
    Z1: { min_bpm: z1Min, max_bpm: z2Min - 1 },
    Z2: { min_bpm: z2Min, max_bpm: z3Min - 1 },
    Z3: { min_bpm: z3Min, max_bpm: z4Min - 1 },
    Z4: { min_bpm: z4Min, max_bpm: z5Min - 1 },
    Z5: { min_bpm: z5Min, max_bpm: null },
  };
}

function buildSessionMetrics(summary) {
  const rows = [
    ["duration_total_seconds", "Tiempo total", summary.duration_total_seconds, "s"],
    ["active_time", "Tiempo de trabajo", summary.duration_work_seconds, "s"],
    ["rest_time", "Tiempo de descanso", summary.duration_rest_seconds, "s"],
    ["avg_heart_rate", "Frecuencia cardíaca media", summary.heart_rate.avg_bpm, "bpm"],
    ["max_heart_rate", "Frecuencia cardíaca maxima", summary.heart_rate.max_bpm, "bpm"],
    ["respiration_avg_brpm", "Frecuencia respiratoria media", summary.respiration?.avg_brpm, "brpm"],
    ["respiration_max_brpm", "Frecuencia respiratoria máxima", summary.respiration?.max_brpm, "brpm"],
    ["respiration_min_brpm", "Frecuencia respiratoria mínima", summary.respiration?.min_brpm, "brpm"],
    ["calories_total", "Calorías totales", summary.calories.total_kcal, "kcal"],
    ["active_calories", "Calorías activas", summary.calories.active_kcal, "kcal"],
    ["resting_calories", "Calorías en reposo", summary.calories.rest_kcal, "kcal"],
    ["training_effect_aerobic", "Training Effect aeróbico", summary.training_effect.aerobic, ""],
    ["training_effect_anaerobic", "Training Effect anaeróbico", summary.training_effect.anaerobic, ""],
    ["exercise_load", "Carga de ejercicio", summary.training_effect.training_load, ""],
  ];
  return rows
    .filter(([, , value]) => value !== null && value !== undefined && value !== "")
    .map(([metric_code, metric_name, value_numeric, unit]) => ({
      metric_code,
      metric_name,
      value_numeric,
      unit,
      metric_scope: "session",
      source_path: "fit_file",
      confidence: "reported",
    }));
}

async function insertMetricRows(sessionId, rows) {
  if (!rows.length) return;
  await supabase.from("session_metrics").insert(rows.map((row) => ({ ...row, session_id: sessionId })));
}

async function insertSampleRows(sessionId, sourceId, rows) {
  const prepared = rows.map((row) => ({ ...row, session_id: sessionId, source_id: sourceId }));
  for (let index = 0; index < prepared.length; index += 500) {
    await supabase.from("session_samples").insert(prepared.slice(index, index + 500));
  }
}

async function insertExerciseRows(sessionId, rows) {
  if (!rows.length) return;
  await supabase.from("session_exercises").insert(rows.map((row) => ({ ...row, session_id: sessionId })));
}

async function backfillGarminRelationalRows(sessionId, { garminSets = [], sessionLaps = [] } = {}) {
  await insertGarminSetRowsIfEmpty(sessionId, garminSets);
  await insertSessionLapRowsIfEmpty(sessionId, sessionLaps);
}

async function insertGarminSetRowsIfEmpty(sessionId, rows) {
  if (!rows.length) return;
  const { count, error: countError } = await supabase
    .from("session_garmin_sets")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (countError) throw countError;
  if ((count || 0) > 0) return;

  const prepared = rows.map((row) => ({
    session_id: sessionId,
    source: row.source || "garmin_fit",
    series_order: row.series_order,
    garmin_exercise_name: row.garmin_exercise_name,
    start_elapsed_seconds: nullableInteger(row.start_elapsed_seconds),
    end_elapsed_seconds: nullableInteger(row.end_elapsed_seconds),
    duration_seconds: nullableInteger(row.duration_seconds),
    active_seconds: nullableInteger(row.active_seconds),
    rest_seconds: nullableInteger(row.rest_seconds),
    repetitions: nullableInteger(row.repetitions),
    load_value: nullableNumber(row.load_value),
    load_unit: row.load_unit || null,
    heart_rate_avg_bpm: nullableInteger(row.heart_rate_avg_bpm),
    heart_rate_max_bpm: nullableInteger(row.heart_rate_max_bpm),
    raw_payload: row.raw_payload || {},
    confidence: row.confidence || "derived",
  }));

  const { error } = await supabase.from("session_garmin_sets").insert(prepared);
  if (error) throw error;
}

async function insertSessionLapRowsIfEmpty(sessionId, rows) {
  if (!rows.length) return;
  const { count, error: countError } = await supabase
    .from("session_laps")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (countError) throw countError;
  if ((count || 0) > 0) return;

  const prepared = rows.map((row) => ({
    session_id: sessionId,
    lap_index: row.lap_index,
    source: row.source || "garmin_fit",
    start_elapsed_seconds: nullableInteger(row.start_elapsed_seconds),
    end_elapsed_seconds: nullableInteger(row.end_elapsed_seconds),
    duration_seconds: nullableInteger(row.duration_seconds),
    active_seconds: nullableInteger(row.active_seconds),
    rest_seconds: nullableInteger(row.rest_seconds),
    distance_meters: nullableNumber(row.distance_meters),
    heart_rate_avg_bpm: nullableInteger(row.heart_rate_avg_bpm),
    heart_rate_max_bpm: nullableInteger(row.heart_rate_max_bpm),
    raw_payload: row.raw_payload || {},
  }));

  const { error } = await supabase.from("session_laps").insert(prepared);
  if (error) throw error;
}

async function insertFitMessagePayloadRows(sessionId, sourceId, rows) {
  if (!rows.length) return;
  const { error: deleteError } = await supabase
    .from("fit_message_payloads")
    .delete()
    .eq("session_id", sessionId)
    .eq("source_id", sourceId)
    .eq("parser_version", "sport-elements-fit-parser-v1");
  if (deleteError) throw deleteError;

  const prepared = rows.map((row) => ({
    session_id: sessionId,
    source_id: sourceId,
    message_type: row.message_type,
    message_order: row.message_order,
    recorded_at: row.recorded_at,
    payload: row.payload,
    parser_version: "sport-elements-fit-parser-v1",
  }));

  for (let index = 0; index < prepared.length; index += 500) {
    const { error: insertError } = await supabase.from("fit_message_payloads").insert(prepared.slice(index, index + 500));
    if (insertError) throw insertError;
  }
}

function mergeGarminFitSummary(existingStructure, summary) {
  return {
    ...(existingStructure || {}),
    parser_version: "sport-elements-fit-parser-v1",
    garmin_fit_summary: summary,
  };
}

function mergeTags(existingTags, nextTags) {
  return [...new Set([...(existingTags || []), ...(nextTags || [])].filter(Boolean))];
}

function SmartCard({ title, value, unit, badge, progress }) {
  return (
    <article className="smartCard">
      <div className="smartHead">
        <span>{badge}</span>
        <ArrowUpRight size={15} />
      </div>
      <strong className="smartTitle">{title}</strong>
      <div className="smartValue">
        <b>{value}</b>
        {unit && <span>{unit}</span>}
      </div>
      <div className="smartProgress">
        <i style={{ width: `${Math.max(8, Math.min(100, Number(progress) || 50))}%` }} />
      </div>
    </article>
  );
}

function SessionList({ sessions }) {
  return (
    <div className="sessionList">
      {sessions.map((session) => (
        <article key={session.id}>
          <div className="sessionIcon">
            <ClipboardList size={17} />
          </div>
          <div>
            <strong>{session.title}</strong>
            <span>{session.type} · {session.date}{session.meta ? ` · ${session.meta}` : ""}</span>
          </div>
          <b>{session.score}</b>
        </article>
      ))}
    </div>
  );
}

function SectionLead({ icon: Icon, title, text }) {
  return (
    <section className="sectionLead">
      <div className="leadIcon">
        <Icon size={22} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

function PanelTitle({ label, title }) {
  return (
    <div className="panelTitle">
      {label && <span>{label}</span>}
      <h3>{title}</h3>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="infoRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildCoachReply(input, discipline, sessions = []) {
  const lower = input.toLowerCase();
  const intent = lower.includes("hyrox")
    ? "HYROX"
    : lower.includes("trail")
      ? "trail"
      : lower.includes("crossfit")
        ? "CrossFit"
        : discipline.label;
  const latestSession = sessions?.[0];

  if (latestSession?.id) {
    const duration = latestSession.duration_seconds ? formatDurationClock(latestSession.duration_seconds) : "";
    return `He registrado tu actualización. La última actividad disponible es ${latestSession.title}${duration ? ` (${duration})` : ""}. Cuéntame objetivo, sensación o molestias y lo afinamos desde ahí.`;
  }

  return `He registrado tu actualización para ${intent}. Cuando importes un FIT o sincronices datos, podré usar tu historial real para responder con más contexto.`;
}

function buildCoachFallbackReply(input, discipline, sessions = [], error) {
  const localReply = buildCoachReply(input, discipline, sessions);
  if (error === "openai_api_key_missing") {
    return `${localReply}\n\nModo local: el coach IA con contexto seguro todavía no está activado. Para el piloto manual, copia este mensaje y pégalo en ChatGPT.`;
  }
  if (error === "supabase_unavailable") {
    return `${localReply}\n\nModo local: la conexión con Supabase no está disponible en este entorno.`;
  }
  return `${localReply}\n\nModo local: no he podido consultar el endpoint coach-reply ahora mismo.`;
}

function computeHealthReadiness(health) {
  const components = [];
  if (health.body_battery_current != null) components.push({ value: Number(health.body_battery_current), weight: 0.42 });
  if (health.average_stress_level != null) components.push({ value: 100 - Number(health.average_stress_level), weight: 0.28 });
  if (health.resting_heart_rate_bpm != null) components.push({ value: Math.max(0, 100 - Math.abs(Number(health.resting_heart_rate_bpm) - 52) * 3), weight: 0.18 });
  if (health.spo2_avg_pct != null) components.push({ value: Math.min(100, Number(health.spo2_avg_pct)), weight: 0.12 });
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const score = totalWeight
    ? Math.round(components.reduce((sum, component) => sum + component.value * component.weight, 0) / totalWeight)
    : 0;

  if (score >= 78) {
    return {
      score,
      label: "Ready to build",
      training: "Intensidad controlada",
      copy: "El sistema está bastante limpio: energía útil, stress controlado y señales respiratorias estables.",
      plan: "Puedes entrenar, pero con una regla: calidad antes que volumen. Mantendría una sesión fuerte corta o técnica con salida fácil.",
    };
  }

  if (score >= 62) {
    return {
      score,
      label: "Train, but narrow",
      training: "Base + técnica",
      copy: "Hay energía suficiente, pero no conviene abrir demasiados frentes. Buen día para construir sin deuda.",
      plan: "Me quedaría en Zone 2, movilidad y fuerza limpia. Evitaría un metcon largo o competir contra el reloj.",
    };
  }

  return {
    score,
    label: "Recovery bias",
    training: "Recuperación activa",
    copy: "Las señales piden bajar coste: priorizar sueño, respiración y movimiento suave.",
    plan: "Hoy no compraría fatiga. Caminata, movilidad, respiración nasal y preparar mañana.",
  };
}

function buildSleepModel(health, sleepSession, hrvRows = []) {
  const hasSleepData = Boolean(sleepSession || health.sleep_score != null);
  const score = hasSleepData ? Math.round(Number(sleepSession?.sleep_score ?? health.sleep_score)) : null;
  const hrvSource = sleepSession?.hrv_last_night_avg_ms ?? hrvRows?.[0]?.last_night_avg_ms;
  const hasHrvData = hrvSource != null;
  const hrv = hasHrvData ? Math.round(Number(hrvSource)) : null;
  const durationSeconds = sleepSession?.total_duration_seconds;
  const stages = sleepSession
    ? [
        ["Deep", sleepSession.deep_sleep_seconds ?? 0],
        ["Light", sleepSession.light_sleep_seconds ?? 0],
        ["REM", sleepSession.rem_sleep_seconds ?? 0],
        ["Awake", sleepSession.awake_seconds ?? 0],
      ]
    : null;
  const totalStageSeconds = stages?.reduce((sum, [, seconds]) => sum + Number(seconds || 0), 0) || 0;

  return {
    hasSleepData,
    hasHrvData,
    score: score ?? 0,
    hrv,
    duration: durationSeconds ? formatDuration(durationSeconds) : "",
    quality: score > 80 ? "Buena" : score > 68 ? "Correcta" : "Ligera",
    note: score > 76 ? "La noche permite absorber carga moderada." : "La noche pide margen y menos intensidad.",
    stages: stages && totalStageSeconds
      ? stages.map(([label, seconds]) => ({
          label,
          value: Math.round((Number(seconds || 0) / totalStageSeconds) * 100),
          text: formatDuration(seconds || 0),
        }))
      : [],
  };
}

function buildEnergyCurve(health, bodyBatteryRows = []) {
  if (bodyBatteryRows?.length) {
    return sampleSeries(bodyBatteryRows, "body_battery_value", "recorded_at", 6).map((point) => ({
      label: formatHour(point.recorded_at),
      value: Math.round(Number(point.body_battery_value || 0)),
    }));
  }
  const current = Number(health.body_battery_current ?? 72);
  const charged = Number(health.body_battery_charged ?? 42);
  const drained = Number(health.body_battery_drained ?? 28);
  return [
    ["00", Math.max(24, current - charged + 16)],
    ["04", Math.max(34, current - 20)],
    ["08", Math.min(96, current + 14)],
    ["12", Math.max(30, current - drained * 0.32)],
    ["16", Math.max(24, current - drained * 0.55)],
    ["20", Math.max(18, current - drained * 0.78)],
  ].map(([label, value]) => ({ label, value: Math.round(value) }));
}

function buildHrvTrend(hrvRows = [], fallback) {
  if (hrvRows?.length) {
    return chronological(hrvRows)
      .map((row) => Number(row.last_night_avg_ms || 0))
      .filter(Boolean);
  }
  return fallback ? [fallback] : [];
}

function isArchivedSession(item) {
  return `${item?.session_status || ""}`.toLowerCase() === "archived";
}

function mapTrainingSession(item) {
  const summary = item.session_structure?.garmin_fit_summary || {};
  const heartRate = summary.heart_rate || {};
  const calories = summary.calories || {};
  const trainingEffect = summary.training_effect || {};
  const strengthTracking = summary.strength_tracking || {};
  const summaryMetrics = item.summary_metrics || {};
  const durationMinutes = item.duration_seconds ? Math.round(item.duration_seconds / 60) : null;
  const distanceKm = item.distance_meters ? Number(item.distance_meters) / 1000 : null;
  const score = Math.max(48, Math.min(96, 64 + (durationMinutes ? Math.min(20, durationMinutes / 4) : 8)));
  const title = repairMojibakeText(item.title || summary.garmin_original_name || summary.fit_identity?.garmin_original_name || summary.activity_type || cleanGarminTitle(item.title) || readableSessionTitle(item));

  return {
    id: item.id,
    user_id: item.user_id,
    title,
    type: item.session_kind || item.session_status || "session",
    duration_seconds: Number(item.duration_seconds || 0),
    distance_meters: Number(item.distance_meters || summary.distance_meters || 0),
    avg_hr: numberMetricFromObject(summaryMetrics, ["avg_heart_rate", "average_heart_rate"]) ?? heartRate.avg_bpm ?? null,
    max_hr: numberMetricFromObject(summaryMetrics, ["max_heart_rate", "maximum_heart_rate"]) ?? heartRate.max_bpm ?? null,
    calories_total: numberMetricFromObject(summaryMetrics, ["calories_total", "total_calories"]) ?? calories.total_kcal ?? null,
    training_effect_aerobic: numberMetricFromObject(summaryMetrics, ["training_effect_aerobic", "aerobic_training_effect"]) ?? trainingEffect.aerobic ?? null,
    training_effect_anaerobic: numberMetricFromObject(summaryMetrics, ["training_effect_anaerobic", "anaerobic_training_effect"]) ?? trainingEffect.anaerobic ?? null,
    garmin_sets_total: strengthTracking.garmin_sets_total ?? strengthTracking.set_messages ?? null,
    has_conversation: Boolean(item.session_structure?.executive_summary_table || item.session_structure?.conversation_summary || item.session_structure?.coach_blocks),
    started_at: item.started_at,
    local_date: item.local_date,
    created_at: item.created_at,
    source_id: item.source_id,
    external_reference: item.external_reference,
    tags: item.tags || [],
    session_structure: item.session_structure,
    summary_metrics: item.summary_metrics,
    session_status: item.session_status,
    score: Math.round(score),
    date: item.local_date || (item.started_at ? new Date(item.started_at).toLocaleDateString("es-ES") : "Recent"),
    meta: [durationMinutes ? `${durationMinutes} min` : null, distanceKm ? `${distanceKm.toFixed(1)} km` : null]
      .filter(Boolean)
      .join(" · "),
  };
}

function numberMetricFromObject(source = {}, keys = []) {
  for (const key of keys) {
    const value = source[key] ?? source[key.toLowerCase()] ?? source[key.toUpperCase()];
    const resolved = typeof value === "object" && value
      ? value.value_numeric ?? value.value ?? value.numeric ?? value.amount
      : value;
    const number = optionalNumber(resolved);
    if (number != null) return number;
  }
  return null;
}

function classifySession(session) {
  const garminType = normalizeGarminActivityType(session);
  const activityType = activityTypeFromGarminKey(garminType.key);
  return {
    ...session,
    activityType,
    garminActivityTypeKey: garminType.key,
    garminActivityTypeLabel: garminType.label,
    durationSeconds: Number(session.duration_seconds || parseDurationToSeconds(session.meta) || 3200),
  };
}

function normalizeGarminActivityType(session = {}) {
  const summary = session.session_structure?.garmin_fit_summary || {};
  return resolveGarminActivityType(summary, session);
}

function resolveGarminActivityType(summary = {}, session = {}) {
  const fitIdentity = summary.fit_identity || {};
  const hasGarminSource = hasGarminActivitySource(summary, session);
  const candidates = [
    combineGarminType(summary.sport, summary.sub_sport),
    combineGarminType(fitIdentity.sport, fitIdentity.sub_sport),
    summary.sub_sport,
    fitIdentity.sub_sport,
    summary.activity_type,
    fitIdentity.activity_type,
    summary.sport,
    fitIdentity.sport,
    session.garmin_activity_type,
    session.garminActivityType,
    hasGarminSource ? session.activity_type : null,
    session.sport,
    session.sub_sport,
    summary.garmin_original_name,
    fitIdentity.garmin_original_name,
    session.garmin_original_name,
    session.garmin_activity_label,
  ];

  for (const candidate of candidates) {
    const resolved = resolveGarminActivityCandidate(candidate);
    if (resolved) return resolved;
  }

  return { key: "other", label: "Otro", raw: null };
}

function hasGarminActivitySource(summary = {}, session = {}) {
  return Boolean(
    summary.activity_type ||
    summary.sport ||
    summary.sub_sport ||
    summary.fit_identity ||
    summary.garmin_original_name ||
    session.source_id ||
    session.external_reference ||
    session.fit_identity ||
    session.fit_checksum ||
    session.garmin_activity_type ||
    session.garminActivityType ||
    session.garmin_activity_label
  );
}

function combineGarminType(sport, subSport) {
  const parts = [sport, subSport].map(garminTypeText).filter(Boolean);
  return parts.length ? parts.join(" ") : "";
}

function resolveGarminActivityCandidate(value) {
  const raw = garminTypeText(value);
  if (!raw) return null;
  const normalized = normalizeActivityTypeKey(raw);
  if (!normalized) return null;

  const numericToken = normalized.match(/(?:^|_)(\d+)(?:_|$)/)?.[1];
  if (numericToken) {
    const mapped = GARMIN_NUMERIC_ACTIVITY_TYPES[numericToken];
    return mapped ? { key: mapped, label: activityTypeChipLabel(mapped), raw } : { key: "other", label: "Otro", raw };
  }
  if (isGenericGarminType(normalized)) return null;

  const canonical = canonicalGarminActivityType(normalized);
  return {
    key: canonical || "other",
    label: activityTypeChipLabel(canonical || "other", raw),
    raw,
  };
}

function garminTypeText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return repairMojibakeText(value.name || value.label || value.value || value.type || value.sport || value.sub_sport || JSON.stringify(value)).trim();
  }
  return repairMojibakeText(value).trim();
}

function isGenericGarminType(normalized) {
  return ["activity", "actividad", "generic", "unknown", "undefined", "null", "none", "sin_clasificar"].includes(normalized);
}

function canonicalGarminActivityType(normalized) {
  for (const [canonical, aliases] of GARMIN_ACTIVITY_ALIASES) {
    if (aliases.some((alias) => matchesGarminActivityAlias(normalized, alias))) return canonical;
  }
  return "";
}

function matchesGarminActivityAlias(normalized, alias) {
  if (normalized === alias) return true;
  const exactOnly = new Set(["training", "workout", "cardio", "interval", "trail", "swimming", "bike", "run"]);
  if (exactOnly.has(alias)) return false;
  return normalized.startsWith(`${alias}_`) || normalized.endsWith(`_${alias}`) || normalized.includes(`_${alias}_`);
}

function normalizeActivityTypeKey(value) {
  return repairMojibakeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "activity";
}

function activityTypeFromGarminKey(key = "") {
  const text = normalizeActivityTypeKey(key);
  if (text.includes("trail")) return "trail";
  if (text.includes("running") || text === "run") return "run";
  if (text.includes("swim")) return "swim";
  if (text.includes("cycling")) return "cycling";
  if (text.includes("multisport")) return "multisport";
  if (text.includes("strength") || text.includes("fuerza") || text.includes("weight") || text.includes("fitness_equipment")) return "strength";
  if (text.includes("yoga")) return "yoga";
  if (text.includes("pilates")) return "pilates";
  if (text.includes("hiit") || text.includes("cardio") || text.includes("interval") || text.includes("workout")) return "hiit";
  if (text === "other") return "other";
  return "hybrid";
}

function buildActivityTypeFilterOptions(sessions = []) {
  return GARMIN_PRIMARY_ACTIVITY_FILTERS;
}

function activityTypeChipLabel(key, raw) {
  const normalized = normalizeActivityTypeKey(key || raw);
  const labels = {
    ...Object.fromEntries(GARMIN_PRIMARY_ACTIVITY_FILTERS),
    hiit: "HIIT",
    strength_training: "Fuerza",
    strength: "Fuerza",
    running: "Carrera",
    run: "Carrera",
    trail_running: "Trail running",
    swimming: "Natación",
    lap_swimming: "Natación en piscina",
    pool_swimming: "Natación en piscina",
    multisport: "Multideporte",
    cycling: "Ciclismo",
    yoga: "Yoga",
    pilates: "Pilates",
    other: "Otro",
  };
  if (labels[normalized]) return labels[normalized];
  if (/^\d+$/.test(normalized)) return "Otro";
  return repairMojibakeText(raw || normalized)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildActivityWeek(sessions) {
  const anchor = getWeekAnchor(sessions);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      label: ["D", "L", "M", "X", "J", "V", "S"][date.getDay()],
      items: [],
      totalSeconds: 0,
    };
  });
  sessions.forEach((session) => {
    const date = session.started_at ? new Date(session.started_at) : null;
    const dayIndex = date ? Math.floor((startOfDay(date) - start) / 86400000) : -1;
    const target = week[dayIndex];
    if (!target) return;
    target.items.push(session);
    target.totalSeconds += Number(session.duration_seconds || session.durationSeconds || 0);
  });
  return week;
}

function buildActivityPeriod(viewMode, date) {
  if (viewMode === "week") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return { start, end, dayCount: 7 };
  }
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return { start, end, dayCount: end.getDate() };
}

function shiftActivityPeriod(date, viewMode, direction) {
  const next = new Date(date);
  if (viewMode === "week") next.setDate(next.getDate() + direction * 7);
  else next.setMonth(next.getMonth() + direction);
  return startOfDay(next);
}

function buildActivityWeekForPeriod(start, sessions) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    const items = sessions.filter((session) => sessionDateKey(session) === key);
    return {
      date,
      label: ["D", "L", "M", "X", "J", "V", "S"][date.getDay()],
      items,
      totalSeconds: items.reduce((sum, item) => sum + sessionDurationSeconds(item), 0),
    };
  });
}

function buildActivityMonthGrid(monthStart, sessions) {
  const first = startOfMonth(monthStart);
  const last = endOfMonth(monthStart);
  const leading = (first.getDay() + 6) % 7;
  const blanks = Array.from({ length: leading }, (_, index) => ({ key: `blank-${index}`, date: null, items: [] }));
  const days = Array.from({ length: last.getDate() }, (_, index) => {
    const date = new Date(first);
    date.setDate(index + 1);
    const key = dateKey(date);
    return {
      key,
      date,
      items: sessions.filter((session) => sessionDateKey(session) === key),
    };
  });
  return [...blanks, ...days];
}

function matchesActivityFilters(item, sourceFilter, typeFilter) {
  if (item.kind === "planned") {
    const sourceMatch = sourceFilter === "all" || sourceFilter === "planned";
    const typeMatch = typeFilter === "all" || item.typeKey === typeFilter || item.garminActivityTypeKey === typeFilter;
    return sourceMatch && typeMatch;
  }
  if (item.kind === "planned_completed") {
    const sourceMatch = sourceFilter === "all" || ["garmin", "planned", "mixed"].includes(sourceFilter);
    const typeMatch = typeFilter === "all" || item.typeKey === typeFilter || item.garminActivityTypeKey === typeFilter;
    return sourceMatch && typeMatch;
  }
  const hasCoach = Boolean(item.has_conversation);
  const hasGarmin = Boolean(item.source_id || item.external_reference || item.fit_identity || item.garmin_sets_total || item.garmin_reps_total || item.session_structure?.garmin_fit_summary);
  const sourceMatch = sourceFilter === "all" ||
    (sourceFilter === "garmin" && hasGarmin) ||
    (sourceFilter === "coach" && hasCoach) ||
    (sourceFilter === "mixed" && hasGarmin && hasCoach);
  const typeMatch = typeFilter === "all" || item.garminActivityTypeKey === typeFilter;
  return sourceMatch && typeMatch;
}

function isDateWithinPeriod(key, period) {
  const date = new Date(`${key}T12:00:00`);
  return date >= period.start && date <= period.end;
}

function summarizeActivityPeriod(items, dayCount) {
  const totalSeconds = items.reduce((sum, item) => sum + sessionDurationSeconds(item), 0);
  const activeDays = new Set(items.map(sessionDateKey)).size;
  return {
    totalSeconds,
    averageSeconds: activeDays ? Math.round(totalSeconds / activeDays) : 0,
    sessions: items.length,
    activeDays,
    dayCount,
  };
}

function sortSessionsChronological(a, b) {
  return calendarSortTimestamp(a).localeCompare(calendarSortTimestamp(b));
}

function calendarSortTimestamp(item = {}) {
  return item.started_at || item.planned_at || item.created_at || `${item.local_date || item.date || ""}T${item.time || "23:59"}:00`;
}

function sessionDurationSeconds(item) {
  return Number(item.duration_seconds || item.durationSeconds || 0);
}

function activityViewLabel(viewMode) {
  return { week: "Semana", month: "Mes" }[viewMode] || "Semana";
}

function formatActivityPeriodTitle(viewMode, period) {
  if (viewMode === "week") {
    const day = new Intl.DateTimeFormat("es-ES", { day: "numeric" });
    const month = new Intl.DateTimeFormat("es-ES", { month: "short" });
    const sameMonth = period.start.getMonth() === period.end.getMonth();
    const startLabel = sameMonth ? day.format(period.start) : `${day.format(period.start)} ${month.format(period.start)}`;
    return `Semana ${startLabel}–${day.format(period.end)} ${month.format(period.end)} ${period.end.getFullYear()}`;
  }
  const month = new Intl.DateTimeFormat("es-ES", { month: "long" }).format(period.start);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${period.start.getFullYear()}`;
}

function formatActivityDayFilterLabel(viewMode, period, selectedDates = []) {
  if (!selectedDates.length) {
    return {
      eyebrow: "Periodo",
      title: viewMode === "week" ? "Mostrando toda la semana" : "Mostrando todo el mes",
    };
  }
  return {
    eyebrow: "Filtro por día",
    title: `Filtrado: ${formatSelectedDayList(selectedDates, period)}`,
  };
}

function formatSelectedDayList(keys, period) {
  const dates = keys.map((key) => new Date(`${key}T12:00:00`)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return "";
  const sameMonth = dates.every((date) => date.getMonth() === dates[0].getMonth() && date.getFullYear() === dates[0].getFullYear());
  if (sameMonth) {
    const days = dates.map((date) => new Intl.DateTimeFormat("es-ES", { day: "numeric" }).format(date));
    const month = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(dates[0]);
    return `${joinSpanishList(days)} ${month}`;
  }
  if (period && dates.every((date) => date.getFullYear() === period.start.getFullYear())) {
    return joinSpanishList(dates.map(formatCompactDayLabel));
  }
  return joinSpanishList(dates.map((date) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(date)));
}

function formatCompactDayLabel(value) {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

function joinSpanishList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function formatSessionCount(count) {
  return `${count} ${count === 1 ? "sesión" : "sesiones"}`;
}

function activityTrainingSubtitle(activityType) {
  return {
    hybrid: "Entrenamiento híbrido",
    hiit: "Entrenamiento híbrido",
    strength: "Entrenamiento de fuerza",
    run: "Running",
    trail: "Trail",
    swim: "Natación",
    yoga: "Yoga",
    pilates: "Yoga / movilidad",
  }[activityType] || "Entrenamiento";
}

function sessionDateKey(session) {
  if (session.local_date) return session.local_date;
  if (session.started_at) return new Date(session.started_at).toISOString().slice(0, 10);
  if (session.created_at) return new Date(session.created_at).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function groupSessionsByDay(sessions) {
  const grouped = sessions.reduce((acc, item) => {
    const key = sessionDateKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => `${b.started_at || b.created_at || ""}`.localeCompare(`${a.started_at || a.created_at || ""}`)),
    }));
}

function formatDateLong(value) {
  if (!value) return "Sin fecha";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function formatDateLongWithYear(value) {
  if (!value) return "Sin fecha";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatActivityTime(item) {
  const value = item.started_at || item.created_at;
  if (!value) return item.date || "Sin hora";
  return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatActivityDateTime(startedAt, localDate) {
  const date = startedAt ? new Date(startedAt) : localDate ? new Date(`${localDate}T12:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return "Sin fecha";
  const formattedDate = date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const formattedTime = startedAt ? date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
  return [formattedDate, formattedTime].filter(Boolean).join(" · ");
}

function garminBlockColor(order) {
  return ["#8df018", "#25a9ff", "#ff3b35", "#d7dde2", "#ff981f"][Math.max(0, Number(order || 1) - 1) % 5];
}

function formatGarminBlockMeta(block) {
  const parts = [];
  if (block.rest_seconds != null && block.rest_seconds > 0) parts.push(`Descanso ${formatDurationClock(block.rest_seconds)}`);
  if (block.repetitions != null) parts.push(`${formatNumberValue(block.repetitions)} reps`);
  if (block.calories != null) parts.push(`${formatNumberValue(block.calories)} kcal`);
  if (block.distance_meters != null && block.distance_meters > 0) parts.push(`${Math.round(block.distance_meters)} m`);
  return parts.length ? parts.join(" · ") : "Segmento objetivo";
}

function downsampleRespirationSamples(samples, maxPoints) {
  if (samples.length <= maxPoints) return samples;
  const ratio = Math.ceil(samples.length / maxPoints);
  const sampled = [];
  for (let index = 0; index < samples.length; index += ratio) {
    const bucket = samples.slice(index, index + ratio);
    if (!bucket.length) continue;
    const min = bucket.reduce((best, point) => (point.respiration_brpm < best.respiration_brpm ? point : best), bucket[0]);
    const max = bucket.reduce((best, point) => (point.respiration_brpm > best.respiration_brpm ? point : best), bucket[0]);
    sampled.push(...[min, max].sort((a, b) => a.elapsed_seconds - b.elapsed_seconds));
  }
  return sampled;
}

function getWeekAnchor(sessions) {
  const dates = sessions
    .map((session) => (session.started_at ? new Date(session.started_at) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()));
  if (!dates.length) return startOfDay(new Date());
  return startOfDay(new Date(Math.max(...dates.map((date) => date.getTime()))));
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateKey(date) {
  const copy = startOfDay(date);
  const year = copy.getFullYear();
  const month = `${copy.getMonth() + 1}`.padStart(2, "0");
  const day = `${copy.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return startOfDay(copy);
}

function startOfWeek(date) {
  const copy = startOfDay(date);
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function startOfMonth(date) {
  const copy = startOfDay(date);
  copy.setDate(1);
  return copy;
}

function endOfMonth(date) {
  const copy = startOfMonth(date);
  copy.setMonth(copy.getMonth() + 1);
  copy.setDate(0);
  return startOfDay(copy);
}

function formatWeekRange(week) {
  if (!week?.length) return "";
  const formatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
  return `${formatter.format(week[0].date)} - ${formatter.format(week[week.length - 1].date)}`;
}

function cleanGarminTitle(title) {
  const match = `${title || ""}`.match(/Actividad Garmin - ([^-]+) -/);
  if (!match) return "";
  return match[1]
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function originalGarminTitle(session = {}, summary = {}) {
  return (
    summary.garmin_original_name ||
    summary.fit_identity?.garmin_original_name ||
    summary.fit_identity?.fingerprint_fields?.activity_name ||
    cleanGarminTitle(session.title) ||
    summary.activity_type ||
    readableSessionTitle(session)
  );
}

function garminActivityName({ fit = {}, session = {}, sport = {}, fallback = "Actividad Garmin" }) {
  const candidates = [
    fit.activity?.name,
    fit.activity?.activity_name,
    session.name,
    session.activity_name,
    session.sport_profile_name,
    sport.name,
    fallback,
  ];
  return candidates.map(fitValueText).find((value) => value && value !== "{}") || fallback;
}

function classifyActivityTypeFromSummary(summary = {}, session = {}) {
  return classifySession({
    ...session,
    title: summary.activity_type || session.title,
    session_structure: { garmin_fit_summary: summary },
  }).activityType;
}

function benefitFromTrainingEffect(trainingEffect = {}) {
  const aerobic = Number(trainingEffect.aerobic || 0);
  const anaerobic = Number(trainingEffect.anaerobic || 0);
  if (aerobic < 1 && anaerobic < 1) return "Base (Aeróbica baja)";
  if (anaerobic > aerobic) return "Sprint (Anaeróbico)";
  if (aerobic >= 2.5) return "Mejora aeróbica";
  return "Base (Aeróbica)";
}

function parseDurationToSeconds(meta) {
  const match = `${meta || ""}`.match(/(\d+)\s*min/);
  return match ? Number(match[1]) * 60 : 0;
}

function formatDurationLong(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}` : `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function indexMetrics(metrics) {
  return metrics.reduce((acc, metric) => {
    const key = metric.metric_code || metric.metric_name;
    if (key) acc[key.toLowerCase()] = metric;
    return acc;
  }, {});
}

function numberMetric(metrics, keys, fallback) {
  const found = keys.map((key) => metrics[key.toLowerCase()]).find(Boolean);
  if (!found) return fallback;
  const value = found.value_numeric ?? found.value_json?.value;
  return value == null ? fallback : Number(value);
}

function roundOptionalMetric(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : Math.round(number);
}

function textMetric(metrics, keys, fallback) {
  const found = keys.map((key) => metrics[key.toLowerCase()]).find(Boolean);
  return found?.value_text || found?.value_json?.text || fallback;
}

function getActivityTimeMetrics(session, metrics, blocks = [], summary = {}, fallbackDuration = 0, fitSessionPayload = {}, objectiveRows = []) {
  const objectiveTime = timeMetricsFromObjectiveRows(objectiveRows.length ? objectiveRows : objectiveRowsFromSummary(summary), fallbackDuration);
  if (objectiveTime.activeSeconds != null || objectiveTime.restSeconds != null) {
    return {
      totalSeconds: objectiveTime.totalSeconds ?? Math.round(Number(fallbackDuration || 0)),
      activeSeconds: objectiveTime.activeSeconds,
      restSeconds: objectiveTime.restSeconds,
      source: "garmin_objective_segments",
      confidence: "reported",
    };
  }

  const fitTime = timeMetricsFromFitSessionPayload(fitSessionPayload);
  const totalSeconds = Number(fitTime.totalSeconds || summary.duration_elapsed_seconds || summary.duration_total_seconds || session.duration_seconds || fallbackDuration || 0);
  if (fitTime.activeSeconds != null || fitTime.restSeconds != null) {
    return {
      totalSeconds,
      activeSeconds: fitTime.activeSeconds,
      restSeconds: fitTime.restSeconds,
      source: "fit_session_message",
      confidence: "reported",
    };
  }

  const metricActive = numberMetric(metrics, ["active_time", "work_time", "moving_time", "total_timer_time"], null);
  const metricRest = numberMetric(metrics, ["rest_time", "elapsed_rest_time", "total_rest_time"], null);
  const summaryActive = summary.duration_work_seconds;
  const summaryRest = summary.duration_rest_seconds;
  const activeCandidate = validDuration(summaryActive) ? Number(summaryActive) : validDuration(metricActive) ? Number(metricActive) : null;
  const rawRestCandidate = validDuration(summaryRest) ? Number(summaryRest) : validDuration(metricRest) ? Number(metricRest) : null;
  const restCandidate = rawRestCandidate === 0 && activeCandidate != null && totalSeconds > activeCandidate
    ? totalSeconds - activeCandidate
    : rawRestCandidate;

  if (activeCandidate != null || restCandidate != null) {
    return {
      totalSeconds,
      activeSeconds: activeCandidate == null ? null : Math.round(activeCandidate),
      restSeconds: restCandidate == null ? (activeCandidate != null && totalSeconds >= activeCandidate ? Math.round(totalSeconds - activeCandidate) : null) : Math.round(restCandidate),
      source: "garmin_metrics",
      confidence: "reported",
    };
  }

  const reconciledBlocks = blocks.filter((block) =>
    block.data_confidence === "manual" &&
    (
      ["garmin_set_direct", "garmin_lap_direct", "garmin_segment_direct"].includes(block.temporal_metrics_source) ||
      block.temporal_metrics_source === "user_confirmed_estimate"
    ) &&
    ["high", "review", "user_confirmed"].includes(block.temporal_metrics_confidence),
  );
  const blockActive = sumNumeric(reconciledBlocks.map((block) => block.active_seconds));
  const blockRest = sumNumeric(reconciledBlocks.map((block) => block.rest_seconds));
  const blockTotal = blockActive + blockRest;
  const hasBlockRestData = reconciledBlocks.some((block) => validDuration(block.rest_seconds));

  if (reconciledBlocks.length && blockActive > 0) {
    return {
      totalSeconds: hasBlockRestData ? Math.round(blockTotal) : totalSeconds || null,
      activeSeconds: Math.round(blockActive),
      restSeconds: hasBlockRestData ? Math.round(blockRest) : null,
      source: "reconciled_garmin_blocks",
      confidence: "derived_from_garmin_sets",
    };
  }

  return {
    totalSeconds,
    activeSeconds: null,
    restSeconds: null,
    source: "session_duration_only",
    confidence: "partial",
  };
}

function objectiveRowsFromSummary(summary = {}) {
  if (Array.isArray(summary.splits) && summary.splits.length) return summary.splits;
  if (Array.isArray(summary.laps) && summary.laps.length) return summary.laps;
  if (Array.isArray(summary.split_summaries) && summary.split_summaries.length) return summary.split_summaries;
  return [];
}

function timeMetricsFromObjectiveRows(rows = [], fallbackTotal = null) {
  const parts = rows
    .map(garminObjectiveTimeParts)
    .filter((part) => part.active != null || part.rest != null || part.total != null);
  const usable = parts.filter((part) => part.active != null || part.rest != null);
  if (!usable.length) return { totalSeconds: null, activeSeconds: null, restSeconds: null };
  const active = sumNumeric(usable.map((part) => part.active));
  const rest = sumNumeric(usable.map((part) => part.rest));
  const totalFromRows = sumNumeric(usable.map((part) => part.total));
  const total = totalFromRows || active + rest || optionalNumber(fallbackTotal);
  return {
    totalSeconds: total == null ? null : Math.round(total),
    activeSeconds: active > 0 ? Math.round(active) : null,
    restSeconds: rest >= 0 ? Math.round(rest) : null,
  };
}

function garminObjectiveTimeParts(row = {}) {
  const raw = row.raw_payload || row.payload || row;
  const active = optionalNumber(firstPresent(raw, ["active_seconds", "active_time", "work_seconds"]) ?? row.active_seconds ?? row.active_time);
  const timer = optionalNumber(firstPresent(raw, ["total_timer_time", "total_timer_time_seconds", "timer_time"]) ?? row.total_timer_time ?? row.timer_time);
  const elapsed = optionalNumber(firstPresent(raw, ["duration_seconds", "total_elapsed_time", "total_elapsed_time_seconds", "elapsed_time", "duration"]) ?? row.duration_seconds ?? row.elapsed_time);
  const explicitRest = optionalNumber(firstPresent(raw, ["rest_seconds", "total_rest_time", "elapsed_rest_time"]) ?? row.rest_seconds);
  const total = active != null
    ? timer ?? elapsed ?? active
    : elapsed ?? timer ?? optionalNumber(row.duration_seconds);
  const resolvedActive = active ?? timer ?? total;
  const rest = explicitRest ?? (total != null && resolvedActive != null && total >= resolvedActive ? total - resolvedActive : null);
  return {
    total,
    active: resolvedActive,
    rest,
  };
}

function timeMetricsFromFitSessionPayload(payload = {}, fallbackDuration = 0) {
  const elapsed = optionalNumber(payload.total_elapsed_time ?? payload.total_elapsed_time_seconds ?? payload.elapsed_time ?? payload.duration_seconds);
  const active = optionalNumber(payload.total_timer_time ?? payload.total_timer_time_seconds ?? payload.timer_time ?? payload.active_time);
  const total = elapsed ?? optionalNumber(fallbackDuration) ?? active;
  const rest = optionalNumber(payload.total_rest_time ?? payload.elapsed_rest_time ?? payload.rest_seconds) ??
    (total != null && active != null && total >= active ? total - active : null);
  return {
    totalSeconds: total == null ? null : Math.round(total),
    activeSeconds: active == null ? null : Math.round(active),
    restSeconds: rest == null ? null : Math.round(rest),
  };
}

function getFluidLossMl(summary = {}, metrics = {}) {
  const metricValue = numberMetric(metrics, [
    "estimated_sweat_loss_ml",
    "sweat_loss_ml",
    "fluid_loss_ml",
    "dehydration_ml",
    "estimated_fluid_loss_ml",
  ], null);
  const summaryValue =
    summary.hydration?.estimated_fluid_loss_ml ??
    summary.estimated_sweat_loss_ml ??
    summary.sweat_loss_ml ??
    summary.fluid_loss_ml ??
    null;
  const value = optionalNumber(metricValue ?? summaryValue);
  return value && value > 0 ? Math.round(value) : undefined;
}

function sumNumeric(values) {
  return values.reduce((sum, value) => {
    const number = Number(value);
    return Number.isNaN(number) ? sum : sum + number;
  }, 0);
}

function validDuration(value) {
  if (value == null || value === "") return false;
  const number = Number(value);
  return !Number.isNaN(number) && number >= 0;
}

function mapExercises(rows) {
  if (!rows.length) return [];
  return rows.map((row, index) => ({
    set: `Recorrido ${index + 1}`,
    name: row.reported_name || "Unknown",
    active_seconds: Number(row.duration_seconds || 0),
    rest_seconds: Number(row.reps_per_set?.rest_seconds || row.reps_per_set?.rest || 0),
    reps: extractReps(row.reps_per_set),
    weight: row.load_value ? `${row.load_value} ${row.load_unit || "kg"}` : "N/D",
  }));
}

function mapGarminSeries(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row, index) => ({
    id: row.id || `garmin-series-${row.series_order || row.order || index + 1}`,
    order: row.series_order ?? row.set_order ?? row.order ?? index + 1,
    name: row.garmin_exercise_name || row.exercise_name || row.name || "N/D",
    duration_seconds: optionalNumber(row.duration_seconds),
    active_seconds: optionalNumber(row.active_seconds ?? row.work_seconds),
    rest_seconds: optionalNumber(row.rest_seconds),
    repetitions: optionalNumber(row.repetitions ?? row.reps),
    load_label: row.load_value ? `${formatNumberValue(row.load_value)} ${row.load_unit || "kg"}` : null,
    heart_rate_avg_bpm: optionalNumber(row.heart_rate_avg_bpm ?? row.avg_heart_rate),
    heart_rate_max_bpm: optionalNumber(row.heart_rate_max_bpm ?? row.max_heart_rate),
    confidence: row.confidence || row.temporal_metrics_confidence || "reported",
  }));
}

function mapGarminObjectiveBlocks({ laps = [], summary = {}, samples = [], zones = [] }) {
  const relationalRows = Array.isArray(laps) ? laps : [];
  const fallbackRows = relationalRows.length ? [] : fallbackGarminLapRows(summary);
  const sourceRows = relationalRows.length ? relationalRows : fallbackRows;
  if (!sourceRows.length) return [];

  return sourceRows.map((row, index) => {
    const raw = row.raw_payload || row.payload || {};
    const start = optionalNumber(row.start_elapsed_seconds);
    const time = garminObjectiveTimeParts({ ...row, raw_payload: raw });
    const duration = optionalNumber(time.total);
    const end = optionalNumber(row.end_elapsed_seconds) ?? (start != null && duration != null ? start + duration : null);
    const active = optionalNumber(time.active);
    const rest = optionalNumber(time.rest);
    const hr = heartRateStatsForWindow(samples, start, end, {
      avg: row.heart_rate_avg_bpm ?? raw.avg_heart_rate ?? raw.average_heart_rate,
      max: row.heart_rate_max_bpm ?? raw.max_heart_rate ?? raw.maximum_heart_rate,
    });
    const respiration = respirationStatsForWindow(samples, start, end, raw._enqidu_computed);
    const zoneTimes = computeZoneDurationsForWindow(samples, zones, start, end, duration);
    const order = index + 1;
    return {
      id: row.id || `garmin-block-${order}`,
      order,
      source: row.source || raw.source || (relationalRows.length ? "garmin_fit_lap" : "garmin_fit_summary"),
      name: garminBlockName(raw, row.source, order),
      start_elapsed_seconds: start,
      end_elapsed_seconds: end,
      duration_seconds: duration,
      active_seconds: active,
      rest_seconds: rest,
      repetitions: optionalNumber(raw.repetitions ?? raw.reps ?? raw.num_reps),
      calories: optionalNumber(raw.total_calories ?? raw.calories ?? raw.active_calories),
      distance_meters: optionalNumber(row.distance_meters ?? raw.total_distance ?? raw.distance),
      heart_rate_avg_bpm: hr.avg,
      heart_rate_max_bpm: hr.max,
      respiration_avg_brpm: respiration.avg,
      respiration_max_brpm: respiration.max,
      zones: zoneTimes,
      association_status: null,
    };
  });
}

function fallbackGarminLapRows(summary = {}) {
  if (Array.isArray(summary.laps) && summary.laps.length) {
    return lapRowsFromRows(summary.laps, "garmin_fit_lap", summary.start_time_utc);
  }
  if (Array.isArray(summary.splits) && summary.splits.length) {
    return lapRowsFromRows(summary.splits, "garmin_fit_split", summary.start_time_utc);
  }
  if (Array.isArray(summary.split_summaries) && summary.split_summaries.length) {
    return lapRowsFromRows(summary.split_summaries, "garmin_fit_split_summary", summary.start_time_utc);
  }
  return [];
}

function garminBlockName(raw = {}, source = "", order = 1) {
  const name = firstPresent(raw, ["name", "exercise_name", "category", "sport", "sub_sport"]);
  if (name) return fitValueText(name).replaceAll("_", " ");
  const sourceText = `${source || ""}`;
  if (sourceText.includes("split")) return `Split Garmin ${order}`;
  if (sourceText.includes("lap")) return `Vuelta Garmin ${order}`;
  return `Bloque Garmin ${order}`;
}

function buildRespirationModel(samples = [], summary = {}, metrics = {}) {
  const respirationSamples = samples
    .map((sample) => ({
      elapsed_seconds: optionalNumber(sample.elapsed_seconds),
      respiration_brpm: sampleRespirationValue(sample),
    }))
    .filter((sample) => sample.elapsed_seconds != null && sample.respiration_brpm != null && sample.respiration_brpm > 0)
    .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);
  const values = respirationSamples.map((sample) => sample.respiration_brpm);
  const summaryRespiration = summary.respiration || {};
  const avg = values.length
    ? Math.round(average(values))
    : roundOptionalMetric(numberMetric(metrics, [
      "respiration_avg_brpm",
      "avg_respiration_rate",
      "average_respiration_rate",
      "enhanced_avg_respiration_rate",
    ], summaryRespiration.avg_brpm ?? summaryRespiration.average_brpm ?? summaryRespiration.enhanced_avg_brpm ?? null));
  const max = values.length
    ? Math.round(Math.max(...values))
    : roundOptionalMetric(numberMetric(metrics, [
      "respiration_max_brpm",
      "max_respiration_rate",
      "maximum_respiration_rate",
      "enhanced_max_respiration_rate",
    ], summaryRespiration.max_brpm ?? summaryRespiration.maximum_brpm ?? summaryRespiration.enhanced_max_brpm ?? null));
  const min = values.length
    ? Math.round(Math.min(...values))
    : roundOptionalMetric(numberMetric(metrics, [
      "respiration_min_brpm",
      "min_respiration_rate",
      "minimum_respiration_rate",
      "enhanced_min_respiration_rate",
    ], summaryRespiration.min_brpm ?? summaryRespiration.minimum_brpm ?? summaryRespiration.enhanced_min_brpm ?? null));
  return { samples: respirationSamples, avg, max, min };
}

function respirationFromFitSessionPayload(payload = {}) {
  return {
    avg: roundOptionalMetric(firstPresent(payload, ["enhanced_avg_respiration_rate", "avg_respiration_rate", "average_respiration_rate"])),
    max: roundOptionalMetric(firstPresent(payload, ["enhanced_max_respiration_rate", "max_respiration_rate", "maximum_respiration_rate"])),
    min: roundOptionalMetric(firstPresent(payload, ["enhanced_min_respiration_rate", "min_respiration_rate", "minimum_respiration_rate"])),
  };
}

function sampleRespirationValue(sample = {}) {
  return optionalNumber(
    sample.respiration_brpm ??
    sample.respiration_rate_brpm ??
    firstPresent(sample.raw_payload || {}, [
      "respiration_brpm",
      "respiration_rate",
      "respiratory_rate",
      "breathing_rate",
      "breaths_per_minute",
      "enhanced_respiration_rate",
      "respiration_rate_bpm",
    ]),
  );
}

function heartRateStatsForWindow(samples = [], start, end, fallback = {}) {
  const values = samples
    .filter((sample) => withinWindow(sample.elapsed_seconds, start, end))
    .map((sample) => optionalNumber(sample.heart_rate_bpm))
    .filter((value) => value != null && value >= 30 && value <= 230);
  return {
    avg: values.length ? Math.round(average(values)) : roundOptionalMetric(fallback.avg),
    max: values.length ? Math.round(Math.max(...values)) : roundOptionalMetric(fallback.max),
  };
}

function respirationStatsForWindow(samples = [], start, end, fallback = {}) {
  const values = samples
    .filter((sample) => withinWindow(sample.elapsed_seconds, start, end))
    .map(sampleRespirationValue)
    .filter((value) => value != null && value > 0 && value < 80);
  return {
    avg: values.length ? Math.round(average(values)) : roundOptionalMetric(fallback?.respiration_avg_brpm),
    max: values.length ? Math.round(Math.max(...values)) : roundOptionalMetric(fallback?.respiration_max_brpm),
  };
}

function computeZoneDurationsForWindow(samples = [], zones = [], start, end, durationSeconds = null) {
  const total = Math.max(1, optionalNumber(durationSeconds) ?? (start != null && end != null ? end - start : 0));
  const secondsByZone = new Map(zones.map((zone) => [zone.key || zone.label, 0]));
  const validSamples = samples
    .map((sample) => ({
      elapsed_seconds: optionalNumber(sample.elapsed_seconds),
      heart_rate_bpm: optionalNumber(sample.heart_rate_bpm),
    }))
    .filter((sample) => withinWindow(sample.elapsed_seconds, start, end) && sample.heart_rate_bpm != null)
    .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);
  const defaultSeconds = estimateSampleSeconds(validSamples);

  validSamples.forEach((sample, index) => {
    const zone = zones.find((item) => sample.heart_rate_bpm >= Number(item.min || 0) && sample.heart_rate_bpm <= Number(item.max ?? Infinity));
    if (!zone) return;
    const key = zone.key || zone.label;
    const next = validSamples[index + 1];
    const delta = next ? Math.max(0, Number(next.elapsed_seconds) - Number(sample.elapsed_seconds)) : defaultSeconds;
    secondsByZone.set(key, (secondsByZone.get(key) || 0) + Math.min(delta || defaultSeconds, 30));
  });

  return zones.map((zone) => {
    const key = zone.key || zone.label;
    const seconds = Math.round(secondsByZone.get(key) || 0);
    return {
      ...zone,
      seconds,
      percent: Math.round((seconds / total) * 100),
    };
  });
}

function withinWindow(value, start, end) {
  const elapsed = optionalNumber(value);
  if (elapsed == null) return false;
  if (start != null && elapsed < Number(start)) return false;
  if (end != null && elapsed > Number(end)) return false;
  return true;
}

function firstPresent(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function mapExerciseBlocks(blockRows, exerciseRows) {
  if (!blockRows.length) return [];
  const exercisesByBlock = exerciseRows.reduce((acc, row) => {
    const key = row.block_id || "unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return blockRows.map((block) => {
    const rows = exercisesByBlock[block.id] || [];
    const exerciseDetails = buildConversationExerciseDetails(block, rows);

    return {
      id: block.id,
      orderText: safeValue(block.block_order),
      typeLabel: blockTypeLabel(block.block_type),
      name: repairMojibakeText(block.name || "Bloque"),
      duration_seconds: optionalNumber(block.duration_seconds),
      rounds_completed: optionalNumber(block.rounds_completed),
      executionText: buildBlockExecution(block),
      temporal: getBlockTemporalMetrics(block),
      temporalWindow: {
        start: optionalNumber(block.start_elapsed_seconds),
        end: optionalNumber(block.end_elapsed_seconds),
      },
      temporalReconciled: isBlockTemporallyReconciled(block),
      summaryText: buildBlockSummary(block, rows),
      sensationText: buildBlockSensation(block, rows),
      exerciseDetails,
      sourceText: buildTemporalSourceText(block),
      warningText: buildTemporalWarningText(block),
    };
  });
}


function mapEnrichmentBlocks(blockRows = []) {
  if (!Array.isArray(blockRows) || !blockRows.length) return [];
  return blockRows.map((block, index) => {
    const prescription = block.prescription || block;
    const exercises = Array.isArray(prescription.exercises) ? prescription.exercises : Array.isArray(block.exercises) ? block.exercises : [];
    const normalizedBlock = {
      id: block.id || `enrichment-${index + 1}`,
      block_order: block.block_order ?? block.order ?? index + 1,
      block_type: repairMojibakeText(block.block_type || block.type || prescription.block_type || "conversation"),
      name: repairMojibakeText(block.name || block.title || prescription.name || `Bloque ${index + 1}`),
      duration_seconds: null,
      active_seconds: null,
      rest_seconds: null,
      heart_rate_avg_bpm: null,
      heart_rate_max_bpm: null,
      temporal_metrics_source: "fit_unavailable_or_unmapped",
      temporal_metrics_confidence: "unknown",
      rounds_completed: prescription.rounds_completed ?? block.rounds_completed,
      prescription: {
        ...prescription,
        exercises,
        coach_interpretation: prescription.coach_interpretation || block.coach_interpretation || block.notes || [],
      },
      execution_notes: repairMojibakeText(block.execution_notes || block.notes || ""),
      data_confidence: repairMojibakeText(block.data_confidence || "conversation_enrichment"),
    };
    return {
      ...mapExerciseBlocks([normalizedBlock], [])[0],
      sourceText: "enkidu_conversation_enrichments.payload.blocks · conversation_enrichment",
    };
  });
}

function buildConversationSessionStats(blocks = []) {
  const exerciseStats = blocks.flatMap((block) => block.exerciseDetails || []).map((exercise) => exercise.stats || {});
  const totalSets = Math.round(sumNumeric(exerciseStats.map((item) => item.sets)));
  const totalReps = Math.round(sumNumeric(exerciseStats.map((item) => item.reps)));
  const repSets = Math.round(sumNumeric(exerciseStats.map((item) => item.repSets)));
  const isometricSeconds = Math.round(sumNumeric(exerciseStats.map((item) => item.isometricSeconds)));
  const externalLoadKg = sumNumeric(exerciseStats.map((item) => item.externalLoadKg));
  return {
    blockCount: blocks.length,
    totalSets,
    totalReps,
    avgRepsPerSet: repSets > 0 && totalReps > 0 ? (totalReps / repSets).toFixed(1) : undefined,
    isometricSeconds,
    loadLabel: externalLoadKg > 0 ? `${formatNumberValue(externalLoadKg)} kg` : "Peso corporal / sin carga externa",
  };
}

function buildTemporalSourceText(block) {
  const source = block.temporal_metrics_source || "manual/conversacional";
  const confidence = block.temporal_metrics_confidence || block.data_confidence || "manual";
  return `${source} · ${confidence}`;
}

function isBlockTemporallyReconciled(block) {
  const source = `${block.temporal_metrics_source || ""}`.toLowerCase();
  const confidence = `${block.temporal_metrics_confidence || ""}`.toLowerCase();
  if (!source || source === "fit_unavailable_or_unmapped") return false;
  return ["user_confirmed", "exact", "high", "derived"].some((item) => confidence.includes(item));
}

function buildTemporalWarningText(block) {
  const reconciliation = block.prescription?.temporal_reconciliation;
  if (reconciliation?.warning) return reconciliation.warning;
  const hasBlockMetrics =
    optionalNumber(block.duration_seconds) != null ||
    optionalNumber(block.active_seconds) != null ||
    optionalNumber(block.rest_seconds) != null ||
    optionalNumber(block.heart_rate_avg_bpm) != null ||
    optionalNumber(block.heart_rate_max_bpm) != null;
  if (!hasBlockMetrics && block.temporal_metrics_source === "fit_unavailable_or_unmapped") {
    return "Métricas Garmin por bloque no disponibles: falta ventana temporal FIT para este bloque.";
  }
  return "";
}

function buildConversationExerciseDetails(block, rows = []) {
  const prescribed = Array.isArray(block.prescription?.exercises) ? block.prescription.exercises : [];
  const rowsByName = rows.reduce((acc, row) => {
    acc[exerciseKey(row.reported_name)] = row;
    return acc;
  }, {});
  const sources = prescribed.length
    ? prescribed.map((item) => ({ item, row: rowsByName[exerciseKey(item.name)] }))
    : rows.map((row) => ({ item: {}, row }));

  return sources.map(({ item, row = {} }) => {
    const name = item.name || row.reported_name || "Ejercicio";
    const fallback = plannedExerciseFallback(name);
    const sets = optionalNumber(item.sets_completed ?? row.sets_completed ?? fallback?.sets);
    const work = resolveExerciseWork(item, row, fallback, sets);
    const loadValue = optionalNumber(item.load_value ?? row.load_value);
    const loadUnit = item.load_unit || row.load_unit;
    const detailText = formatExerciseDetail({
      ...item,
      ...row,
      name,
      rounds_completed: item.rounds_completed ?? row.rounds_completed ?? block.rounds_completed,
      sets_completed: item.sets_completed ?? row.sets_completed,
      reps_per_set: item.reps_per_set ?? row.reps_per_set,
      duration_seconds: item.duration_seconds ?? row.duration_seconds,
      load_value: item.load_value ?? row.load_value,
      load_unit: item.load_unit ?? row.load_unit,
      side: item.side ?? row.side,
      equipment_snapshot: item.equipment_snapshot ?? row.equipment_snapshot,
    });
    return {
      name,
      detailText,
      notes: normalizeNotes(item.notes ?? row.notes),
      stats: {
        sets: sets || 0,
        reps: work.reps || 0,
        repSets: work.repSets || 0,
        isometricSeconds: work.isometricSeconds || 0,
        externalLoadKg: loadUnit === "kg" && loadValue ? loadValue * (sets || 1) : 0,
      },
    };
  });
}

function formatExerciseDetail(exercise = {}) {
  const parts = [];
  const rounds = formatRounds(exercise.rounds_completed);
  const roundsValue = optionalNumber(exercise.rounds_completed);
  const setsValue = optionalNumber(exercise.sets_completed);
  const sets = roundsValue && setsValue === roundsValue ? "" : formatSets(exercise.sets_completed);
  const reps = formatReps(exercise.reps_per_set, exercise.side, exercise.rounds_completed);
  const duration = formatCoachDuration(exercise.duration_seconds);
  const load = formatLoad(exercise.load_value, exercise.load_unit);
  const equipment = formatEquipment(exercise.equipment_snapshot, exercise.name || exercise.reported_name);

  if (rounds) parts.push(rounds);
  if (sets) parts.push(sets);
  if (reps) parts.push(reps);
  if (duration) parts.push(duration);
  if (load) parts.push(load);
  if (equipment) parts.push(equipment);

  return parts.join(" · ");
}

function formatBlockKeyVolume(block = {}) {
  const parts = [];
  const rounds = formatRounds(block.rounds_completed ?? block.rounds);
  const exerciseCount = block.exerciseDetails?.length || 0;
  const duration = formatCoachDuration(block.duration_seconds ?? block.duration_s ?? block.temporal?.seconds);

  if (rounds) parts.push(rounds);
  if (exerciseCount) parts.push(`${exerciseCount} ${exerciseCount === 1 ? "ejercicio" : "ejercicios"}`);
  if (duration) parts.push(duration);

  return parts.join(" · ");
}

function formatLoad(loadValue, loadUnit) {
  const value = optionalNumber(loadValue);
  const unit = `${loadUnit || ""}`.trim();
  if (value == null || !unit) return "";
  return `${formatNumberValue(value)} ${unit}`;
}

function formatCoachDuration(seconds) {
  const value = optionalNumber(seconds);
  if (value == null || value <= 0) return "";
  const total = Math.round(value);
  if (total < 60) return `${total} s`;
  return formatDurationClock(total);
}

function formatRounds(rounds) {
  const value = optionalNumber(rounds);
  if (value == null || value <= 0) return "";
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${formatNumberValue(rounded)} ${rounded === 1 ? "ronda" : "rondas"}`;
}

function formatSets(sets) {
  const value = optionalNumber(sets);
  if (value == null || value <= 0) return "";
  return `${formatNumberValue(value)} ${value === 1 ? "serie" : "series"}`;
}

function formatReps(value, side, rounds) {
  const reps = normalizeRepsPerSet(value);
  if (!reps.length) return "";
  const roundCount = optionalNumber(rounds);
  const allEqual = reps.every((item) => sameRepValue(item, reps[0]));
  if (allEqual) {
    const label = repValueLabel(reps[0], side);
    if (!label) return "";
    return roundCount && reps.length === roundCount ? label : reps.length > 1 ? `${label} x ${reps.length}` : label;
  }
  return reps.map((item) => repValueLabel(item, side)).filter(Boolean).join(" + ");
}

function normalizeRepsPerSet(value) {
  const parsed = parseJsonish(value);
  if (parsed == null || parsed === "") return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function parseJsonish(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^[\[{]/.test(trimmed)) return trimmed;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function sameRepValue(a, b) {
  return comparableDictationText(repValueLabel(a)) === comparableDictationText(repValueLabel(b));
}

function repValueLabel(value, side) {
  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return isPerSide(side) ? `${formatNumberValue(number)}/lado` : `${formatNumberValue(number)} reps`;
  }
  if (typeof value === "string") return repairMojibakeText(value).trim();
  if (!value || typeof value !== "object") return "";
  const perSide = firstPresent(value, ["each_side", "per_side", "reps_per_side"]);
  if (perSide != null) return `${formatNumberValue(perSide)}/lado`;
  const total = firstPresent(value, ["total", "reps", "count"]);
  if (total != null) return `${formatNumberValue(total)} reps`;
  return "";
}

function isPerSide(side) {
  return /side|lado|each/i.test(`${side || ""}`);
}

function formatEquipment(snapshot, exerciseName = "") {
  const parsed = parseJsonish(snapshot);
  const equipment = Array.isArray(parsed?.equipment)
    ? parsed.equipment
    : Array.isArray(parsed)
      ? parsed
      : parsed?.name
        ? [parsed.name]
        : [];
  const nameText = comparableDictationText(exerciseName);
  return equipment
    .map((item) => repairMojibakeText(item).replaceAll("_", " ").trim())
    .filter(Boolean)
    .filter((item) => !nameText.includes(comparableDictationText(item)))
    .slice(0, 2)
    .join(" · ");
}

function resolveExerciseWork(item = {}, row = {}, fallback = {}, sets) {
  const repsPerSet = item.reps_per_set ?? row.reps_per_set;
  if (repsPerSet != null) return repsPerSetWork(repsPerSet, sets);
  if (item.reps_per_side != null) {
    const reps = Number(item.reps_per_side);
    return {
      text: `${formatNumberValue(reps)} reps/lado`,
      reps: !Number.isNaN(reps) ? reps * 2 * (sets || 1) : 0,
      repSets: sets || 1,
    };
  }
  if (item.reps != null) return repsObjectWork(item.reps, sets);
  if (fallback?.work) return fallback;
  const duration = optionalNumber(item.duration_seconds ?? row.duration_seconds);
  if (duration) {
    const sideFactor = item.side === "each_side" || row.side === "each_side" ? 2 : 1;
    return {
      text: `${formatDurationClock(duration)}${sets ? "/serie" : ""}`,
      isometricSeconds: duration * (sets || 1) * sideFactor,
    };
  }
  return {};
}

function repsPerSetWork(value, sets) {
  if (Array.isArray(value)) {
    const numbers = value.map((item) => Number(item)).filter((item) => !Number.isNaN(item));
    const equal = numbers.length > 1 && numbers.every((item) => item === numbers[0]);
    return {
      text: equal ? `${formatNumberValue(numbers[0])} reps/serie` : `${numbers.map(formatNumberValue).join(" + ")} reps`,
      reps: numbers.reduce((sum, item) => sum + item, 0),
      repSets: numbers.length,
    };
  }
  const number = Number(value);
  if (!Number.isNaN(number)) {
    return { text: `${formatNumberValue(number)} reps/serie`, reps: number * (sets || 1), repSets: sets || 1 };
  }
  return { text: `${value}` };
}

function repsObjectWork(value, sets) {
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    const number = match ? Number(match[1]) : 0;
    const perSide = /lado/i.test(value);
    return {
      text: perSide ? `${number} reps/lado` : value,
      reps: number ? number * (perSide ? 2 : 1) : 0,
      repSets: sets || 1,
    };
  }
  if (typeof value === "object" && value) {
    if (value.first_set != null) {
      const reps = Number(value.first_set);
      return { text: `${formatNumberValue(reps)} reps primera serie`, reps: Number.isNaN(reps) ? 0 : reps, repSets: 1 };
    }
    const entries = Object.entries(value);
    const total = entries.reduce((sum, [, item]) => {
      const number = Number(item);
      return Number.isNaN(number) ? sum : sum + number;
    }, 0);
    return {
      text: entries.map(([key, item]) => `${shortExerciseSideLabel(key)} ${item}`).join(" · "),
      reps: total,
      repSets: sets || 1,
    };
  }
  return {};
}

function plannedExerciseFallback(name) {
  return null;
}

function exerciseKey(value) {
  return `${value || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function shortExerciseSideLabel(key) {
  const labels = {
    left: "izq",
    right: "der",
    left_clockwise: "izq horario",
    right_clockwise: "der horario",
    left_counterclockwise: "izq antihorario",
    right_counterclockwise: "der antihorario",
  };
  return labels[key] || humanizeKey(key);
}

function buildBlockExecution(block) {
  const prescription = block.prescription || {};
  const format = prescription.format;
  const completed = prescription.rounds_completed ?? block.rounds_completed ?? prescription.sets_completed;
  const planned = prescription.rounds_planned;

  if (planned && completed) {
    return `${formatNumberValue(completed)}/${formatNumberValue(planned)} rondas`;
  }
  if (completed && format === "superserie") return `${formatNumberValue(completed)} superseries`;
  if (completed) return formatRounds(completed);
  if (format) return format;
  return "";
}

function buildBlockSummary(block, rows) {
  const prescriptionSummary = blockDescriptionFromPrescription(block.prescription);
  const summary = prescriptionSummary || rows.map((row) => simplifyExerciseName(row.reported_name)).filter(Boolean).join(" · ");
  return compactBlockSummary(summary) || "";
}

function buildBlockSensation(block, rows = []) {
  const prescription = block.prescription || {};
  const parts = [];
  if (block.execution_notes) parts.push(block.execution_notes);
  if (prescription.reason_for_cut) parts.push(prescription.reason_for_cut);
  if (Array.isArray(prescription.coach_interpretation)) parts.push(...prescription.coach_interpretation);
  return compactSentences(parts) || "";
}

function getBlockTemporalMetrics(block) {
  const active = optionalNumber(block.active_seconds);
  const rest = optionalNumber(block.rest_seconds);
  const persistedDuration = optionalNumber(block.duration_seconds);
  const elapsed = optionalNumber(elapsedDuration(block));
  const workSeconds = active ?? persistedDuration ?? elapsed;
  const restSeconds = rest && rest > 0 ? rest : null;
  const totalSeconds = workSeconds == null ? null : workSeconds + (restSeconds || 0);
  return {
    tiempo: formatOptionalDuration(totalSeconds),
    activo: formatOptionalDuration(workSeconds),
    descanso: formatOptionalDuration(restSeconds),
    fcMedia: formatBpm(block.heart_rate_avg_bpm),
    fcMax: formatBpm(block.heart_rate_max_bpm),
  };
}

function elapsedDuration(block) {
  if (block.start_elapsed_seconds == null || block.end_elapsed_seconds == null) return null;
  return Math.max(0, Number(block.end_elapsed_seconds) - Number(block.start_elapsed_seconds));
}

function blockDescriptionFromPrescription(prescription) {
  const exercises = prescription?.exercises;
  if (!Array.isArray(exercises)) return "";
  return exercises.map((item) => simplifyExerciseName(item?.name)).filter(Boolean).join(" · ");
}

function simplifyExerciseName(value) {
  return `${value || ""}`.trim();
}

function compactSentences(parts) {
  const sentences = parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .map((part) => `${part || ""}`.trim())
    .filter(Boolean);
  return [...new Set(sentences)].slice(0, 4).join(" ");
}

function compactBlockSummary(value) {
  const items = `${value || ""}`
    .split(" · ")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length <= 7) return items.join(" · ");
  return `${items.slice(0, 7).join(" · ")} · +${items.length - 7}`;
}

function blockTypeLabel(value) {
  return {
    mobility: "Movilidad",
    skill: "Técnica",
    strength: "Fuerza",
    recovery: "Recovery",
    conditioning: "Condicionamiento",
    metcon: "Metcon",
    cardio: "Cardio",
    warmup: "Warm-up",
    cooldown: "Cooldown",
    mixed: "Mixto",
    other: "Otro",
  }[value] || value || "";
}

function extractReps(value) {
  const formatted = formatRepsValue(value);
  return formatted || "N/D";
}

function formatRepsValue(value) {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "number" || !Number.isNaN(Number(item)))) {
      return `${value.reduce((sum, item) => sum + Number(item || 0), 0)}`;
    }
    return value.map(formatRepsValue).filter(Boolean).join(" + ");
  }
  if (typeof value === "object" && value) {
    if (value.total != null || value.reps != null) return `${Number(value.total ?? value.reps ?? 0)}`;
    if (value.per_side != null) return `${value.per_side}/lado`;
    return Object.entries(value)
      .map(([key, item]) => `${humanizeKey(key)} ${item}`)
      .join(", ");
  }
  if (value == null || value === "") return "";
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? `${value}` : `${asNumber}`;
}

function numericReps(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + numericReps(item), 0);
  if (typeof value === "object" && value) {
    if (value.total != null || value.reps != null) return Number(value.total ?? value.reps ?? 0);
    if (value.per_side != null) return Number(value.per_side || 0) * 2;
    return Object.values(value).reduce((sum, item) => sum + Number(item || 0), 0);
  }
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? 0 : asNumber;
}

function humanizeKey(value) {
  return repairMojibakeText(value).replaceAll("_", " ");
}

function safeValue(value, fallback = "N/D") {
  if (value == null || value === "") return fallback;
  if (typeof value === "number" && Number.isNaN(value)) return fallback;
  return repairMojibakeText(value);
}

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function formatOptionalDuration(value) {
  if (value == null || value === "") return "N/D";
  const seconds = Number(value);
  if (Number.isNaN(seconds) || seconds <= 0) return "N/D";
  return formatDurationClock(seconds);
}

function formatBpm(value) {
  if (value == null || value === "") return "N/D";
  const bpm = Number(value);
  if (Number.isNaN(bpm) || bpm <= 0) return "N/D";
  return `${Math.round(bpm)}`;
}

function formatNumberValue(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return `${value}`;
  return Number.isInteger(number) ? `${number}` : `${number.toFixed(1)}`;
}

function normalizeNotes(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  if (typeof value === "object" && value) return Object.values(value).filter(Boolean).join(" ");
  return value ? `${value}` : "";
}

function getPath(source, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], source);
}

function formatField(value, field) {
  const resolved = value ?? field.fallback ?? null;
  if (field.format === "duration") return formatOptionalDuration(resolved);
  if (resolved == null || resolved === "" || (typeof resolved === "number" && Number.isNaN(resolved))) return "N/D";
  return `${resolved}${field.suffix || ""}`;
}

function formatDurationClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}` : `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function mapReportedHeartRateZones(reported, sessionId) {
  const sourceZones = reported?.zones || [];
  const useSnapshot = sessionId === TARGET_BACKFILL_SESSION_ID;
  if (useSnapshot) return garminHrZoneSnapshot.map(normalizeSnapshotZone);
  if (!sourceZones.length) return [];
  const reportedTotal = optionalNumber(reported?.total_seconds);
  const totalSeconds = Math.max(1, reportedTotal ?? sourceZones.reduce((sum, zone) => sum + Number(zone.seconds || 0), 0));
  const zoneMeta = {
    Z1: garminHrZoneSnapshot[0],
    Z2: garminHrZoneSnapshot[1],
    Z3: garminHrZoneSnapshot[2],
    Z4: garminHrZoneSnapshot[3],
    Z5: garminHrZoneSnapshot[4],
  };
  return ["Z1", "Z2", "Z3", "Z4", "Z5"].map((key) => {
    const item = sourceZones.find((zone) => zone.zone === key) || {};
    const snapshot = zoneMeta[key];
    const seconds = Number(item.seconds ?? (useSnapshot ? snapshot.seconds : 0));
    const min = optionalNumber(item.min_bpm ?? item.min_heart_rate_bpm ?? (useSnapshot ? snapshot.min_bpm : null));
    const max = optionalNumber(item.max_bpm ?? item.max_heart_rate_bpm ?? (useSnapshot ? snapshot.max_bpm : null));
    if (min == null) return null;
    return {
      key,
      label: snapshot.label,
      shortLabel: snapshot.shortLabel,
      name: snapshot.name,
      color: snapshot.color,
      min,
      max: max ?? Infinity,
      range: max == null ? `> ${min - 1} ppm` : `${min} - ${max} ppm`,
      seconds,
      percent: useSnapshot ? snapshot.percent : Math.round((seconds / totalSeconds) * 100),
    };
  }).filter(Boolean);
}

function displayHeartRateZones(zones = []) {
  return [...zones].sort((a, b) => {
    const zoneA = Number(`${a.key || a.label || ""}`.match(/\d+/)?.[0] || 0);
    const zoneB = Number(`${b.key || b.label || ""}`.match(/\d+/)?.[0] || 0);
    return zoneB - zoneA;
  });
}

function normalizeSnapshotZone(zone) {
  return {
    key: zone.zone,
    label: zone.label,
    shortLabel: zone.shortLabel,
    name: zone.name,
    color: zone.color,
    min: zone.min_bpm,
    max: zone.max_bpm ?? Infinity,
    range: zone.max_bpm == null ? `> ${zone.min_bpm - 1} ppm` : `${zone.min_bpm} - ${zone.max_bpm} ppm`,
    seconds: zone.seconds,
    percent: zone.percent,
  };
}

function zonesHaveThresholds(zones = []) {
  return zones.some((zone) => optionalNumber(zone.min) != null);
}

function estimateSampleSeconds(samples) {
  if (samples.length < 2) return 1;
  const deltas = samples
    .slice(1, 12)
    .map((sample, index) => Number(sample.elapsed_seconds || 0) - Number(samples[index].elapsed_seconds || 0))
    .filter((value) => value > 0);
  return Math.max(1, Math.round(average(deltas) || 1));
}

function buildHeartRateSegments(samples) {
  const sorted = [...samples]
    .map((sample) => ({
      elapsed_seconds: Number(sample.elapsed_seconds),
      heart_rate_bpm: Number(sample.heart_rate_bpm),
    }))
    .filter((sample) => !Number.isNaN(sample.elapsed_seconds))
    .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);

  const segments = [];
  let current = [];
  let previous = null;
  const validValues = [];

  sorted.forEach((sample) => {
    const validHr = !Number.isNaN(sample.heart_rate_bpm) && sample.heart_rate_bpm > 0 && sample.heart_rate_bpm >= 30 && sample.heart_rate_bpm <= 230;
    const hasGap = previous && sample.elapsed_seconds - previous.elapsed_seconds > 8;
    if (!validHr || hasGap) {
      if (current.length > 1) segments.push(current);
      current = [];
      previous = validHr ? sample : null;
      if (validHr) {
        current.push(sample);
        validValues.push(sample.heart_rate_bpm);
      }
      return;
    }

    current.push(sample);
    validValues.push(sample.heart_rate_bpm);
    previous = sample;
  });

  if (current.length > 1) segments.push(current);
  return { segments: downsampleSegments(segments, 1600), validValues };
}

function downsampleSegments(segments, maxPoints) {
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total <= maxPoints) return segments;
  const ratio = Math.ceil(total / maxPoints);
  return segments.map((segment) => {
    const sampled = [];
    for (let index = 0; index < segment.length; index += ratio) {
      const bucket = segment.slice(index, index + ratio);
      if (!bucket.length) continue;
      const min = bucket.reduce((best, point) => (point.heart_rate_bpm < best.heart_rate_bpm ? point : best), bucket[0]);
      const max = bucket.reduce((best, point) => (point.heart_rate_bpm > best.heart_rate_bpm ? point : best), bucket[0]);
      sampled.push(...[min, max].sort((a, b) => a.elapsed_seconds - b.elapsed_seconds));
    }
    return sampled;
  });
}

function splitHeartRateSegmentByMode(segment, mode, zones = [], blocks = []) {
  if (mode === "classic") return [colorizedSegment(segment, "#f23a43")];
  const colored = [];
  let current = [];
  let currentColor = "";
  segment.forEach((point) => {
    const color = chartPointColor(point, mode, zones, blocks);
    if (current.length && color !== currentColor) {
      if (current.length > 1) {
        const closed = [...current];
        closed.color = currentColor;
        colored.push(closed);
      }
      current = [current[current.length - 1], point];
    } else {
      current.push(point);
    }
    currentColor = color;
  });
  if (current.length > 1) {
    current.color = currentColor;
    colored.push(current);
  }
  return colored.length ? colored : [colorizedSegment(segment, "#f23a43")];
}

function colorizedSegment(segment, color) {
  const next = [...segment];
  next.color = color;
  return next;
}

function chartPointColor(point, mode, zones = [], blocks = []) {
  if (mode === "zones") {
    const hr = Number(point.heart_rate_bpm || 0);
    const zone = zones.find((item) => hr >= Number(item.min || 0) && hr <= Number(item.max ?? Infinity));
    return zone?.color || "#7d7d7d";
  }
  if (mode === "blocks") {
    const colors = ["#25d7e6", "#ff8a1f", "#d6ff35", "#c47dff", "#4aa8ff"];
    const block = blocks.find((item) => {
      const start = optionalNumber(item.temporalWindow?.start);
      const end = optionalNumber(item.temporalWindow?.end);
      return start != null && end != null && point.elapsed_seconds >= start && point.elapsed_seconds <= end;
    });
    return block ? colors[(Number(block.orderText || 1) - 1) % colors.length] : "#7d7d7d";
  }
  return "#f23a43";
}

function trainingEffectMarkerColor(value) {
  if (value < 1) return "#9d9d9d";
  if (value < 2) return "#4aa8ff";
  if (value < 3.5) return "#65d86b";
  if (value < 4.5) return "#ff9b43";
  return "#e63b41";
}

function getHrDomain(values) {
  if (!values.length) return { yMin: 40, yMax: 140, ticks: [40, 60, 80, 100, 120, 140] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yMin = Math.min(40, Math.floor((min - 10) / 20) * 20);
  const yMax = Math.max(140, Math.ceil((max + 10) / 20) * 20);
  const ticks = [];
  for (let tick = yMin; tick <= yMax; tick += 20) ticks.push(tick);
  return { yMin, yMax, ticks };
}

function getTimeTicks(durationSeconds) {
  const duration = Math.max(1, Math.round(Number(durationSeconds || 0)));
  const steps = 5;
  return Array.from({ length: steps + 1 }, (_, index) => Math.round((duration / steps) * index));
}

function formatElapsedTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function readableSessionTitle(item) {
  if (item.distance_meters) return `Garmin activity · ${(Number(item.distance_meters) / 1000).toFixed(1)} km`;
  if (item.duration_seconds) return `Training session · ${Math.round(item.duration_seconds / 60)} min`;
  return "Training session";
}

function tableSummary(table, result) {
  return {
    table,
    count: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
    error: result.error?.message || "",
  };
}

function chronological(rows) {
  return [...rows].reverse();
}

function sampleSeries(rows, valueKey, timeKey, targetCount) {
  const clean = rows.filter((row) => row[valueKey] != null);
  if (clean.length <= targetCount) return clean;
  const step = Math.max(1, Math.floor(clean.length / targetCount));
  const sampled = clean.filter((_, index) => index % step === 0).slice(0, targetCount);
  return sampled.length ? sampled : clean.slice(-targetCount);
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(Number(seconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes.toString().padStart(2, "0")}m` : `${minutes}m`;
}

function formatHour(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit" });
}

async function extractFitPayload(file, originalBuffer) {
  const fileName = file.name || "";
  const isZip =
    fileName.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";

  if (!isZip) {
    return { buffer: originalBuffer, innerName: "", containerType: file.type || "raw" };
  }

  try {
    const zip = await JSZip.loadAsync(originalBuffer);
    const fitEntry = Object.values(zip.files).find(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".fit"),
    );

    if (!fitEntry) {
      return {
        buffer: originalBuffer,
        innerName: "",
        containerType: "zip",
        error: "ZIP sin archivo .fit interno",
      };
    }

    return {
      buffer: await fitEntry.async("arraybuffer"),
      innerName: fitEntry.name,
      containerType: "zip",
    };
  } catch (error) {
    return {
      buffer: originalBuffer,
      innerName: "",
      containerType: "zip",
      error: `ZIP no legible: ${error.message}`,
    };
  }
}

async function sha256(buffer) {
  if (!globalThis.crypto?.subtle) {
    return fallbackChecksum(buffer);
  }
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fallbackChecksum(buffer) {
  const bytes = new Uint8Array(buffer);
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${bytes.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function compact(value) {
  const number = Number(value);
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
  return `${number}`;
}

createRoot(document.getElementById("root")).render(<App />);

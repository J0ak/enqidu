import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import FitParser from "fit-file-parser";
import { getArrayBuffer, readRecord } from "../node_modules/fit-file-parser/dist/binary.js";
import { Buffer } from "buffer";
import ConversationEnrichmentDemo from "@/pages/admin/ConversationEnrichmentDemo";
import { supabase } from "@/integrations/supabase/client";
import { reconcileSessionTemporalBlocks } from "@/services/temporalReconciliationService";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  ClipboardList,
  Database,
  Dumbbell,
  FileUp,
  HeartPulse,
  Home,
  LockKeyhole,
  LogIn,
  LogOut,
  Mountain,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Watch,
  Zap,
} from "lucide-react";
import "./styles.css";

const SUPABASE_PROJECT_URL = "https://rdduqsziboqxlgeqouxq.supabase.co";
const SUPABASE_PROJECT_NAME = "Hybriq";

const storageKeys = {
  route: "sport-elements.route",
  profile: "sport-elements.profile",
  fitImports: "sport-elements.fit-imports",
  messages: "sport-elements.messages",
  backoffice: "sport-elements.backoffice",
};

const profileSeed = {
  name: "Joaquin",
  avatar: "JQ",
  primaryGoal: "Boyle base -> HYROX race engine",
  readinessBias: "Performance with recovery guardrails",
  garminMode: "FIT assisted capture",
  garminStatus: "Pending official Garmin integration",
  weekTarget: "4 strength + 2 engine + 1 trail",
};

const disciplineOrder = ["boyle", "hyrox", "deka", "trail", "crossfit"];

const disciplines = {
  boyle: {
    label: "Boyle",
    icon: ShieldCheck,
    color: "#23e6c1",
    headline: "Base humana antes que heroicidades",
    focus: "Movement quality, strength hygiene, durable engine.",
    score: 86,
    cards: [
      ["Readiness", "86", "/100", "Prime", 86, "Alta ventana de adaptacion"],
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
      ["Skill Freshness", "61", "%", "Build", 61, "Gimnastico tecnico"],
      ["Barbell Speed", "0.72", "m/s", "OK", 70, "Mantener forma"],
      ["Recovery Cost", "18", "h", "Fine", 58, "No competir hoy"],
    ],
    prescription: ["EMOM 12 technique", "12 min AMRAP controlled", "Breathing cooldown"],
  },
};

const demoHealth = {
  calendar_date: "2026-06-05",
  resting_heart_rate_bpm: 54,
  steps: 8740,
  intensity_minutes: 126,
  active_kcal: 920,
  average_stress_level: 31,
  body_battery_current: 72,
  spo2_avg_pct: 97,
  respiration_avg_brpm: 13.8,
};

const demoHealthSeries = {
  sleep: null,
  hrv: null,
  bodyBattery: [],
  stress: [],
  respiration: [],
  spo2: [],
};

const demoSessions = [
  { id: "s1", title: "HYROX engine intervals", type: "conditioning", score: 82, date: "Today" },
  { id: "s2", title: "Boyle strength base", type: "strength", score: 78, date: "Yesterday" },
  { id: "s3", title: "Trail aerobic climb", type: "cardio", score: 69, date: "Tue" },
];

const demoActivityDetail = {
  session: {
    title: "HIIT",
    duration_seconds: 3178,
    active_seconds: 1498,
    rest_seconds: 1680,
    calories_total: 447,
    calories_active: 370,
    calories_resting: 77,
    training_effect_aerobic: 2.4,
    training_effect_anaerobic: 2.7,
    exercise_load: 85,
    avg_hr: 114,
    max_hr: 165,
  },
  exercises: [
    { set: "Recorrido 1", name: "Unknown", active_seconds: 439, rest_seconds: 116, reps: 7, weight: "--" },
    { set: "Recorrido 2", name: "Elevacion lateral", active_seconds: 186, rest_seconds: 413, reps: 23, weight: "--" },
    { set: "Recorrido 3", name: "Remo", active_seconds: 483, rest_seconds: 365, reps: 8, weight: "--" },
    { set: "Recorrido 4", name: "Unknown", active_seconds: 5, rest_seconds: 144, reps: 0, weight: "--" },
    { set: "Recorrido 5", name: "Unknown", active_seconds: 385, rest_seconds: 643, reps: 11, weight: "--" },
  ],
  samples: Array.from({ length: 72 }, (_, index) => ({
    elapsed_seconds: Math.round((3178 / 71) * index),
    heart_rate_bpm: Math.round(104 + Math.sin(index / 2.3) * 16 + Math.sin(index / 7) * 24 + (index > 36 && index < 50 ? 24 : 0)),
    temperature_c: Math.round(25 + Math.sin(index / 12) * 1.2 + (index < 12 ? 1 : 0)),
  })),
};

const activityTypes = {
  all: { label: "Todas", color: "#9ca3af" },
  run: { label: "Correr", color: "#42a5ff" },
  swim: { label: "Natacion", color: "#25d7e6" },
  hiit: { label: "HIIT", color: "#d6ff35" },
  hybrid: { label: "Hibrido", color: "#d6ff35" },
  strength: { label: "Fuerza", color: "#ff8a1f" },
  pilates: { label: "Pilates", color: "#c47dff" },
};

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
    title: "Frecuencia cardiaca",
    hiddenWhenTimeline: true,
    type: "keyValue",
    fields: [
      { label: "Frecuencia cardiaca media", path: "session.avg_hr", suffix: " ppm" },
      { label: "Frecuencia cardiaca maxima", path: "session.max_hr", suffix: " ppm" },
    ],
  },
  { id: "hr_timeline", title: "Frecuencia cardíaca", type: "timeline", sampleKey: "heart_rate_bpm", unit: "ppm" },
  {
    id: "training_effect",
    title: "Training Effect",
    type: "trainingEffect",
    fields: [
      { label: "Beneficio principal", path: "session.benefit", fallback: "Sprint (Anaerobico)" },
      { label: "Aerobica", path: "session.training_effect_aerobic" },
      { label: "Anaerobico", path: "session.training_effect_anaerobic" },
      { label: "Carga de ejercicio", path: "session.exercise_load" },
    ],
  },
  { id: "hr_zones", title: "Tiempo en zonas de FC", type: "zones" },
  {
    id: "nutrition",
    title: "Nutrición e hidratación",
    type: "keyValue",
    fields: [
      { label: "Calorias en reposo", path: "session.calories_resting" },
      { label: "Calorias activas", path: "session.calories_active" },
      { label: "Calorias totales", path: "session.calories_total" },
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

const demoMessages = [
  {
    role: "assistant",
    content:
      "Hoy iria a Boyle + engine controlado: fuerza limpia, 24 min Z2 y nada de ego en wall balls. La app va a mirar readiness, carga y objetivo antes de proponer.",
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
  if (window.location.pathname === "/admin/conversation-enrichment-demo") {
    return "adminConversationEnrichmentDemo";
  }
  const hash = window.location.hash.replace("#/", "");
  if (hash === "admin/conversation-enrichment-demo") {
    return "adminConversationEnrichmentDemo";
  }
  return hash || localStorage.getItem(storageKeys.route)?.replaceAll('"', "") || "home";
}

async function fetchAllSessionSamples(sessionId) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const result = await supabase
      .from("session_samples")
      .select("elapsed_seconds, heart_rate_bpm, temperature_c, sample_order")
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

function App() {
  const [route, setRouteState] = useState(getInitialRoute);
  const [discipline, setDiscipline] = useState("boyle");
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useStoredState(storageKeys.profile, profileSeed);
  const [fitImports, setFitImports] = useStoredState(storageKeys.fitImports, []);
  const [messages, setMessages] = useStoredState(storageKeys.messages, demoMessages);
  const [backoffice, setBackoffice] = useStoredState(storageKeys.backoffice, {
    lastSync: null,
    tableStatus: [],
    errors: [],
  });
  const [session, setSession] = useState(null);
  const [authNotice, setAuthNotice] = useState("");
  const [health, setHealth] = useState(demoHealth);
  const [healthSeries, setHealthSeries] = useState(demoHealthSeries);
  const [sessions, setSessions] = useState(supabase ? [] : demoSessions);
  const [activityDetail, setActivityDetail] = useState(supabase ? null : demoActivityDetail);
  const [dataState, setDataState] = useState({
    loading: false,
    source: supabase ? "Supabase ready" : "Demo mode",
    detail: supabase
      ? "Cliente configurado por variables VITE_SUPABASE_*."
      : "Falta .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.",
  });

  const loadActivityDetail = async (latestSession) => {
    if (!supabase || !latestSession?.id) return demoActivityDetail;
    const detailUserId = latestSession.user_id || session?.user?.id;

    const [metricsResult, samplesResult, blocksResult, exercisesResult, zoneProfileResult] = await Promise.all([
      supabase
        .from("session_metrics")
        .select("metric_code, metric_name, value_numeric, value_text, value_json, unit")
        .eq("session_id", latestSession.id),
      fetchAllSessionSamples(latestSession.id),
      supabase
        .from("session_blocks")
        .select("id, block_order, block_type, name, duration_seconds, start_elapsed_seconds, end_elapsed_seconds, active_seconds, rest_seconds, heart_rate_avg_bpm, heart_rate_max_bpm, temporal_metrics_source, temporal_metrics_confidence, rounds_completed, prescription, execution_notes, data_confidence")
        .eq("session_id", latestSession.id)
        .order("block_order", { ascending: true }),
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
        .select("block_id, reported_name, exercise_order, sets_completed, reps_per_set, duration_seconds, load_value, load_unit, side, notes, data_confidence")
        .eq("session_id", latestSession.id)
        .order("exercise_order", { ascending: true }),
      fetchHeartRateZoneProfile(detailUserId),
    ]);

    const metrics = indexMetrics(metricsResult.data || []);
    const samples = samplesResult.data?.length ? samplesResult.data : [];
    const summary = latestSession.session_structure?.garmin_fit_summary || {};
    const trainingEffect = summary.training_effect || {};
    const calories = summary.calories || {};
    const heartRate = summary.heart_rate || {};
    const strengthTracking = summary.strength_tracking || {};
    const blocks = mapExerciseBlocks(blocksResult.data || [], exercisesResult.data || []);
    const enrichmentBlocks = !blocks.length ? mapEnrichmentBlocks(enrichmentResult.data?.payload?.blocks || []) : [];
    const renderBlocks = blocks.length ? blocks : enrichmentBlocks;
    const conversationStats = buildConversationSessionStats(renderBlocks);
    const avgHr = average(samples.map((item) => item.heart_rate_bpm).filter(Boolean));
    const maxHr = Math.max(...samples.map((item) => Number(item.heart_rate_bpm || 0)), 0);
    const duration = Number(summary.duration_total_seconds || latestSession.duration_seconds || 0);
    const activityTime = getActivityTimeMetrics(latestSession, metrics, blocksResult.data || [], summary, duration);
    const title = summary.activity_type || cleanGarminTitle(latestSession.title) || latestSession.title || "Actividad";
    const heartRateZones = resolveActivityHeartRateZones({
      reported: summary.heart_rate_zones_reported,
      profile: zoneProfileResult.data,
      samples,
      durationSeconds: duration,
    });

    return {
      session: {
        id: latestSession.id,
        title,
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
        avg_reps_per_set: conversationStats.avgRepsPerSet || undefined,
        isometric_seconds: conversationStats.isometricSeconds || undefined,
        volume_total: conversationStats.loadLabel || undefined,
        training_effect_aerobic: numberMetric(metrics, ["training_effect_aerobic", "aerobic_training_effect"], trainingEffect.aerobic ?? null),
        training_effect_anaerobic: numberMetric(metrics, ["training_effect_anaerobic", "anaerobic_training_effect"], trainingEffect.anaerobic ?? null),
        exercise_load: roundOptionalMetric(numberMetric(metrics, ["exercise_load", "training_load"], trainingEffect.training_load ?? null)),
        benefit: textMetric(metrics, ["benefit", "primary_benefit", "training_benefit"], benefitFromTrainingEffect(trainingEffect)),
        avg_hr: roundOptionalMetric(numberMetric(metrics, ["avg_heart_rate", "average_heart_rate"], (heartRate.avg_bpm ?? avgHr) || null)),
        max_hr: roundOptionalMetric(numberMetric(metrics, ["max_heart_rate", "maximum_heart_rate"], (heartRate.max_bpm ?? maxHr) || null)),
      },
      exercises: mapExercises(exercisesResult.data || []),
      blocks: renderBlocks,
      hasConversationBlocks: renderBlocks.length > 0,
      samples,
      zones: mapReportedHeartRateZones(heartRateZones),
      summary,
    };
  };

  const loadBackofficeData = async (activeSession = session) => {
    if (!supabase) {
      setDataState({
        loading: false,
        source: "Demo mode",
        detail: "No hay cliente Supabase: configura .env.local con URL y publishable key.",
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

    const sessionQuery = supabase
      .from("training_sessions")
      .select("id, user_id, title, session_kind, session_status, duration_seconds, distance_meters, started_at, local_date, created_at, source_id, tags, session_structure")
      .or("session_status.is.null,session_status.neq.archived")
      .order("local_date", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(100);

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
        weekTarget: `${profileResult.data.weekly_days ?? "?"} dias · ${profileResult.data.typical_minutes ?? "?"} min`,
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
      source: errors.length ? "Supabase partial" : "Supabase live",
      detail: errors.length
        ? `Conectado a ${SUPABASE_PROJECT_NAME}, pero hay tablas bloqueadas por RLS/Auth.`
        : `Conectado a ${SUPABASE_PROJECT_NAME}${userId ? ` como ${activeSession.user.email}` : " en modo publico"}.`,
    });
  };

  const setRoute = (next) => {
    setRouteState(next);
    localStorage.setItem(storageKeys.route, JSON.stringify(next));
    window.location.hash = `/${next}`;
  };

  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.replace("#/", "") || "home";
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
    if (!query.trim()) return activeSessions;
    return activeSessions.filter((session) => `${session.title} ${session.type}`.toLowerCase().includes(query.toLowerCase()));
  }, [query, sessions]);

  const openSessionDetail = async (selectedSession) => {
    if (selectedSession?.activityType === "hybrid") setDiscipline("hyrox");
    if (selectedSession?.activityType === "strength") setDiscipline("crossfit");
    if (selectedSession?.activityType === "run") setDiscipline("trail");
    if (selectedSession?.activityType === "pilates") setDiscipline("boyle");
    if (selectedSession?.id) {
      setActivityDetail(null);
      const detail = await loadActivityDetail(selectedSession);
      setActivityDetail(detail);
    }
    setRoute("activityDetail");
  };

  return (
    <div className="appShell" style={{ "--discipline": activeDiscipline.color }}>
      <aside className="rail">
        <button className="brandButton" onClick={() => setRoute("home")} aria-label="Home">
          <Sparkles size={20} />
          <span>SE</span>
        </button>
        <NavButton icon={Home} label="Home" route="home" active={route} setRoute={setRoute} />
        <NavButton icon={HeartPulse} label="Health" route="health" active={route} setRoute={setRoute} />
        <NavButton icon={Activity} label="Activities" route="activities" active={route} setRoute={setRoute} />
        <NavButton icon={Bot} label="Coach" route="coach" active={route} setRoute={setRoute} />
        <NavButton icon={UserRound} label="Profile" route="profile" active={route} setRoute={setRoute} />
        <NavButton icon={Database} label="Backoffice" route="backoffice" active={route} setRoute={setRoute} />
      </aside>

      <main className="phoneCanvas">
        <header className="appHeader">
          <div>
            <span>{route === "activityDetail" ? activitySubtitle(activityDetail) : routeLabel(route)}</span>
            <h1>{route === "activityDetail" ? activityDetail?.session?.title || "Actividad" : "Sport Elements"}</h1>
          </div>
          {route !== "activityDetail" && <div className="statusPill">
            {dataState.loading ? <RefreshCw size={14} className="spin" /> : <Watch size={14} />}
            {dataState.source}
          </div>}
        </header>

        {route !== "activityDetail" && <div className="searchRow">
          <label className="searchBox">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar actividad, metrica o bloque" />
          </label>
        </div>}

        {route !== "activityDetail" && <DisciplineSwitch value={discipline} onChange={setDiscipline} />}

        {route === "home" && (
          <HomeView
            discipline={activeDiscipline}
            health={health}
            sessions={filteredSessions}
            setRoute={setRoute}
            dataState={dataState}
          />
        )}
        {route === "health" && <HealthView health={health} healthSeries={healthSeries} discipline={activeDiscipline} />}
        {route === "activities" && (
          <ActivitiesOverview
            sessions={filteredSessions}
            setRoute={setRoute}
            setDiscipline={setDiscipline}
            onOpenSession={openSessionDetail}
          />
        )}
        {route === "activityDetail" && (
          <ActivityView
            activityDetail={activityDetail}
          />
        )}
        {route === "coach" && <CoachView messages={messages} setMessages={setMessages} discipline={activeDiscipline} health={health} />}
        {route === "profile" && (
          <ProfileView
            profile={profile}
            setProfile={setProfile}
            fitImports={fitImports}
            dataState={dataState}
            projectUrl={SUPABASE_PROJECT_URL}
            session={session}
            authNotice={authNotice}
            setAuthNotice={setAuthNotice}
            onSync={() => loadBackofficeData(session)}
            onImportedSession={openSessionDetail}
          />
        )}
        {route === "backoffice" && (
          <BackofficeView
            session={session}
            dataState={dataState}
            backoffice={backoffice}
            fitImports={fitImports}
            setFitImports={setFitImports}
            onSync={() => loadBackofficeData(session)}
            onImportedSession={openSessionDetail}
            authNotice={authNotice}
            setAuthNotice={setAuthNotice}
          />
        )}
        {route === "adminConversationEnrichmentDemo" && <ConversationEnrichmentDemo />}
      </main>
    </div>
  );
}

function routeLabel(route) {
  return {
    home: "Human performance OS",
    health: "Health smart cards",
    activities: "Activity selector",
    activityDetail: "Activity smart cards",
    coach: "Conversational coach",
    profile: "Profile and Garmin",
    backoffice: "Backoffice data link",
    adminConversationEnrichmentDemo: "Admin conversation demo",
  }[route] || "Dashboard";
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
        <PanelTitle label="Activity" title="Ultimas sesiones" />
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
  const energyCurve = buildEnergyCurve(health, healthSeries.bodyBattery);
  const hrvTrend = buildHrvTrend(healthSeries.hrv, sleep.hrv);
  const cards = [
    ["Body Battery", health.body_battery_current ?? 72, "/100", "Energy", health.body_battery_current ?? 72],
    ["Sleep Score", sleep.score, "/100", "Sleep", sleep.score],
    ["HRV", sleep.hrv, "ms", "Balance", Math.min(100, (sleep.hrv / 70) * 100)],
    ["Resting HR", health.resting_heart_rate_bpm ?? 54, "bpm", "Recovery", Math.max(20, 100 - (Number(health.resting_heart_rate_bpm ?? 54) - 42) * 2)],
    ["Stress", health.average_stress_level ?? 31, "avg", "Low is good", 100 - Number(health.average_stress_level ?? 31)],
    ["Respiration", health.respiration_avg_brpm ?? 13.8, "brpm", "Breath", 76],
    ["SpO2", health.spo2_avg_pct ?? 97, "%", "Oxygen", health.spo2_avg_pct ?? 97],
    ["Active Load", health.intensity_minutes ?? 126, "min", "Week", Math.min(100, ((health.intensity_minutes ?? 126) / 175) * 100)],
  ];

  return (
    <section className="viewStack">
      <section className="healthHero">
        <div>
          <span>Health command center</span>
          <h2>{readiness.label}</h2>
          <p>{readiness.copy}</p>
          <div className="healthTags">
            <span>{discipline.label} bias</span>
            <span>{readiness.training}</span>
            <span>{health.calendar_date || "today"}</span>
          </div>
        </div>
        <div className="healthScore">
          <strong>{readiness.score}</strong>
          <span>body state</span>
        </div>
      </section>
      <GarminHighlights health={health} sleep={sleep} readiness={readiness} />
      <GarminMetricGrid health={health} sleep={sleep} curve={energyCurve} hrvTrend={hrvTrend} />
      <div className="smartGrid">
        {cards.map(([title, value, unit, badge, progress]) => (
          <SmartCard key={title} title={title} value={value} unit={unit} badge={badge} progress={progress} />
        ))}
      </div>
      <section className="healthLayout">
        <SleepCard sleep={sleep} />
        <EnergyTimeline curve={energyCurve} />
      </section>
      <section className="healthLayout">
        <HealthDecision readiness={readiness} discipline={discipline} />
        <SignalBoard health={health} sleep={sleep} series={healthSeries} />
      </section>
      <ReadinessMatrix title={`${discipline.label} readiness`} cards={discipline.cards} />
    </section>
  );
}

function GarminHighlights({ health, sleep, readiness }) {
  const stress = Number(health.average_stress_level ?? 31);
  const battery = Number(health.body_battery_current ?? 72);
  return (
    <section className="garminSection">
      <PanelTitle label="Destacado" title="Resumen principal" />
      <div className="garminCarousel">
        <article className="garminFeatureCard">
          <span>Predisposicion para entrenar</span>
          <div className="readinessGauge" style={{ "--gauge": `${readiness.score * 3.6}deg` }}>
            <strong>{readiness.score}</strong>
          </div>
          <h3>{readiness.score >= 78 ? "Alta" : readiness.score >= 62 ? "Aceptable" : "Bajo"}</h3>
          <p>{readiness.score >= 78 ? "Puedes construir" : readiness.score >= 62 ? "Tomatelo con calma" : "Recuperacion primero"}</p>
          <div className="garminFactorGrid">
            <InfoPair label="Sueno" value={sleep.quality} />
            <InfoPair label="Recuperacion" value={battery > 65 ? "Buena" : "Poca necesidad"} />
            <InfoPair label="Estado VFC" value={sleep.hrv >= 50 ? "Equilibrado" : "Bajo"} />
            <InfoPair label="Estres reciente" value={stress < 40 ? "Mediano" : "Alto"} />
          </div>
        </article>
        <article className="garminFeatureCard overload">
          <span>Estado de entrenamiento</span>
          <h3>{readiness.score < 64 ? "Sobrecarga" : "Productivo"}</h3>
          <p>Foco de carga: carga aerobica de intensidad alta insuficiente.</p>
          <div className="loadFocusBars">
            <LoadFocus label="Anaerobico" value={306} max={520} color="#ad7cff" optimal={[170, 310]} />
            <LoadFocus label="Aerobica alta" value={61} max={520} color="#ff9b43" optimal={[190, 420]} />
            <LoadFocus label="Aerobica baja" value={448} max={520} color="#56d8e9" optimal={[230, 430]} />
          </div>
        </article>
        <article className="garminFeatureCard sleepCoach">
          <span>Entrenador de sueno</span>
          <h3>Se recomienda {sleep.score < 75 ? "9h" : "8h"}</h3>
          <p>{sleep.score < 75 ? "Te vendria bien dormir mucho mas hoy." : "Mantener hora de dormir estable."}</p>
          <div className="sleepCoachIcon">Zz</div>
        </article>
      </div>
    </section>
  );
}

function GarminMetricGrid({ health, sleep, curve, hrvTrend }) {
  const heart = Number(health.resting_heart_rate_bpm ?? 52);
  const battery = Number(health.body_battery_current ?? 72);
  return (
    <section className="garminSection">
      <PanelTitle label="Graficas" title="Salud Garmin" />
      <div className="garminMetricGrid">
        <article className="garminMiniCard">
          <span>Puntuacion de sueno</span>
          <div className="miniMetricRow">
            <strong>{sleep.score}</strong>
            <b>{sleep.duration}</b>
          </div>
          <MiniSleepChart stages={sleep.stages} />
          <footer>00:05 <em>05:53</em></footer>
        </article>
        <article className="garminMiniCard">
          <span>Estado de VFC</span>
          <div className="miniStatus danger">Bajo</div>
          <div className="miniMetricRow">
            <strong>{sleep.hrv} ms</strong>
            <b>Media de 7 dias</b>
          </div>
          <HrvTrend points={hrvTrend} />
          <footer>Ult. 4 semanas</footer>
        </article>
        <article className="garminMiniCard">
          <span>Body Battery</span>
          <MiniRing value={battery} />
          <SparkBars points={curve} />
          <div className="miniStack">
            <strong>+{health.body_battery_charged ?? 38}</strong>
            <span>Cargada</span>
            <strong>-{health.body_battery_drained ?? 38}</strong>
            <span>Agotada</span>
          </div>
        </article>
        <article className="garminMiniCard">
          <span>Frec. cardiaca</span>
          <MiniRing value={Math.max(18, 100 - (heart - 40) * 2)} label={heart} />
          <div className="miniStack">
            <strong>{heart} ppm</strong>
            <span>Descanso</span>
          </div>
        </article>
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
      <PanelTitle label="Sleep architecture" title="Recuperacion nocturna" />
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

function HealthDecision({ readiness, discipline }) {
  return (
    <article className="panel decisionCard">
      <PanelTitle label="AI health decision" title="Que haria hoy" />
      <strong>{readiness.training}</strong>
      <p>{readiness.plan}</p>
      <div className="actionTags">
        {discipline.prescription.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </article>
  );
}

function SignalBoard({ health, sleep }) {
  const signals = [
    ["Sleep debt", sleep.score >= 75 ? "Low" : "Medium", sleep.score],
    ["Stress load", Number(health.average_stress_level ?? 31) < 40 ? "Controlled" : "Watch", 100 - Number(health.average_stress_level ?? 31)],
    ["Oxygen", Number(health.spo2_avg_pct ?? 97) >= 95 ? "Stable" : "Review", health.spo2_avg_pct ?? 97],
    ["Respiration", Number(health.respiration_avg_brpm ?? 13.8) < 16 ? "Calm" : "High", 76],
  ];

  return (
    <article className="panel healthPanel">
      <PanelTitle label="Signal board" title="Alertas utiles" />
      <div className="signalBoard">
        {signals.map(([label, status, progress]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{status}</strong>
            <i><b style={{ width: `${progress}%` }} /></i>
          </div>
        ))}
      </div>
    </article>
  );
}

function ActivityView({ activityDetail }) {
  if (!activityDetail?.session) return <ActivityDetailSkeleton />;
  if (activityDetail.session.session_status === "archived") return <ArchivedSessionNotice detail={activityDetail} />;
  return (
    <section className="viewStack">
      <ActivitySummaryCard detail={activityDetail} />
      <ActivityElements detail={activityDetail} />
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

function ActivitiesOverview({ sessions, setRoute, setDiscipline, onOpenSession }) {
  const [selectedType, setSelectedType] = useState("all");
  const typedSessions = sessions.filter((session) => !isArchivedSession(session)).map(classifySession);
  const visible = selectedType === "all" ? typedSessions : typedSessions.filter((item) => item.activityType === selectedType);
  const week = buildActivityWeek(visible);
  const totalSeconds = visible.reduce((sum, item) => sum + Number(item.duration_seconds || item.durationSeconds || 0), 0);
  const activeDays = week.filter((day) => day.items.length).length || 7;
  const weekTitle = formatWeekRange(week);

  const openDetail = (item) => {
    if (item.activityType === "hybrid") setDiscipline("hyrox");
    if (item.activityType === "strength") setDiscipline("crossfit");
    if (item.activityType === "run") setDiscipline("trail");
    if (onOpenSession) onOpenSession(item);
    else setRoute("activityDetail");
  };

  return (
    <section className="activitiesOverview viewStack">
      <section className="activitiesHero">
        <div>
          <span>Selector de actividades</span>
          <h2>{selectedType === "all" ? "Todas las actividades" : activityTypes[selectedType].label}</h2>
          <p>Elige categoria y abre una sesion para ver sus smart cards generadas por metadata.</p>
        </div>
        <button onClick={() => visible[0] ? openDetail(visible[0]) : setRoute("activityDetail")}>Detalle</button>
      </section>
      <div className="activityTypeRail">
        {Object.entries(activityTypes).map(([id, type]) => (
          <button key={id} className={selectedType === id ? "active" : ""} onClick={() => setSelectedType(id)} style={{ "--type": type.color }}>
            <i />
            {type.label}
          </button>
        ))}
      </div>
      <section className="weeklyActivityCard">
        <PanelTitle label={selectedType === "all" ? "Todas" : activityTypes[selectedType].label} title={weekTitle} />
        <strong>{formatDurationLong(totalSeconds)}</strong>
        <StackedWeekBars week={week} />
        <div className="weekStats">
          <div><b>{formatDurationLong(totalSeconds)}</b><span>Tiempo total</span></div>
          <div><b>{formatDurationLong(Math.round(totalSeconds / activeDays))}</b><span>Media diaria</span></div>
        </div>
      </section>
      <section className="activityListPanel">
        <PanelTitle label="Actividades" title={selectedType === "all" ? "Todas las sesiones" : `Actividades de ${activityTypes[selectedType].label}`} />
        <div className="activityList">
          {visible.map((item) => (
            <button key={item.id} onClick={() => openDetail(item)} style={{ "--type": activityTypes[item.activityType].color }}>
              <i />
              <span>
                <strong>{item.title}</strong>
                <em>{item.date}</em>
              </span>
              <b>{formatDurationClock(item.duration_seconds || item.durationSeconds || 0)}</b>
            </button>
          ))}
          {!visible.length && <p className="emptyText">No hay sesiones visibles para este filtro.</p>}
        </div>
      </section>
    </section>
  );
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

function ExerciseTableCard({ title, blocks = [], exercises = [] }) {
  const hasBlocks = blocks.length > 0;
  const hasExercises = exercises.length > 0;

  return (
    <article className="activityElementCard wide">
      <PanelTitle title={hasBlocks ? "Resumen por bloques" : title} />
      {hasBlocks ? (
        <BlockSummaryTable blocks={blocks} />
      ) : !hasExercises ? (
        <div className="blockReconciliationWarning">Sin bloques conversacionales registrados.</div>
      ) : (
        <>
          <div className="blockReconciliationWarning">Sin bloques conversacionales registrados.</div>
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
        <div className="blockMetricCards">
          <MetricListCard
            title="Tiempo"
            items={[
              { label: "Tiempo total", value: block.temporal.tiempo },
              { label: "Tiempo de trabajo", value: block.temporal.activo },
              { label: "Tiempo de descanso", value: block.temporal.descanso },
            ]}
          />
          <MetricListCard
            title="Frecuencia cardíaca"
            items={[
              { label: "Frecuencia cardíaca media", value: block.temporal.fcMedia === "—" ? "—" : `${block.temporal.fcMedia} ppm` },
              { label: "Frecuencia cardíaca máxima", value: block.temporal.fcMax === "—" ? "—" : `${block.temporal.fcMax} ppm` },
            ]}
          />
        </div>
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
      <span>{exercise.active_seconds ? formatDurationClock(exercise.active_seconds) : "—"}</span>
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
        <div><strong>{aerobicValue == null ? "—" : aerobicValue.toFixed(1)}</strong><span>Aerobica</span></div>
        <div><strong>{anaerobicValue == null ? "—" : anaerobicValue.toFixed(1)}</strong><span>Anaerobico</span></div>
      </div>
      <TrainingEffectGarminScale label="Aerobica" value={aerobic} type="aerobic" />
      <TrainingEffectGarminScale label="Anaerobico" value={anaerobic} type="anaerobic" />
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
        <div><strong>{avg == null ? "—" : avg}</strong><span>{card.unit} Media</span></div>
        <div><strong>{max == null ? "—" : max}</strong><span>{card.unit} Maximo</span></div>
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
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafico de frecuencia cardiaca Garmin-like">
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

function CoachView({ messages, setMessages, discipline, health }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!draft.trim()) return;
    const userMessage = { role: "user", content: draft.trim() };
    const answer = {
      role: "assistant",
      content: buildCoachReply(draft, discipline, health),
    };
    setMessages([...messages, userMessage, answer]);
    setDraft("");
  };

  return (
    <section className="coachView">
      <SectionLead icon={Bot} title="Coach IA" text="Asistente conversacional local: usa el contexto de disciplina, salud y carga para proponer el siguiente paso." />
      <div className="chatLog">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
            {message.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="coachComposer">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send()}
          placeholder="Ej: que hago hoy si tengo HYROX en 3 semanas?"
        />
        <button onClick={send}>Enviar</button>
      </div>
    </section>
  );
}

function ProfileView({ profile, setProfile, fitImports, dataState, projectUrl, session, authNotice, setAuthNotice, onSync }) {
  return (
    <section className="viewStack">
      <section className="profileCard">
        <div className="avatar">{profile.avatar}</div>
        <div>
          <span>Mi profile</span>
          <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
          <p>{profile.primaryGoal}</p>
        </div>
      </section>
      <AuthPanel session={session} notice={authNotice} setNotice={setAuthNotice} onSync={onSync} />
      <section className="panel">
        <PanelTitle label="Garmin" title="Conexion e ingestion" />
        <div className="integrationRows">
          <InfoRow label="Estado" value={profile.garminStatus} />
          <InfoRow label="Modo actual" value={profile.garminMode} />
          <InfoRow label="Supabase" value={`${SUPABASE_PROJECT_NAME} · ${projectUrl}`} />
          <InfoRow label="Lectura app" value={dataState.detail} />
          <InfoRow label="FIT cargados" value={`${fitImports.length}`} />
        </div>
      </section>
      <ActionPanel title="Pipeline operativo" cta="Marcar Garmin preparado" onClick={() => setProfile({ ...profile, garminStatus: "FIT OK · ready for Garmin official API" })}>
        <span>Cargar .fit desde Garmin Connect/export del reloj</span>
        <span>Normalizar a training_sessions + fit_message_payloads</span>
        <span>Cuando Garmin API este aprobada, cambiar a integracion oficial</span>
      </ActionPanel>
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
      setNotice("Falta .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }
    if (!email.trim() || !password.trim()) {
      setNotice("Email y password son necesarios para entrar al backoffice.");
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

    setNotice(mode === "signup" ? "Usuario creado. Si Supabase pide confirmacion, revisa email." : "Sesion iniciada.");
    if (onSync) onSync();
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setNotice("Sesion cerrada.");
  };

  return (
    <section className="authPanel">
      <div className="authHeader">
        <div className="leadIcon">
          {session ? <CheckCircle2 size={22} /> : <LockKeyhole size={22} />}
        </div>
        <div>
          <span>Backoffice auth</span>
          <h3>{session ? "Sesion conectada" : "Entrar con Supabase"}</h3>
          <p>{session ? session.user.email : "Necesario para que RLS entregue tus datos privados."}</p>
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

function BackofficeView({ session, dataState, backoffice, fitImports, setFitImports, onSync, onImportedSession, authNotice, setAuthNotice }) {
  return (
    <section className="viewStack">
      <SectionLead
        icon={Database}
        title="Backoffice"
        text="Conexion operativa con Supabase/Hybriq: auth, tablas, fuentes FIT y diagnostico de RLS."
      />
      <AuthPanel session={session} notice={authNotice} setNotice={setAuthNotice} onSync={onSync} />
      <FitDropzone fitImports={fitImports} setFitImports={setFitImports} session={session} onSync={onSync} onImportedSession={onImportedSession} />
      <section className="panel">
        <PanelTitle label="Sync" title="Estado de datos" />
        <div className="integrationRows">
          <InfoRow label="Proyecto" value={`${SUPABASE_PROJECT_NAME} · ${SUPABASE_PROJECT_URL}`} />
          <InfoRow label="Estado app" value={`${dataState.source} · ${dataState.detail}`} />
          <InfoRow label="Ultima sincronizacion" value={backoffice.lastSync ? new Date(backoffice.lastSync).toLocaleString("es-ES") : "Pendiente"} />
        </div>
      </section>
      <section className="panel">
        <PanelTitle label="Tables" title="Lectura de tablas" />
        <div className="tableStatusGrid">
          {(backoffice.tableStatus || []).map((item) => (
            <article key={item.table} className={item.error ? "tableStatus error" : "tableStatus ok"}>
              <span>{item.table}</span>
              <strong>{item.error ? "Bloqueada" : `${item.count} rows`}</strong>
              {item.error && <p>{item.error}</p>}
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <PanelTitle label="Garmin sources" title="Ultimas fuentes FIT/backoffice" />
        <div className="sessionList">
          {(backoffice.sources || []).map((source) => (
            <article key={source.id}>
              <div className="sessionIcon">
                <FileUp size={17} />
              </div>
              <div>
                <strong>{source.original_filename || source.source_name}</strong>
                <span>{source.source_type} · {source.import_status}</span>
              </div>
              <b>{source.imported_at ? new Date(source.imported_at).toLocaleDateString("es-ES") : "FIT"}</b>
            </article>
          ))}
          {!(backoffice.sources || []).length && <p className="emptyText">Aun no hay fuentes visibles para esta sesion.</p>}
        </div>
      </section>
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
          ? `${parsed.length} FIT procesado(s), pero ${failed.length} no entraron completos en backoffice. Mira el detalle debajo.`
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
        <strong>Carga .fit Garmin</strong>
        <span>Selecciona un .fit o un .zip exportado de Garmin. En movil usa Archivos/Mis archivos.</span>
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
            <InfoRow key={`${item.name}-${item.importedAt}`} label={item.name} value={`${item.sizeKb} KB · ${item.status} · ${item.backoffice || "local"}`} />
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

    const { data: existingByDay } = !existingByReference?.id && normalized.localDate
      ? await supabase
          .from("training_sessions")
          .select("id, title, session_structure, tags")
          .eq("user_id", userId)
          .eq("local_date", normalized.localDate)
          .neq("session_status", "archived")
          .contains("tags", ["garmin_fit"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const existing = existingByReference || existingByDay;

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
          tags: mergeTags([normalized.activityType], ["garmin_fit", "parsed"]),
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
          tags: mergeTags(existing.tags, ["garmin_fit", "parsed"]),
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
  const records = Array.isArray(fit.records) ? fit.records : collectNestedRecords(fit.sessions);
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
  const startedAt = toIso(session.start_time || session.start_date || firstItem(records)?.timestamp || fit.timestamp);
  const durationSeconds = Math.round(Number(session.total_timer_time || session.total_elapsed_time || fit.active_time || 0));
  const activityType = activityLabel(session.sport || sport.sport, session.sub_sport || sport.sub_sport);
  const temporalSegments = normalizeFitTemporalSegments({ laps, sets, splits, events, records, startedAt });
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
  const temperatures = samples.map((sample) => Number(sample.temperature_c || 0)).filter(Boolean);
  const workSeconds = Math.round(Number(session.total_timer_time || fit.active_time || durationSeconds));
  const restSeconds = Math.max(0, durationSeconds - workSeconds);
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
    local_date: startedAt ? startedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    start_time_utc: startedAt,
    duration_total_seconds: durationSeconds,
    duration_elapsed_seconds: Math.round(Number(session.total_elapsed_time || durationSeconds)),
    duration_work_seconds: workSeconds,
    duration_rest_seconds: restSeconds,
    heart_rate: {
      avg_bpm: Math.round(Number(session.avg_heart_rate || average(heartValues) || 0)),
      max_bpm: Math.round(Number(session.max_heart_rate || Math.max(...heartValues, 0))),
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
      active_sets: exercises.length || nullableNumber(session.num_active_sets) || 0,
      set_messages: sets.length,
      repetitions_total: repsTotal,
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
    heart_rate_zones_reported: reportedZones,
    checksum,
  };

  return {
    title: activityType,
    activityType: classifyActivityTypeFromSummary(summary),
    startedAt,
    localDate: summary.local_date,
    durationSeconds,
    distanceMeters: nullableNumber(session.total_distance),
    samples,
    exercises,
    fitMessages,
    summary,
    metrics: buildSessionMetrics(summary),
  };
}

function arrayFromFitValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function messageRows(rawMessages, messageType, fallback) {
  return rawMessages?.[messageType]?.length ? rawMessages[messageType] : arrayFromFitValue(fallback);
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

    return groups;
  } catch (error) {
    console.warn("FIT raw message grouping failed", error);
    return {};
  }
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

function segmentsFromRows(rows, source, startedAt) {
  const baseTime = startedAt ? new Date(startedAt).getTime() : null;
  return rows
    .map((row, index) => {
      const start = elapsedFromFitRow(row, ["start_elapsed_seconds", "start_time_seconds", "start_elapsed_time", "elapsed_time"], "start_time", baseTime);
      const active = nullableNumber(row.active_seconds ?? row.active_time ?? row.total_timer_time ?? row.total_timer_time_seconds ?? row.timer_time ?? row.duration);
      const total = nullableNumber(row.duration_seconds ?? row.total_elapsed_time ?? row.total_elapsed_time_seconds ?? row.elapsed_time) ?? active;
      const rest = nullableNumber(row.rest_seconds) ?? (active != null && total != null && total >= active ? total - active : null);
      const end = elapsedFromFitRow(row, ["end_elapsed_seconds", "end_time_seconds", "end_elapsed_time"], "end_time", baseTime) ?? (start != null && total != null ? start + total : null);
      return {
        source,
        order: fitMessageOrder(row.message_index ?? row.message_number ?? row.lap_index ?? row.set_index) ?? index,
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

function activityLabel(sport, subSport) {
  const sportText = fitValueText(sport);
  const subSportText = fitValueText(subSport);
  const joined = `${sportText} ${subSportText}`.toLowerCase();
  if (joined.includes("strength")) return "Fuerza";
  if (joined.includes("pilates")) return "Pilates";
  if (joined.includes("yoga")) return "Yoga";
  if (joined.includes("swim")) return "Natacion";
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
    ["avg_heart_rate", "Frecuencia cardiaca media", summary.heart_rate.avg_bpm, "bpm"],
    ["max_heart_rate", "Frecuencia cardiaca maxima", summary.heart_rate.max_bpm, "bpm"],
    ["calories_total", "Calorias totales", summary.calories.total_kcal, "kcal"],
    ["active_calories", "Calorias activas", summary.calories.active_kcal, "kcal"],
    ["resting_calories", "Calorias en reposo", summary.calories.rest_kcal, "kcal"],
    ["training_effect_aerobic", "Training Effect aerobico", summary.training_effect.aerobic, ""],
    ["training_effect_anaerobic", "Training Effect anaerobico", summary.training_effect.anaerobic, ""],
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

function ReadinessMatrix({ title, cards }) {
  return (
    <section className="panel">
      <PanelTitle label="Smart cards" title={title} />
      <div className="smartGrid">
        {cards.map(([titleItem, value, unit, badge, progress]) => (
          <SmartCard key={titleItem} title={titleItem} value={value} unit={unit} badge={badge} progress={progress} />
        ))}
      </div>
    </section>
  );
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

function ActionPanel({ title, cta, onClick, children }) {
  return (
    <section className="actionPanel">
      <div>
        <span>Next best action</span>
        <h3>{title}</h3>
        <div className="actionTags">{children}</div>
      </div>
      <button onClick={onClick}>
        {cta}
        <ChevronRight size={16} />
      </button>
    </section>
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

function buildCoachReply(input, discipline, health) {
  const stress = Number(health.average_stress_level ?? 31);
  const battery = Number(health.body_battery_current ?? 72);
  const lower = input.toLowerCase();
  const caution = stress > 55 || battery < 45;
  const intent = lower.includes("hyrox")
    ? "HYROX"
    : lower.includes("trail")
      ? "trail"
      : lower.includes("crossfit")
        ? "CrossFit"
        : discipline.label;

  if (caution) {
    return `Para ${intent}, hoy bajo el coste: ${discipline.prescription[0]}, tecnica suave y salida Z2. Body Battery ${battery}, stress ${stress}: queremos continuidad, no factura manana.`;
  }

  return `Para ${intent}, iria con ${discipline.prescription.join(" + ")}. Readiness suficiente: manten RPE 7/10 y corta si la tecnica cae dos series seguidas.`;
}

function computeHealthReadiness(health) {
  const battery = Number(health.body_battery_current ?? 72);
  const stress = Number(health.average_stress_level ?? 31);
  const rhr = Number(health.resting_heart_rate_bpm ?? 54);
  const oxygen = Number(health.spo2_avg_pct ?? 97);
  const score = Math.round(
    battery * 0.42 +
      (100 - stress) * 0.28 +
      Math.max(0, 100 - Math.abs(rhr - 52) * 3) * 0.18 +
      Math.min(100, oxygen) * 0.12,
  );

  if (score >= 78) {
    return {
      score,
      label: "Ready to build",
      training: "Intensidad controlada",
      copy: "El sistema esta bastante limpio: energia util, stress controlado y senales respiratorias estables.",
      plan: "Puedes entrenar, pero con una regla: calidad antes que volumen. Mantendria una sesion fuerte corta o tecnica con salida facil.",
    };
  }

  if (score >= 62) {
    return {
      score,
      label: "Train, but narrow",
      training: "Base + tecnica",
      copy: "Hay energia suficiente, pero no conviene abrir demasiados frentes. Buen dia para construir sin deuda.",
      plan: "Me quedaria en Boyle/Zone 2, movilidad y fuerza limpia. Evitaria un metcon largo o competir contra el reloj.",
    };
  }

  return {
    score,
    label: "Recovery bias",
    training: "Recuperacion activa",
    copy: "Las senales piden bajar coste: priorizar sueno, respiracion y movimiento suave.",
    plan: "Hoy no compraria fatiga. Caminata, movilidad, respiracion nasal y preparar manana.",
  };
}

function buildSleepModel(health, sleepSession, hrvRows = []) {
  const fallbackScore = Math.round(Math.min(92, Math.max(58, 82 - Number(health.average_stress_level ?? 31) * 0.16 + Number(health.body_battery_current ?? 72) * 0.08)));
  const score = Math.round(Number(sleepSession?.sleep_score ?? fallbackScore));
  const hrvSource = sleepSession?.hrv_last_night_avg_ms ?? hrvRows?.[0]?.last_night_avg_ms;
  const hrv = Math.round(Number(hrvSource ?? 44 + Number(health.body_battery_current ?? 72) * 0.14 - Number(health.average_stress_level ?? 31) * 0.05));
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
    score,
    hrv,
    duration: durationSeconds ? formatDuration(durationSeconds) : score > 80 ? "7h 48m" : score > 68 ? "7h 05m" : "6h 22m",
    quality: score > 80 ? "good" : score > 68 ? "usable" : "light",
    note: score > 76 ? "La noche permite absorber carga moderada." : "La noche no bloquea entrenar, pero pide margen y menos lactato.",
    stages: stages && totalStageSeconds
      ? stages.map(([label, seconds]) => ({
          label,
          value: Math.round((Number(seconds || 0) / totalStageSeconds) * 100),
          text: formatDuration(seconds || 0),
        }))
      : [
          ["Deep", 18, "1h 24m"],
          ["Light", 48, "3h 42m"],
          ["REM", 24, "1h 52m"],
          ["Awake", 10, "46m"],
        ].map(([label, value, text]) => ({ label, value, text })),
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
  return [fallback - 8, fallback - 4, fallback - 2, fallback, fallback + 2, fallback + 1, fallback - 5].map((value) => Math.round(value));
}

function isArchivedSession(item) {
  return `${item?.session_status || ""}`.toLowerCase() === "archived";
}

function mapTrainingSession(item) {
  const summary = item.session_structure?.garmin_fit_summary || {};
  const durationMinutes = item.duration_seconds ? Math.round(item.duration_seconds / 60) : null;
  const distanceKm = item.distance_meters ? Number(item.distance_meters) / 1000 : null;
  const score = Math.max(48, Math.min(96, 64 + (durationMinutes ? Math.min(20, durationMinutes / 4) : 8)));
  const title = summary.activity_type || cleanGarminTitle(item.title) || item.title || readableSessionTitle(item);

  return {
    id: item.id,
    user_id: item.user_id,
    title,
    type: item.session_kind || item.session_status || "session",
    duration_seconds: Number(item.duration_seconds || 0),
    started_at: item.started_at,
    local_date: item.local_date,
    created_at: item.created_at,
    source_id: item.source_id,
    tags: item.tags || [],
    session_structure: item.session_structure,
    session_status: item.session_status,
    score: Math.round(score),
    date: item.local_date || (item.started_at ? new Date(item.started_at).toLocaleDateString("es-ES") : "Recent"),
    meta: [durationMinutes ? `${durationMinutes} min` : null, distanceKm ? `${distanceKm.toFixed(1)} km` : null]
      .filter(Boolean)
      .join(" · "),
  };
}

function classifySession(session) {
  const summary = session.session_structure?.garmin_fit_summary || {};
  const title = `${session.title || ""} ${session.type || ""} ${summary.sport || ""} ${summary.sub_sport || ""} ${summary.activity_type || ""}`.toLowerCase();
  let activityType = "hybrid";
  if (title.includes("run") || title.includes("correr") || title.includes("trail")) activityType = "run";
  if (title.includes("swim") || title.includes("natacion") || title.includes("nataci")) activityType = "swim";
  if (title.includes("strength") || title.includes("fuerza") || title.includes("gym") || title.includes("fitness")) activityType = "strength";
  if (title.includes("pilates") || title.includes("yoga")) activityType = "pilates";
  if (
    title.includes("hiit") ||
    title.includes("cardio_training") ||
    title.includes("cardio") ||
    title.includes("training") ||
    title.includes("workout") ||
    title.includes("fitness_equipment") ||
    title.includes("other")
  ) activityType = "hiit";
  if (title.includes("hyrox") || title.includes("deka") || title.includes("crossfit")) activityType = "hybrid";
  return {
    ...session,
    activityType,
    durationSeconds: Number(session.duration_seconds || parseDurationToSeconds(session.meta) || 3200),
  };
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
  if (aerobic < 1 && anaerobic < 1) return "Base (Aerobica baja)";
  if (anaerobic > aerobic) return "Sprint (Anaerobico)";
  if (aerobic >= 2.5) return "Mejora aerobica";
  return "Base (Aerobica)";
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

function getActivityTimeMetrics(session, metrics, blocks = [], summary = {}, fallbackDuration = 0) {
  const totalSeconds = Number(summary.duration_total_seconds || session.duration_seconds || fallbackDuration || 0);
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

  const metricActive = numberMetric(metrics, ["active_time", "work_time", "moving_time", "total_timer_time"], null);
  const metricRest = numberMetric(metrics, ["rest_time", "elapsed_rest_time", "total_rest_time"], null);
  const summaryActive = summary.duration_work_seconds;
  const summaryRest = summary.duration_rest_seconds;
  const activeCandidate = validDuration(summaryActive) ? Number(summaryActive) : validDuration(metricActive) ? Number(metricActive) : null;
  const restCandidate = validDuration(summaryRest) ? Number(summaryRest) : validDuration(metricRest) ? Number(metricRest) : null;

  if (activeCandidate != null && restCandidate != null && !(activeCandidate === totalSeconds && restCandidate === 0)) {
    return {
      totalSeconds,
      activeSeconds: Math.round(activeCandidate),
      restSeconds: Math.round(restCandidate),
      source: "garmin_metrics",
      confidence: "reported",
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
    weight: row.load_value ? `${row.load_value} ${row.load_unit || "kg"}` : "—",
  }));
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
      name: block.name || "Bloque",
      executionText: buildBlockExecution(block),
      temporal: getBlockTemporalMetrics(block),
      temporalWindow: {
        start: optionalNumber(block.start_elapsed_seconds),
        end: optionalNumber(block.end_elapsed_seconds),
      },
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
      block_type: block.block_type || block.type || prescription.block_type || "conversation",
      name: block.name || block.title || prescription.name || `Bloque ${index + 1}`,
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
      execution_notes: block.execution_notes || block.notes || "",
      data_confidence: block.data_confidence || "conversation_enrichment",
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

function buildTemporalWarningText(block) {
  const reconciliation = block.prescription?.temporal_reconciliation;
  if (reconciliation?.warning) return reconciliation.warning;
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
    const parts = [];
    const loadValue = optionalNumber(item.load_value ?? row.load_value);
    const loadUnit = item.load_unit || row.load_unit || "kg";
    if (sets) parts.push(`${formatNumberValue(sets)} series`);
    if (work.text) parts.push(work.text);
    if (item.side === "each_side" || row.side === "each_side") {
      if (!/lado/i.test(parts.join(" "))) parts.push("por lado");
    }
    if (loadValue) parts.push(`${formatNumberValue(loadValue)} ${loadUnit}`);
    return {
      name,
      detailText: parts.length ? parts.join(" · ") : "—",
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
  const cut = Boolean(prescription.reason_for_cut || `${block.execution_notes || ""}`.toLowerCase().includes("cort"));

  if (planned && completed) {
    return `${formatNumberValue(completed)}/${formatNumberValue(planned)} rondas${cut ? " · cortado" : ""}`;
  }
  if (completed && format === "superserie") return `${formatNumberValue(completed)} superseries`;
  if (completed) return `${formatNumberValue(completed)} rondas suaves`;
  if (format) return format;
  return cut ? "cortado" : "—";
}

function buildBlockSummary(block, rows) {
  const prescriptionSummary = blockDescriptionFromPrescription(block.prescription);
  const summary = prescriptionSummary || rows.map((row) => simplifyExerciseName(row.reported_name)).filter(Boolean).join(" · ");
  return compactBlockSummary(summary) || "—";
}

function buildBlockSensation(block, rows = []) {
  const prescription = block.prescription || {};
  const parts = [];
  if (block.execution_notes) parts.push(block.execution_notes);
  if (prescription.reason_for_cut) parts.push(prescription.reason_for_cut);
  if (Array.isArray(prescription.coach_interpretation)) parts.push(...prescription.coach_interpretation);
  return compactSentences(parts) || "—";
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
    skill: "Tecnica",
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
  return formatted || "—";
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
  return `${value || ""}`.replaceAll("_", " ");
}

function safeValue(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  if (typeof value === "number" && Number.isNaN(value)) return fallback;
  return `${value}`;
}

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function formatOptionalDuration(value) {
  if (value == null || value === "") return "—";
  const seconds = Number(value);
  if (Number.isNaN(seconds) || seconds <= 0) return "—";
  return formatDurationClock(seconds);
}

function formatBpm(value) {
  if (value == null || value === "") return "—";
  const bpm = Number(value);
  if (Number.isNaN(bpm) || bpm <= 0) return "—";
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
  if (resolved == null || resolved === "" || (typeof resolved === "number" && Number.isNaN(resolved))) return "—";
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

function mapReportedHeartRateZones(reported) {
  const sourceZones = reported?.zones || [];
  if (!sourceZones.length) return [];
  const reportedTotal = optionalNumber(reported?.total_seconds);
  const totalSeconds = Math.max(1, reportedTotal ?? sourceZones.reduce((sum, zone) => sum + Number(zone.seconds || 0), 0));
  const zoneMeta = {
    Z5: { label: "Zona 5", name: "Maximo", color: "#e63b41" },
    Z4: { label: "Zona 4", name: "Umbral", color: "#ff8c2f" },
    Z3: { label: "Zona 3", name: "Aerobica", color: "#72ce29" },
    Z2: { label: "Zona 2", name: "Suave", color: "#4aa8ff" },
    Z1: { label: "Zona 1", name: "Calentamiento", color: "#d9d9d9" },
  };
  return ["Z5", "Z4", "Z3", "Z2", "Z1"].map((key) => {
    const item = sourceZones.find((zone) => zone.zone === key) || {};
    const seconds = Number(item.seconds || 0);
    const min = optionalNumber(item.min_bpm ?? item.min_heart_rate_bpm);
    const max = optionalNumber(item.max_bpm ?? item.max_heart_rate_bpm);
    if (min == null) return null;
    return {
      ...zoneMeta[key],
      min,
      max: max ?? Infinity,
      range: max == null ? `> ${min - 1} ppm` : `${min} - ${max} ppm`,
      seconds,
      percent: Math.round((seconds / totalSeconds) * 100),
    };
  }).filter(Boolean);
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


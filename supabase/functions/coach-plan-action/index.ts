import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildTrainingRecommendation } from "../../../src/coachContext/trainingRecommendation.js";
import {
  normalizeCoachPlanLocation,
  toPlannedRecommendationPayload,
} from "../../../src/coachContext/coachPlanAction.js";
import { resolveUserCalendar } from "../../../src/time/userCalendar.js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

async function loadUserTimezone(db: any, userId: string) {
  const result = await db
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .limit(1);

  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0]?.timezone || null : null;
}

async function loadPlannedTraining(db: any, userId: string, date: string) {
  const result = await db
    .from("planned_training_sessions")
    .select("id, title, status")
    .eq("user_id", userId)
    .eq("planned_date", date)
    .order("created_at", { ascending: true })
    .limit(5);

  if (result.error) throw result.error;
  return {
    date,
    sessions: Array.isArray(result.data) ? result.data : [],
  };
}

async function loadRecommendationConstraints(db: any, userId: string) {
  const result = await db
    .from("coach_athlete_constraints")
    .select("constraint_type, severity, description, active")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ ok: false, error: "auth_required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("coach_plan_action_missing_server_config");
      return reply({ ok: false, error: "server_configuration_error" }, 500);
    }

    const userDb = createClient(
      supabaseUrl,
      anonKey,
      { global: { headers: { Authorization: auth } } },
    );

    const userId = (await userDb.auth.getUser()).data.user?.id;
    if (!userId) return reply({ ok: false, error: "invalid_user" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action !== "save_recommendation_today") {
      return reply({ ok: false, error: "unsupported_action" }, 400);
    }

    const profileTimezone = await loadUserTimezone(userDb, userId);
    const calendar = resolveUserCalendar({
      profileTimezone,
      clientTimezone: body.client_timezone || null,
      now: new Date(),
    });
    if (!calendar.ok || !calendar.date) {
      return reply({ ok: false, error: calendar.error || "invalid_calendar" }, 400);
    }

    const date = String(body.date || calendar.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply({ ok: false, error: "invalid_date" }, 400);
    }
    if (date !== calendar.date) {
      return reply({
        ok: false,
        error: "stale_recommendation_date",
        message: "Esta recomendación ya no corresponde a hoy. Vuelve a preguntar qué entrenar hoy.",
        request_date: calendar.date,
        calendar_timezone: calendar.timezone,
      });
    }

    const requestedLocationKey = body.location == null
      ? null
      : normalizeCoachPlanLocation(body.location);
    if (body.location != null && !requestedLocationKey) {
      return reply({ ok: false, error: "invalid_location" }, 400);
    }

    const contextResult = await userDb.rpc("get_ai_coach_context", {
      p_user_id: userId,
      p_date: date,
      p_mode: "today_coach",
      p_from_date: null,
      p_to_date: null,
      p_session_id: null,
    });
    if (contextResult.error) throw contextResult.error;

    const context = contextResult.data || {};
    context.request = {
      ...(context.request || {}),
      date,
      reference_date: date,
    };
    context.planned_training = await loadPlannedTraining(userDb, userId, date);

    if (context.planned_training.sessions.length) {
      return reply({
        ok: false,
        error: "plan_already_exists",
        message: "Ya existe un plan para hoy; no se ha creado otro.",
      });
    }

    context.recommendation_context = {
      constraints: await loadRecommendationConstraints(userDb, userId),
    };

    const requestedLocation = requestedLocationKey
      ? { key: requestedLocationKey }
      : null;
    const recommendation = buildTrainingRecommendation(context, { requestedLocation });

    if (!recommendation) {
      return reply({ ok: false, error: "plan_already_exists" });
    }
    if (recommendation.insufficient) {
      return reply({
        ok: false,
        error: "recommendation_unavailable",
        reason: recommendation.reason || "insufficient_enqidu_context",
      });
    }

    const storageRecommendation = toPlannedRecommendationPayload({
      ...recommendation,
      environment: recommendation.environment || requestedLocationKey,
    });
    if (!storageRecommendation) {
      return reply({ ok: false, error: "unsupported_recommendation_type" });
    }

    // Important: keep this admin client separate from userDb. Do not attach the
    // user's Authorization header; the service role is used only for the narrow
    // service-only writer below.
    const adminDb = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const saveResult = await adminDb.rpc("save_coach_recommendation_plan", {
      p_user_id: userId,
      p_planned_date: date,
      p_session: storageRecommendation,
    });
    if (saveResult.error) throw saveResult.error;

    const saved = saveResult.data || {};
    if (!saved.ok) {
      return reply({
        ok: false,
        error: saved.error || "plan_save_rejected",
        message: saved.error === "plan_already_exists"
          ? "Ya existe un plan para hoy; no se ha creado otro."
          : null,
      });
    }

    return reply({
      ok: true,
      action: "save_recommendation_today",
      saved: true,
      planned_session: {
        date,
        title: recommendation.title,
        session_type: storageRecommendation.session_type,
        duration_minutes: recommendation.duration_minutes,
        intensity: recommendation.intensity,
        environment: storageRecommendation.environment,
        blocks_count: recommendation.blocks.length,
      },
      response_mode: "deterministic_action",
      llm_used: false,
      usage: null,
      request_date: calendar.date,
      calendar_timezone: calendar.timezone,
    });
  } catch (error) {
    console.error("coach_plan_action_failed", error);
    return reply({
      ok: false,
      error: "coach_plan_action_failed",
      detail: String((error as Error)?.message || error),
    }, 500);
  }
});

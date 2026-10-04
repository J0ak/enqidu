import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildTrainingRecommendation } from "../../../src/coachContext/trainingRecommendation.js";
import {
  normalizeCoachPlanLocation,
  toPlannedRecommendationPayload,
} from "../../../src/coachContext/coachPlanAction.js";
import {
  isPlanDateOnOrAfter,
  resolveNextWeekdayDate,
  scalePlannedBlockDurations,
  shiftPlanCalendarDate,
} from "../../../src/coachTools/planActions.js";
import { resolveUserCalendar } from "../../../src/time/userCalendar.js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

const supportedActions = new Set([
  "save_recommendation_today",
  "move_planned_session",
  "set_training_unavailability",
  "adapt_session_environment",
  "adapt_session_duration",
  "cancel_planned_session",
]);

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
    .select("id, title, status, source, linked_completed_session_id, location_type, session_type, planned_intensity, planned_duration_min, planned_duration_max, objective")
    .eq("user_id", userId)
    .eq("planned_date", date)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(5);

  if (result.error) throw result.error;
  return {
    date,
    sessions: Array.isArray(result.data) ? result.data : [],
  };
}

async function loadPlannedBlocks(db: any, plannedSessionId: string) {
  const result = await db
    .from("planned_session_blocks")
    .select("id, block_order, title, planned_duration_seconds")
    .eq("planned_session_id", plannedSessionId)
    .order("block_order", { ascending: true });

  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

async function loadTrainingAvailability(db: any, userId: string, date: string) {
  const result = await db
    .from("training_availability_overrides")
    .select("calendar_date, availability_status, source")
    .eq("user_id", userId)
    .eq("calendar_date", date)
    .limit(1);

  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : null;
  return row
    ? {
        date: row.calendar_date || date,
        status: row.availability_status || null,
        source: row.source || null,
      }
    : null;
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

function moveErrorMessage(error: string | null) {
  if (error === "source_plan_not_found") {
    return "No encuentro ese entrenamiento planificado; vuelve a consultar tu plan antes de moverlo.";
  }
  if (error === "source_plan_ambiguous") {
    return "Hay más de una sesión en ese día. Necesito que abras o identifiques una sesión concreta antes de moverla.";
  }
  if (error === "target_plan_already_exists") {
    return "Ya hay un entrenamiento planificado en el día de destino. No he movido nada.";
  }
  return null;
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
    const action = String(body.action || "");
    if (!supportedActions.has(action)) {
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

    // Keep the admin client isolated from userDb. The browser never receives
    // service-role credentials; this client only calls narrow service-only RPCs.
    const adminDb = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (action === "set_training_unavailability") {
      const dateReference = String(body.date_reference || "");
      if (!["today", "tomorrow"].includes(dateReference)) {
        return reply({ ok: false, error: "invalid_date_reference" }, 400);
      }

      const targetDate = dateReference === "today"
        ? calendar.date
        : shiftPlanCalendarDate(calendar.date, 1);
      if (!targetDate) {
        return reply({ ok: false, error: "invalid_calendar" }, 400);
      }

      const availabilityResult = await adminDb.rpc("set_coach_training_unavailability", {
        p_user_id: userId,
        p_date: targetDate,
      });
      if (availabilityResult.error) throw availabilityResult.error;

      const availability = availabilityResult.data || {};
      if (!availability.ok) {
        return reply({
          ok: false,
          error: availability.error || "training_unavailability_rejected",
        });
      }

      const planned = await loadPlannedTraining(userDb, userId, targetDate);
      const plannedTitles = planned.sessions
        .map((session: any) => session?.title || null)
        .filter(Boolean);

      return reply({
        ok: true,
        action,
        marked_unavailable: true,
        date_reference: dateReference,
        date: targetDate,
        planned_conflict: planned.sessions.length > 0,
        planned_titles: plannedTitles,
        response_mode: "deterministic_action",
        llm_used: false,
        usage: null,
        request_date: calendar.date,
        calendar_timezone: calendar.timezone,
      });
    }

    if (action === "cancel_planned_session") {
      const sourceDate = String(body.source_date || "");
      if (!isPlanDateOnOrAfter(sourceDate, calendar.date)) {
        return reply({
          ok: false,
          error: "stale_plan_source_date",
          message: "Ese plan ya no corresponde a hoy o a una fecha futura. Vuelve a consultar el plan antes de cancelarlo.",
          request_date: calendar.date,
          calendar_timezone: calendar.timezone,
        }, 400);
      }

      const planned = await loadPlannedTraining(userDb, userId, sourceDate);
      if (!planned.sessions.length) {
        return reply({
          ok: false,
          error: "source_plan_not_found",
          message: "No encuentro ese entrenamiento planificado; vuelve a consultar tu plan antes de cancelarlo.",
        });
      }
      if (planned.sessions.length > 1) {
        return reply({
          ok: false,
          error: "source_plan_ambiguous",
          message: "Hay más de una sesión en ese día. Necesito que identifiques una sesión concreta antes de cancelarla.",
        });
      }

      const sourceSession = planned.sessions[0];
      if (sourceSession.linked_completed_session_id) {
        return reply({
          ok: false,
          error: "source_plan_already_completed",
          message: "Ese entrenamiento ya tiene una ejecución enlazada y no lo cancelo como plan.",
        });
      }

      const cancelResult = await adminDb.rpc("cancel_coach_planned_session", {
        p_user_id: userId,
        p_planned_date: sourceDate,
        p_planned_session_id: sourceSession.id,
      });
      if (cancelResult.error) throw cancelResult.error;

      const cancelled = cancelResult.data || {};
      if (!cancelled.ok) {
        return reply({
          ok: false,
          error: cancelled.error || "plan_cancellation_rejected",
          message: cancelled.error === "source_plan_already_completed"
            ? "Ese entrenamiento ya tiene una ejecución enlazada y no lo cancelo como plan."
            : null,
        });
      }

      return reply({
        ok: true,
        action,
        cancelled: true,
        source_date: sourceDate,
        planned_session_id: cancelled.planned_session_id || sourceSession.id,
        title: cancelled.title || sourceSession.title || null,
        response_mode: "deterministic_action",
        llm_used: false,
        usage: null,
        request_date: calendar.date,
        calendar_timezone: calendar.timezone,
      });
    }

    if (action === "adapt_session_duration") {
      const sourceDate = String(body.source_date || "");
      const targetDurationMinutes = Number(body.duration_minutes);
      if (!isPlanDateOnOrAfter(sourceDate, calendar.date)) {
        return reply({
          ok: false,
          error: "stale_plan_source_date",
          message: "Ese plan ya no corresponde a hoy o a una fecha futura. Vuelve a consultar el plan antes de adaptarlo.",
          request_date: calendar.date,
          calendar_timezone: calendar.timezone,
        }, 400);
      }
      if (!Number.isInteger(targetDurationMinutes)
          || targetDurationMinutes < 10
          || targetDurationMinutes > 180) {
        return reply({ ok: false, error: "invalid_duration" }, 400);
      }

      const planned = await loadPlannedTraining(userDb, userId, sourceDate);
      if (!planned.sessions.length) {
        return reply({
          ok: false,
          error: "source_plan_not_found",
          message: "No encuentro ese entrenamiento planificado; vuelve a consultar tu plan antes de adaptarlo.",
        });
      }
      if (planned.sessions.length > 1) {
        return reply({
          ok: false,
          error: "source_plan_ambiguous",
          message: "Hay más de una sesión en ese día. Necesito que identifiques una sesión concreta antes de adaptarla.",
        });
      }

      const sourceSession = planned.sessions[0];
      if (sourceSession.source !== "enkidu_coach") {
        return reply({
          ok: false,
          error: "unsupported_plan_source",
          message: "Solo puedo ajustar automáticamente la duración de sesiones generadas por ENQIDU. No he modificado este plan.",
        });
      }
      if (sourceSession.linked_completed_session_id || sourceSession.status === "skipped") {
        return reply({
          ok: false,
          error: "source_plan_not_adaptable",
          message: "Ese entrenamiento ya no puede adaptarse automáticamente.",
        });
      }

      const blocks = await loadPlannedBlocks(userDb, sourceSession.id);
      const scaledBlocks = scalePlannedBlockDurations(blocks, targetDurationMinutes);
      if (!scaledBlocks) {
        return reply({
          ok: false,
          error: "duration_adaptation_unavailable",
          message: "No puedo ajustar esa sesión a esa duración sin perder la estructura del plan.",
        });
      }

      const currentDuration = Number(sourceSession.planned_duration_max || sourceSession.planned_duration_min);
      const currentBlockSeconds = blocks.reduce(
        (sum: number, block: any) => sum + Number(block?.planned_duration_seconds || 0),
        0,
      );
      if (currentDuration === targetDurationMinutes
          && currentBlockSeconds === targetDurationMinutes * 60) {
        return reply({
          ok: true,
          action,
          adapted: false,
          message: `La sesión ya está ajustada a ${targetDurationMinutes} minutos.`,
          source_date: sourceDate,
          planned_session_id: sourceSession.id,
          response_mode: "deterministic_action",
          llm_used: false,
          usage: null,
          request_date: calendar.date,
          calendar_timezone: calendar.timezone,
        });
      }

      const adaptResult = await adminDb.rpc("adapt_coach_planned_session_duration", {
        p_user_id: userId,
        p_planned_date: sourceDate,
        p_planned_session_id: sourceSession.id,
        p_duration_minutes: targetDurationMinutes,
        p_blocks: scaledBlocks.map((block) => ({
          id: block.id,
          duration_seconds: block.duration_seconds,
        })),
      });
      if (adaptResult.error) throw adaptResult.error;

      const adapted = adaptResult.data || {};
      if (!adapted.ok) {
        return reply({
          ok: false,
          error: adapted.error || "plan_adaptation_rejected",
          message: adapted.error === "unsupported_plan_source"
            ? "Solo puedo ajustar automáticamente la duración de sesiones generadas por ENQIDU. No he modificado este plan."
            : null,
        });
      }

      return reply({
        ok: true,
        action,
        adapted: true,
        source_date: sourceDate,
        planned_session_id: adapted.planned_session_id || sourceSession.id,
        planned_session: {
          date: sourceDate,
          title: sourceSession.title,
          session_type: sourceSession.session_type,
          duration_minutes: targetDurationMinutes,
          intensity: sourceSession.planned_intensity,
          environment: sourceSession.location_type,
          blocks: scaledBlocks.map((block) => ({
            title: block.title,
            duration_minutes: block.duration_minutes,
          })),
        },
        response_mode: "deterministic_action",
        llm_used: false,
        usage: null,
        request_date: calendar.date,
        calendar_timezone: calendar.timezone,
      });
    }

    if (action === "adapt_session_environment") {
      const sourceDate = String(body.source_date || "");
      if (!isPlanDateOnOrAfter(sourceDate, calendar.date)) {
        return reply({
          ok: false,
          error: "stale_plan_source_date",
          message: "Ese plan ya no corresponde a hoy o a una fecha futura. Vuelve a consultar el plan antes de adaptarlo.",
          request_date: calendar.date,
          calendar_timezone: calendar.timezone,
        }, 400);
      }

      const requestedLocationKey = normalizeCoachPlanLocation(body.environment);
      if (!requestedLocationKey) {
        return reply({ ok: false, error: "invalid_location" }, 400);
      }

      const planned = await loadPlannedTraining(userDb, userId, sourceDate);
      if (!planned.sessions.length) {
        return reply({
          ok: false,
          error: "source_plan_not_found",
          message: "No encuentro ese entrenamiento planificado; vuelve a consultar tu plan antes de adaptarlo.",
        });
      }
      if (planned.sessions.length > 1) {
        return reply({
          ok: false,
          error: "source_plan_ambiguous",
          message: "Hay más de una sesión en ese día. Necesito que identifiques una sesión concreta antes de adaptarla.",
        });
      }

      const sourceSession = planned.sessions[0];
      if (sourceSession.source !== "enkidu_coach") {
        return reply({
          ok: false,
          error: "unsupported_plan_source",
          message: "Solo puedo recalcular automáticamente sesiones generadas por ENQIDU. No he modificado este plan.",
        });
      }
      if (sourceSession.linked_completed_session_id || sourceSession.status === "skipped") {
        return reply({
          ok: false,
          error: "source_plan_not_adaptable",
          message: "Ese entrenamiento ya no puede adaptarse automáticamente.",
        });
      }

      const contextResult = await userDb.rpc("get_ai_coach_context", {
        p_user_id: userId,
        p_date: sourceDate,
        p_mode: "today_coach",
        p_from_date: null,
        p_to_date: null,
        p_session_id: null,
      });
      if (contextResult.error) throw contextResult.error;

      const context = contextResult.data || {};
      context.request = {
        ...(context.request || {}),
        date: sourceDate,
        reference_date: calendar.date,
      };
      // Deliberately hide the existing plan from the recommendation builder:
      // the current plan is the object being replaced, not authority against
      // the explicit adaptation request.
      context.planned_training = { date: sourceDate, sessions: [] };
      context.training_availability = await loadTrainingAvailability(userDb, userId, sourceDate);
      context.recommendation_context = {
        constraints: await loadRecommendationConstraints(userDb, userId),
      };

      const recommendation = buildTrainingRecommendation(context, {
        requestedLocation: { key: requestedLocationKey },
      });
      if (!recommendation || recommendation.insufficient) {
        return reply({
          ok: false,
          error: "recommendation_unavailable",
          reason: recommendation?.reason || "insufficient_enqidu_context",
          message: recommendation?.reason === "athlete_unavailable"
            ? "Tienes ese día marcado como no disponible para entrenar. No he modificado el plan."
            : "No puedo recalcular esa sesión con seguridad para el entorno solicitado.",
        });
      }

      const storageRecommendation = toPlannedRecommendationPayload({
        ...recommendation,
        environment: recommendation.environment || requestedLocationKey,
      });
      if (!storageRecommendation || storageRecommendation.environment !== requestedLocationKey) {
        return reply({ ok: false, error: "unsupported_recommendation_type" });
      }

      const adaptResult = await adminDb.rpc("adapt_coach_planned_session_environment", {
        p_user_id: userId,
        p_planned_date: sourceDate,
        p_planned_session_id: sourceSession.id,
        p_session: storageRecommendation,
      });
      if (adaptResult.error) throw adaptResult.error;

      const adapted = adaptResult.data || {};
      if (!adapted.ok) {
        return reply({
          ok: false,
          error: adapted.error || "plan_adaptation_rejected",
          message: adapted.error === "unsupported_plan_source"
            ? "Solo puedo recalcular automáticamente sesiones generadas por ENQIDU. No he modificado este plan."
            : null,
        });
      }

      return reply({
        ok: true,
        action,
        adapted: true,
        source_date: sourceDate,
        planned_session_id: adapted.planned_session_id || sourceSession.id,
        planned_session: {
          date: sourceDate,
          title: recommendation.title,
          session_type: storageRecommendation.session_type,
          duration_minutes: recommendation.duration_minutes,
          intensity: recommendation.intensity,
          environment: storageRecommendation.environment,
          blocks: recommendation.blocks,
        },
        response_mode: "deterministic_action",
        llm_used: false,
        usage: null,
        request_date: calendar.date,
        calendar_timezone: calendar.timezone,
      });
    }

    if (action === "move_planned_session") {
      const sourceDate = String(body.source_date || "");
      const targetWeekday = String(body.target_weekday || "");
      if (!isPlanDateOnOrAfter(sourceDate, calendar.date)) {
        return reply({
          ok: false,
          error: "stale_plan_source_date",
          message: "Ese plan ya no corresponde a hoy o a una fecha futura. Vuelve a consultar el plan antes de moverlo.",
          request_date: calendar.date,
          calendar_timezone: calendar.timezone,
        }, 400);
      }

      const targetDate = resolveNextWeekdayDate(sourceDate, targetWeekday);
      if (!targetDate) {
        return reply({ ok: false, error: "invalid_target_weekday" }, 400);
      }

      const moveResult = await adminDb.rpc("move_coach_planned_session", {
        p_user_id: userId,
        p_source_date: sourceDate,
        p_target_date: targetDate,
      });
      if (moveResult.error) throw moveResult.error;

      const moved = moveResult.data || {};
      if (!moved.ok) {
        return reply({
          ok: false,
          error: moved.error || "plan_move_rejected",
          message: moveErrorMessage(moved.error || null),
          source_date: sourceDate,
          target_date: targetDate,
        });
      }

      return reply({
        ok: true,
        action,
        moved: true,
        planned_session_id: moved.planned_session_id || null,
        title: moved.title || null,
        source_date: sourceDate,
        target_date: targetDate,
        response_mode: "deterministic_action",
        llm_used: false,
        usage: null,
        request_date: calendar.date,
        calendar_timezone: calendar.timezone,
      });
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

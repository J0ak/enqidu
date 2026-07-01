import { createClient } from "npm:@supabase/supabase-js@2";

export const correctionHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MAX_BODY_BYTES = 48000;
const MAX_BLOCKS = 20;
const MAX_EXERCISES = 80;
const ALLOWED_BLOCK_TYPES = new Set([
  "warmup",
  "mobility",
  "strength",
  "skill",
  "conditioning",
  "metcon",
  "cardio",
  "cooldown",
  "recovery",
  "mixed",
  "other",
]);
const ALLOWED_CONFIDENCE = new Set(["reported", "calculated", "estimated", "manual", "unknown"]);
const REPLACEABLE_SOURCES = new Set(["chatgpt_manual_pilot", "chatgpt_session_correction"]);

export const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: correctionHeaders });

function cleanText(value: unknown, max = 500) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeConfidence(value: unknown, fallback = "unknown") {
  const confidence = cleanText(value, 40) || fallback;
  return ALLOWED_CONFIDENCE.has(confidence) ? confidence : fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function validUuid(value: unknown) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

function validLocalDate(value: unknown) {
  const text = cleanText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseBody(req: Request) {
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return { error: reply({ ok: false, error: "payload_too_large" }, 413), body: null };
  }
  try {
    return { body: rawBody ? JSON.parse(rawBody) : {}, error: null };
  } catch {
    return { error: reply({ ok: false, error: "invalid_json" }, 400), body: null };
  }
}

function normalizePayload(body: Record<string, unknown>) {
  const structure = asRecord(body.corrected_structure);
  const blocks = asArray(structure.blocks).map(asRecord);
  const metrics = asArray(structure.metrics).map(asRecord);
  const warnings: string[] = [];
  const errors: string[] = [];
  const sessionId = validUuid(body.session_id);
  const localDate = validLocalDate(body.local_date);
  const correctionType = cleanText(body.correction_type, 80);

  if (!sessionId) errors.push("session_id_required");
  if (!localDate) errors.push("local_date_must_be_yyyy_mm_dd");
  if (correctionType !== "replace_coach_blocks") errors.push("unsupported_correction_type");
  if (body.preserve_garmin_fit !== true) warnings.push("preserve_garmin_fit_defaulted_true");
  if (!blocks.length) errors.push("corrected_structure.blocks_required");
  if (blocks.length > MAX_BLOCKS) errors.push("corrected_structure.blocks_too_many");

  const invalidBlock = blocks.find((block) => !ALLOWED_BLOCK_TYPES.has(cleanText(block.type, 40) || "other"));
  if (invalidBlock) errors.push("corrected_structure.blocks_invalid_type");

  const exercisesCount = blocks.reduce((sum, block) => sum + asArray(block.exercises).length, 0);
  if (exercisesCount > MAX_EXERCISES) errors.push("corrected_structure.exercises_too_many");

  const invalidMetricConfidence = metrics.find((metric) => {
    const confidence = cleanText(metric.confidence, 40) || "unknown";
    return !ALLOWED_CONFIDENCE.has(confidence);
  });
  if (invalidMetricConfidence) errors.push("corrected_structure.metrics_invalid_confidence");

  return {
    errors,
    warnings,
    sessionId,
    localDate,
    correctionType,
    source: cleanText(body.source, 120) || "chatgpt_voice_correction",
    reason: cleanText(body.reason, 800),
    correctedStructure: structure,
    blocks,
    metrics,
    exercisesCount,
  };
}

function compactBlock(block: Record<string, unknown>) {
  return {
    order: Number(block.block_order ?? block.order_index ?? 0) || null,
    type: block.block_type || null,
    name: block.name || null,
    source: asRecord(block.prescription).source || null,
    exercises: asArray(block.exercises).length,
  };
}

async function readSessionState(db: any, sessionId: string, userId: string) {
  const sessionResult = await db
    .from("training_sessions")
    .select("id,user_id,title,local_date,session_status,duration_seconds,distance_meters,source_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sessionResult.error) throw sessionResult.error;
  if (!sessionResult.data) return { error: "session_not_found", session: null };

  const sourceResult = sessionResult.data.source_id
    ? await db.from("training_sources").select("source_type,source_name,import_status").eq("id", sessionResult.data.source_id).maybeSingle()
    : { data: null, error: null };
  if (sourceResult.error) throw sourceResult.error;

  const blocksResult = await db
    .from("session_blocks")
    .select("id,block_order,block_type,name,prescription,data_confidence,execution_notes")
    .eq("session_id", sessionId)
    .order("block_order", { ascending: true });
  if (blocksResult.error) throw blocksResult.error;

  const blockIds = (blocksResult.data || []).map((block: any) => block.id).filter(Boolean);
  const exercisesResult = blockIds.length
    ? await db
      .from("session_exercises")
      .select("id,block_id,exercise_order,reported_name,data_confidence")
      .eq("session_id", sessionId)
      .in("block_id", blockIds)
      .order("exercise_order", { ascending: true })
    : { data: [], error: null };
  if (exercisesResult.error) throw exercisesResult.error;

  const exercisesByBlock = new Map<string, any[]>();
  for (const exercise of exercisesResult.data || []) {
    const list = exercisesByBlock.get(exercise.block_id) || [];
    list.push(exercise);
    exercisesByBlock.set(exercise.block_id, list);
  }
  const blocks = (blocksResult.data || []).map((block: any) => ({
    ...block,
    exercises: exercisesByBlock.get(block.id) || [],
  }));

  const replaceableBlocks = blocks.filter((block: any) => REPLACEABLE_SOURCES.has(cleanText(asRecord(block.prescription).source, 80)));
  const blockedBlocks = blocks.filter((block: any) => !REPLACEABLE_SOURCES.has(cleanText(asRecord(block.prescription).source, 80)));
  const hasFit = ["garmin_fit", "garmin_connect", "wearable_export"].includes(sourceResult.data?.source_type || "");

  const enrichmentResult = await db
    .from("enkidu_conversation_enrichments")
    .select("id,enrichment_type,source,status,local_date")
    .eq("session_id", sessionId)
    .in("enrichment_type", ["conversation_training_log", "session_correction"])
    .eq("status", "active");
  if (enrichmentResult.error) throw enrichmentResult.error;
  const activeConversationEnrichments = enrichmentResult.data || [];
  const hasConversationEvidence = activeConversationEnrichments.some((row: any) =>
    row.enrichment_type === "conversation_training_log" && row.source === "chatgpt_manual_pilot"
  );

  return {
    session: sessionResult.data,
    source: sourceResult.data,
    blocks,
    replaceableBlocks,
    blockedBlocks,
    activeConversationEnrichments,
    hasConversationEvidence,
    hasFit,
    error: null,
  };
}

function buildBeforeAfter(state: any, normalized: ReturnType<typeof normalizePayload>) {
  const beforeExercises = state.replaceableBlocks.reduce((sum: number, block: any) => sum + asArray(block.exercises).length, 0);
  return {
    before: {
      coach_blocks: state.replaceableBlocks.length,
      coach_exercises: beforeExercises,
      protected_blocks: state.blockedBlocks.length,
    },
    after: {
      coach_blocks: normalized.blocks.length,
      coach_exercises: normalized.exercisesCount,
    },
  };
}

export async function handleSessionCorrection(req: Request, mode: "preview" | "apply") {
  if (req.method === "OPTIONS") return new Response("ok", { headers: correctionHeaders });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return reply({ ok: false, error: "auth_required" }, 401);

  const parsed = await parseBody(req);
  if (parsed.error) return parsed.error;

  const normalized = normalizePayload(asRecord(parsed.body));
  if (normalized.errors.length) {
    return reply({
      ok: false,
      action: normalized.correctionType || "replace_coach_blocks",
      dry_run: mode === "preview",
      errors: normalized.errors,
      warnings: normalized.warnings,
    }, 400);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const userId = (await db.auth.getUser()).data.user?.id;
  if (!userId) return reply({ ok: false, error: "invalid_user" }, 401);

  try {
    const state = await readSessionState(db, normalized.sessionId, userId);
    if (state.error) {
      return reply({
        ok: false,
        action: "replace_coach_blocks",
        dry_run: mode === "preview",
        session_id: normalized.sessionId,
        error: state.error,
        warnings: normalized.warnings,
      }, 404);
    }

    const warnings = [...normalized.warnings];
    if (state.blockedBlocks.length) warnings.push("protected_non_coach_blocks_preserved");
    const canCreateFromConversation = !state.replaceableBlocks.length
      && !state.blockedBlocks.length
      && state.hasConversationEvidence;
    if (!state.replaceableBlocks.length) {
      warnings.push(canCreateFromConversation
        ? "no_existing_coach_blocks_creating_from_conversation_enrichment"
        : "no_replaceable_coach_blocks_found");
    }

    const diff = buildBeforeAfter(state, normalized);
    const common = {
      action: "replace_coach_blocks",
      session_id: normalized.sessionId,
      preserves: {
        garmin_fit: true,
        activity_metrics: true,
      },
      before: diff.before,
      after: diff.after,
      warnings,
    };

    if (mode === "preview") {
      return reply({
        ok: true,
        dry_run: true,
        ...common,
      });
    }

    if (!state.replaceableBlocks.length && !canCreateFromConversation) {
      return reply({
        ok: false,
        dry_run: false,
        ...common,
        error: "no_replaceable_coach_blocks_found",
      }, 409);
    }

    const structureHash = await sha256(JSON.stringify(normalized.correctedStructure));
    const correctionKey = cleanText(asRecord(parsed.body).correction_key, 180)
      || `session_correction:${normalized.sessionId}:${normalized.localDate}:${structureHash.slice(0, 16)}`;
    const beforeSummary = {
      blocks: state.replaceableBlocks.map(compactBlock),
      protected_blocks: state.blockedBlocks.map(compactBlock),
      counts: diff.before,
      has_fit: state.hasFit,
    };
    const afterSummary = {
      title: cleanText(normalized.correctedStructure.title, 180),
      session_type: cleanText(normalized.correctedStructure.session_type, 80),
      blocks: normalized.blocks.map((block) => ({
        order: Number(block.order) || null,
        type: cleanText(block.type, 40) || "other",
        name: cleanText(block.name, 180),
        exercises: asArray(block.exercises).length,
      })),
      metrics: normalized.metrics.map((metric) => cleanText(metric.metric_code ?? metric.code, 100)).filter(Boolean),
      counts: diff.after,
    };

    const enrichmentPayload = {
      correction_key: correctionKey,
      correction_type: normalized.correctionType,
      source: normalized.source,
      reason: normalized.reason,
      local_date: normalized.localDate,
      before: beforeSummary,
      after: afterSummary,
      corrected_structure: normalized.correctedStructure,
      preserves: common.preserves,
      raw_payloads_excluded: true,
    };

    const enrichmentResult = await db
      .from("enkidu_conversation_enrichments")
      .upsert({
        session_id: normalized.sessionId,
        local_date: normalized.localDate,
        enrichment_type: "session_correction",
        source: correctionKey,
        payload: enrichmentPayload,
        ai_usage: { source: normalized.source, automatic_llm_extraction: false },
        status: "active",
      }, { onConflict: "session_id,enrichment_type,source" })
      .select("id")
      .single();
    if (enrichmentResult.error) throw enrichmentResult.error;

    const replaceableBlockIds = state.replaceableBlocks.map((block: any) => block.id).filter(Boolean);
    if (replaceableBlockIds.length) {
      const exerciseDelete = await db
        .from("session_exercises")
        .delete()
        .eq("session_id", normalized.sessionId)
        .in("block_id", replaceableBlockIds);
      if (exerciseDelete.error) throw exerciseDelete.error;

      const blockDelete = await db
        .from("session_blocks")
        .delete()
        .eq("session_id", normalized.sessionId)
        .in("id", replaceableBlockIds);
      if (blockDelete.error) throw blockDelete.error;
    }

    const metricDelete = await db
      .from("session_metrics")
      .delete()
      .eq("session_id", normalized.sessionId)
      .eq("source_path", "chatgpt_session_correction");
    if (metricDelete.error) throw metricDelete.error;

    let insertedBlocks = 0;
    let insertedExercises = 0;
    for (const [index, block] of normalized.blocks.entries()) {
      const order = Number(block.order) || index + 1;
      const blockInsert = await db
        .from("session_blocks")
        .insert({
          session_id: normalized.sessionId,
          block_order: order,
          block_type: cleanText(block.type, 40) || "other",
          name: cleanText(block.name, 160) || `Bloque ${order}`,
          rounds_completed: Number.isFinite(Number(block.rounds_completed)) ? Number(block.rounds_completed) : null,
          prescription: {
            source: "chatgpt_session_correction",
            correction_key: correctionKey,
            correction_id: enrichmentResult.data.id,
            summary: cleanText(block.summary, 500),
          },
          execution_notes: cleanText(block.summary, 500) || null,
          data_confidence: normalizeConfidence(block.confidence, "manual"),
        })
        .select("id")
        .single();
      if (blockInsert.error) throw blockInsert.error;
      insertedBlocks += 1;

      for (const [exerciseIndex, exercise] of asArray(block.exercises).map(asRecord).entries()) {
        const exerciseInsert = await db
          .from("session_exercises")
          .insert({
            session_id: normalized.sessionId,
            block_id: blockInsert.data.id,
            exercise_order: Number(exercise.order) || exerciseIndex + 1,
            reported_name: cleanText(exercise.name, 200) || "Ejercicio reportado",
            execution_type: "performed",
            sets_completed: Number.isFinite(Number(exercise.sets_completed)) ? Number(exercise.sets_completed) : null,
            rounds_completed: Number.isFinite(Number(exercise.rounds_completed)) ? Number(exercise.rounds_completed) : null,
            reps_per_set: exercise.reps_per_set ?? null,
            duration_seconds: Number.isFinite(Number(exercise.duration_seconds)) ? Number(exercise.duration_seconds) : null,
            load_value: Number.isFinite(Number(exercise.load_value)) ? Number(exercise.load_value) : null,
            load_unit: cleanText(exercise.load_unit, 40) || null,
            equipment_snapshot: {
              source: "chatgpt_session_correction",
              correction_key: correctionKey,
              equipment: asArray(exercise.equipment),
            },
            side: ["left", "right", "bilateral", "alternating", "each_side", "na"].includes(cleanText(exercise.side, 40))
              ? cleanText(exercise.side, 40)
              : null,
            notes: cleanText(exercise.notes, 500) || null,
            data_confidence: normalizeConfidence(exercise.confidence, "manual"),
          });
        if (exerciseInsert.error) throw exerciseInsert.error;
        insertedExercises += 1;
      }
    }

    let insertedMetrics = 0;
    for (const metric of normalized.metrics) {
      const metricCode = cleanText(metric.metric_code ?? metric.code, 100);
      if (!metricCode) continue;
      const confidence = normalizeConfidence(metric.confidence);
      const metricInsert = await db
        .from("session_metrics")
        .insert({
          session_id: normalized.sessionId,
          metric_code: metricCode,
          metric_name: cleanText(metric.metric_name ?? metric.name, 160) || metricCode,
          value_numeric: Number.isFinite(Number(metric.value_numeric)) ? Number(metric.value_numeric) : null,
          value_text: cleanText(metric.value_text, 240) || null,
          unit: cleanText(metric.unit, 40) || null,
          metric_scope: cleanText(metric.metric_scope, 40) || "session",
          scope_reference: cleanText(metric.scope_reference, 120) || "",
          source_path: "chatgpt_session_correction",
          confidence: ALLOWED_CONFIDENCE.has(confidence) ? confidence : "unknown",
        });
      if (metricInsert.error) throw metricInsert.error;
      insertedMetrics += 1;
    }

    return reply({
      ok: true,
      dry_run: false,
      ...common,
      correction_id: enrichmentResult.data.id,
      correction_key: correctionKey,
      replaced: {
        blocks: diff.before.coach_blocks,
        exercises: diff.before.coach_exercises,
      },
      inserted: {
        blocks: insertedBlocks,
        exercises: insertedExercises,
        metrics: insertedMetrics,
      },
      preserved: {
        garmin_fit: true,
      },
    });
  } catch (error) {
    console.error(error);
    return reply({ ok: false, error: "session_correction_failed" }, 500);
  }
}

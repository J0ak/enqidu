import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MAX_BODY_BYTES = 32000;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_SECTION_ITEMS = 20;
const SCHEMA_VERSION = "coach_memory_conversation_v1";
const CAPTURE_TYPE = "coach_memory_conversation";

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

function cleanText(value: unknown, max = 280) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanKey(value: unknown, fallback: string) {
  const cleaned = cleanText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asItems(value: unknown) {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item) => Object.keys(item).length).slice(0, MAX_SECTION_ITEMS)
    : [];
}

function validLocalDate(value: unknown) {
  const text = cleanText(value, 16);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function upsertUserRow(db: any, table: string, row: Record<string, unknown>, select = "id") {
  const existing = await db
    .from(table)
    .select(select)
    .eq("user_id", row.user_id)
    .eq("source_key", row.source_key)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") throw existing.error;

  if (existing.data?.id) {
    const updated = await db
      .from(table)
      .update(row)
      .eq("id", existing.data.id)
      .select(select)
      .single();
    if (updated.error) throw updated.error;
    return updated.data;
  }

  const inserted = await db.from(table).insert(row).select(select).single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

function buildPreview(extracted: Record<string, unknown>) {
  const profile = asRecord(extracted.profile);
  const goals = asItems(extracted.goals);
  const constraints = asItems(extracted.constraints);
  const equipment = asItems(extracted.equipment);
  const preferences = asItems(extracted.preferences);
  const notes = asItems(extracted.notes);
  const warnings: string[] = [];

  if (preferences.length || notes.length) {
    warnings.push("preferences_and_notes_stored_in_snapshot_only");
  }

  return {
    profile,
    goals,
    constraints,
    equipment,
    preferences,
    notes,
    warnings,
    changes: {
      profile: Object.keys(profile).length ? 1 : 0,
      goals: goals.length,
      constraints: constraints.length,
      equipment: equipment.length,
      sources: 1,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ ok: false, error: "auth_required" }, 401);

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
      return reply({ ok: false, error: "payload_too_large" }, 413);
    }

    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return reply({ ok: false, error: "invalid_json" }, 400);
    }
    const mode = body.mode === "apply" ? "apply" : body.mode === "preview" ? "preview" : null;
    if (!mode) return reply({ ok: false, error: "invalid_mode" }, 400);
    if (body.capture_type !== CAPTURE_TYPE) return reply({ ok: false, error: "invalid_capture_type" }, 400);

    const message = asRecord(body.message);
    const messageText = cleanText(message.text, MAX_MESSAGE_LENGTH + 1);
    if (!messageText) return reply({ ok: false, error: "message_text_required" }, 400);
    if (messageText.length > MAX_MESSAGE_LENGTH) return reply({ ok: false, error: "message_too_long" }, 400);

    const extracted = asRecord(body.extracted);
    if (jsonBytes(extracted) > MAX_BODY_BYTES) return reply({ ok: false, error: "extracted_too_large" }, 413);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const userId = (await db.auth.getUser()).data.user?.id;
    if (!userId) return reply({ ok: false, error: "invalid_user" }, 401);

    const localDate = validLocalDate(body.local_date);
    const textHash = await sha256(messageText);
    const sourceKey = `user:${userId}:coach_memory:${localDate}:${textHash.slice(0, 16)}`;
    const preview = buildPreview(extracted);

    if (mode === "preview") {
      return reply({
        ok: true,
        mode,
        user_id: userId,
        changes: preview.changes,
        warnings: preview.warnings,
        preview: {
          profile: preview.changes.profile,
          goals: preview.goals.map((goal) => cleanText(goal.description ?? goal.goal_type ?? goal.priority, 180)).filter(Boolean),
          constraints: preview.constraints.map((item) => cleanText(item.description ?? item.constraint_type, 180)).filter(Boolean),
          equipment: preview.equipment.map((item) => cleanText(item.name ?? item.item_id ?? item.category, 120)).filter(Boolean),
        },
      });
    }

    const sourceTraceability = {
      capture_type: CAPTURE_TYPE,
      local_date: localDate,
      message: {
        source: cleanText(message.source, 40) || "coach_chat",
        language: cleanText(message.language, 12) || "es",
        text_sha256: textHash,
        text_length: messageText.length,
      },
      schema_version: SCHEMA_VERSION,
    };

    await upsertUserRow(db, "coach_context_sources", {
      user_id: userId,
      fixture_user: null,
      source_key: sourceKey,
      source_type: "manual",
      role: CAPTURE_TYPE,
      source_traceability: sourceTraceability,
      data_quality: { warnings: preview.warnings },
    });

    const profileSourceKey = cleanKey(preview.profile.source_key, `user:${userId}:profile:conversation`);
    const profile = await upsertUserRow(db, "coach_athlete_profiles", {
      user_id: userId,
      fixture_user: null,
      display_name: cleanText(preview.profile.display_name, 120) || null,
      profile_type: "user",
      source_key: profileSourceKey,
      source_traceability: sourceTraceability,
      data_quality: { warnings: [] },
    });

    for (const [index, goal] of preview.goals.entries()) {
      await upsertUserRow(db, "coach_athlete_training_goals", {
        athlete_profile_id: profile.id,
        user_id: userId,
        fixture_user: null,
        goal_type: cleanKey(goal.goal_type, "training"),
        priority: cleanText(goal.priority, 80) || null,
        description: cleanText(goal.description, 500) || null,
        source_key: cleanKey(goal.source_key, `${sourceKey}:goal:${index + 1}`),
        source_traceability: sourceTraceability,
        data_quality: { warnings: [] },
        payload: goal,
      });
    }

    for (const [index, constraint] of preview.constraints.entries()) {
      await upsertUserRow(db, "coach_athlete_constraints", {
        athlete_profile_id: profile.id,
        user_id: userId,
        fixture_user: null,
        constraint_type: cleanKey(constraint.constraint_type ?? constraint.type, "general"),
        severity: cleanText(constraint.severity, 80) || null,
        description: cleanText(constraint.description, 500) || null,
        active: constraint.active === false ? false : true,
        source_key: cleanKey(constraint.source_key, `${sourceKey}:constraint:${index + 1}`),
        source_traceability: sourceTraceability,
        data_quality: { warnings: [] },
        payload: constraint,
      });
    }

    if (preview.equipment.length) {
      const location = await upsertUserRow(db, "coach_equipment_locations", {
        athlete_profile_id: profile.id,
        user_id: userId,
        fixture_user: null,
        location_id: "conversation_default",
        location_type: "manual",
        label: "Conversacion",
        source_key: `user:${userId}:equipment_location:conversation_default`,
        source_traceability: sourceTraceability,
        data_quality: { warnings: [] },
      });

      for (const [index, item] of preview.equipment.entries()) {
        const name = cleanText(item.name ?? item.item_id ?? item.category, 160);
        if (!name) continue;
        await upsertUserRow(db, "coach_equipment_items", {
          equipment_location_id: location.id,
          athlete_profile_id: profile.id,
          user_id: userId,
          fixture_user: null,
          item_id: cleanText(item.item_id, 120) || null,
          category: cleanText(item.category, 80) || null,
          name,
          quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
          unit: cleanText(item.unit, 40) || null,
          source_key: cleanKey(item.source_key, `${sourceKey}:equipment:${index + 1}`),
          source_traceability: sourceTraceability,
          data_quality: { warnings: [] },
          payload: item,
        });
      }
    }

    await upsertUserRow(db, "coach_context_snapshots", {
      athlete_profile_id: profile.id,
      user_id: userId,
      fixture_user: null,
      snapshot_type: "conversation_memory",
      schema_version: SCHEMA_VERSION,
      source_key: `${sourceKey}:snapshot`,
      payload: {
        extracted,
        local_date: localDate,
        message: sourceTraceability.message,
      },
      source_traceability: sourceTraceability,
      data_quality: { warnings: preview.warnings },
    });

    return reply({
      ok: true,
      mode,
      user_id: userId,
      changes: preview.changes,
      warnings: preview.warnings,
    });
  } catch (error) {
    console.error(error);
    return reply({ ok: false, error: "coach_context_memory_failed" }, 500);
  }
});

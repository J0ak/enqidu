import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ error: "auth_required" }, 401);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const userId = (await db.auth.getUser()).data.user?.id;
    if (!userId) return reply({ error: "invalid_user" }, 401);

    const body = await req.json().catch(() => ({}));
    if (!body.session_id) return reply({ error: "session_id_required" }, 400);

    const { data, error } = await db.rpc("get_ai_session_detail_context", {
      p_user_id: userId,
      p_session_id: body.session_id,
      p_include_blocks: body.include_blocks ?? true,
      p_include_exercises: body.include_exercises ?? true,
      p_include_laps: body.include_laps ?? true,
    });

    if (error) throw error;
    return reply({ ok: true, context: data });
  } catch (error) {
    console.error(error);
    return reply({ error: "session_context_failed", detail: String((error as Error)?.message || error) }, 500);
  }
});

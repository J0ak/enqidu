import { runAutonomousMorning } from "./autonomousMorningFlow.js";

/** Narrow authenticated HTTP seam. No client date, timezone, identity, table, RPC or transport selection. */
export function createGarminDailySyncHandler({ createReadDb, createServiceDb, sourceForUser = null, days = 2, now = () => new Date(), observe } = {}) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  return async (request) => {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
    try {
      const readDb = createReadDb(authorization);
      const auth = await readDb.auth.getUser();
      if (auth.error || !auth.data?.user?.id) return json({ error: "invalid_user" }, 401);
      const reader = request.body?.getReader();
      let text = "", bytes = 0;
      const decoder = new TextDecoder();
      if (reader) for (;;) {
        const chunk = await reader.read();
        if (chunk.done) { text += decoder.decode(); break; }
        bytes += chunk.value.byteLength;
        if (bytes > 1024) { await reader.cancel(); return json({ error: "invalid_request" }, 400); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: "invalid_request" }, 400); }
      if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length) return json({ error: "invalid_request" }, 400);
      if (!sourceForUser) return json({ error: "connector_runtime_unavailable", scheduler_enabled: false }, 503);
      const result = await runAutonomousMorning({ readDb, serviceDb: createServiceDb(), sourceForUser, days, now: now(), observe });
      // Health/brief is separately available from the authenticated read tool. Sync exposes only operational data.
      return json(result.ingestion, result.morning_error_code ? 503 : 200);
    } catch { return json({ error: "morning_sync_failed" }, 503); }
  };
}

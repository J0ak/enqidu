import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createEnqiduToolsHttpHandler } from "../../../src/enqiduTools/http.js";
import { toolError } from "../../../src/enqiduTools/errors.js";

Deno.serve(createEnqiduToolsHttpHandler({
  createClients({ authorization, needsWriter }: { authorization: string; needsWriter: boolean }) {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) throw toolError("server_configuration_error");
    const db = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    let adminDb = null;
    if (needsWriter) {
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!key) throw toolError("mutation_unavailable");
      // Server-only capability, used solely by the existing narrow action dispatcher.
      adminDb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return { db, adminDb };
  },
  observe(event: Record<string, unknown>) { console.info("enqidu_tool", JSON.stringify(event)); },
}));

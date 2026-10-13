import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createGarminDailySyncHandler } from "../_shared/garminDailySyncHandler.js";

// Deliberately disabled: no production server-callable Fitness AI transport is documented.
// A rollout must supply a server-owned, consent-checked sourceForUser binding; never a request URL/token.
Deno.serve(createGarminDailySyncHandler({
  createReadDb: (authorization: string) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  }),
  createServiceDb: () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }),
  sourceForUser: null,
  observe: (event: unknown) => console.info(JSON.stringify(event)),
}));

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.107.0";
import { createGarminDailySyncHandler } from "../_shared/garminDailySyncHandler.js";
import { createGarminSourceForUser } from "../_shared/garminSourceBinding.js";
import { FitnessAiServerTransportUnavailable } from "../../../src/health/fitnessAiServerTransport.js";

const createServiceDb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// Concrete server-owned binding; no environment toggle can enable an unapproved transport.
const sourceForUser = (userId: string) => createGarminSourceForUser({ db: createServiceDb() })(userId);
Deno.serve(createGarminDailySyncHandler({
  createReadDb: (authorization: string) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  }),
  createServiceDb, sourceForUser,
  runtimeAvailable: FitnessAiServerTransportUnavailable.runtimeAvailable,
  schedulerSecret: Deno.env.get("GARMIN_SCHEDULER_SECRET") ?? null,
  schedulerEnabled: false,
  observe: (event: unknown) => console.info(JSON.stringify(event)),
}));

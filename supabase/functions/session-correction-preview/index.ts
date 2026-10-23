import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleSessionCorrection } from "../_shared/sessionCorrection.ts";

Deno.serve((req: Request) => handleSessionCorrection(req, "preview"));

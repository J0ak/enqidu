import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export const HEALTH_USER_A = "11111111-1111-4111-8111-111111111111";
export const HEALTH_USER_B = "22222222-2222-4222-8222-222222222222";

/** Execute the actual migration against the inspected production schema subset. */
export async function openHealthDb() {
  const db = new PGlite();
  await db.exec(await readFile(new URL("../fixtures/health-foundation-live-schema.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../../supabase/migrations/20261004134444_health_foundation_v1.sql", import.meta.url), "utf8"));
  await db.query("insert into auth.users(id) values ($1),($2)", [HEALTH_USER_A, HEALTH_USER_B]);
  return db;
}

export async function ingestHealthRecord(db, userId, record) {
  await db.exec("set role service_role");
  try {
    const result = await db.query("select public.ingest_garmin_health_record($1,$2::jsonb) as result", [userId, JSON.stringify(record)]);
    return result.rows[0].result;
  } finally {
    await db.exec("reset role");
  }
}

/** Test facade has the same narrow RPC shape as an injected Supabase server client. */
export function createHealthServiceClient(db) {
  return {
    async rpc(name, args) {
      if (name !== "ingest_garmin_health_record") throw new Error("Unexpected RPC");
      try { return { data: await ingestHealthRecord(db, args.p_user_id, args.p_record), error: null }; }
      catch (error) { return { data: null, error }; }
    },
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { createToolsDb, TOOL_NOW, TOOL_USER_A } from "./support/enqiduToolsDb.mjs";
import { runAutonomousMorning } from "../supabase/functions/_shared/autonomousMorningFlow.js";

test("autonomous operation retains committed ingestion report if canonical morning reads fail", async () => {
  const fixture = createToolsDb(); let writes = 0;
  const readDb = { ...fixture.db, from(table) { if (table === "planned_training_sessions") throw new Error("PRIVATE_SQL_ERROR"); return fixture.db.from(table); } };
  const result = await runAutonomousMorning({ readDb, now: TOOL_NOW,
    serviceDb: { rpc: async (name, args) => { assert.equal(name, "ingest_garmin_health_record"); assert.equal(args.p_user_id, TOOL_USER_A); writes++; return { data: { status: "inserted" } }; } },
    sourceForUser: async (id) => { assert.equal(id, TOOL_USER_A); return { getHealthRecords: async (request) => ({ next_cursor: null, records: request.from_date === "2026-10-05" ? [{
      provider: "garmin", provider_mode: "aggregator", ingestion_channel: "fitness_ai_connector", data_type: "sleep", calendar_date: request.from_date, timezone: request.timezone,
      retrieved_at: TOOL_NOW, measurements: { sleep_score: { value: 80, unit: "score" } },
    }] : [] }) }; },
  });
  assert.equal(writes, 1); assert.equal(result.ingestion.inserted, 1);
  assert.equal(result.brief, null); assert.equal(result.morning_error_code, "morning_read_unavailable");
  assert.ok(result.ingestion.warnings.includes("morning_read_unavailable"));
  assert.equal(result.applied, false); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SQL_ERROR/);
});

test("unauthenticated operation never resolves a connection or constructs a write", async () => {
  const fixture = createToolsDb({ userId: null }); let connections = 0;
  await assert.rejects(runAutonomousMorning({ readDb: fixture.db, now: TOOL_NOW, serviceDb: {}, sourceForUser: async () => { connections++; } }));
  assert.equal(connections, 0);
});

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const restrictedFunctions = [
  "apply_manual_block_temporal_windows(uuid, jsonb)",
  "chatgpt_pilot_apply_capture(jsonb)",
  "chatgpt_pilot_apply_planned_session(jsonb)",
  "chatgpt_pilot_apply_week_plan(jsonb)",
  "chatgpt_pilot_find_session(date, text)",
  "chatgpt_pilot_get_safe_context(date, uuid, text)",
  "chatgpt_pilot_get_session_detail(uuid)",
  "chatgpt_pilot_preview_capture(jsonb)",
  "chatgpt_pilot_preview_planned_session(jsonb)",
  "chatgpt_pilot_preview_week_plan(jsonb)",
  "chatgpt_pilot_record_cost_estimate(uuid, uuid, jsonb)",
  "chatgpt_pilot_status()",
  "compute_manual_block_metrics_from_samples(uuid)",
];

const restrictedRuntimeNames = restrictedFunctions.map((signature) => signature.slice(0, signature.indexOf("(")));

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("SEC-01 migration revokes client execution and preserves service_role", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260929205608_harden_privileged_rpc_authenticated_access.sql", import.meta.url),
    "utf8",
  );

  for (const signature of restrictedFunctions) {
    assert.equal(
      sql.includes(`revoke execute on function public.${signature} from public, anon, authenticated;`),
      true,
      `missing authenticated revoke for ${signature}`,
    );
    assert.equal(
      sql.includes(`grant execute on function public.${signature} to service_role;`),
      true,
      `missing service_role grant for ${signature}`,
    );
  }

  assert.equal(
    sql.includes("revoke execute on function public.persist_conversation_enrichment"),
    false,
  );
});

test("frontend runtime does not call SEC-01 legacy privileged RPCs", async () => {
  const files = await walk(fileURLToPath(new URL("../src/", import.meta.url)));
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const name of restrictedRuntimeNames) {
      if (content.includes(name)) violations.push({ file, name });
    }
  }

  assert.deepEqual(violations, []);
});

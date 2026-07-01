import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const sensitivePatterns = [
  /service[_-]?role\s*[:=]\s*["'][A-Za-z0-9._-]+/i,
  /anon[_-]?key\s*[:=]\s*["'][A-Za-z0-9._-]+/i,
  /password\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function fileExists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test("post-seed result document records exact verified counts", async () => {
  const relativePath = "docs/coach-context/dev-apply-results/2026-06-26-coach-context-jotason-seed-v1-applied.md";
  assert.equal(await fileExists(relativePath), true);
  const doc = await readText(relativePath);

  for (const line of [
    "`coach_athlete_profiles`: 1",
    "`coach_athlete_training_goals`: 1",
    "`coach_athlete_constraints`: 1",
    "`coach_equipment_locations`: 1",
    "`coach_equipment_items`: 30",
    "`coach_context_sources`: 24",
    "`coach_context_snapshots`: 1",
    "`coach_session_fixtures`: 16",
    "`coach_session_blocks`: 16",
    "`coach_session_exercises`: 16",
    "`coach_seed_runs`: 1",
    "`fixture_rows_with_user_id = 0`",
    "`duplicate_source_keys = 0`",
    "`orphan_relationships = 0`",
  ]) {
    assert.match(doc, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(doc, /Garmin\/FIT untouched: yes/);
  for (const pattern of sensitivePatterns) assert.doesNotMatch(doc, pattern);
});

test("coach-context Edge Function reads compact coach tables without Garmin FIT writes", async () => {
  const edge = await readText("supabase/functions/coach-context/index.ts");

  assert.match(edge, /coach_athlete_profiles/);
  assert.match(edge, /coach_session_fixtures/);
  assert.match(edge, /fixture_diagnostic/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /status: "available"/);
  assert.match(edge, /errorContext/);
  assert.match(edge, /equipmentSummary/);
  assert.match(edge, /sourcesCount/);
  assert.match(edge, /sessionsCount/);
  assert.match(edge, /table !== "coach_seed_runs"[\s\S]*query = query\.is\("user_id", null\)/);
  assert.match(edge, /else if \(table !== "coach_seed_runs"\)[\s\S]*query = query\.eq\("user_id", scope\.userId\)/);
  assert.doesNotMatch(edge, /detail: String/);
  assert.doesNotMatch(edge, /get_ai_coach_context/);
  assert.doesNotMatch(edge, /training_sessions/);
  assert.doesNotMatch(edge, /fit_message_payloads/);
  assert.doesNotMatch(edge, /session_samples/);
});

test("frontend service invokes coach-context without exposing service role", async () => {
  const service = await readText("src/services/coachContextService.js");

  assert.match(service, /functions\.invoke\("coach-context"/);
  assert.match(service, /fixtureDiagnostic = false/);
  assert.match(service, /fixture_diagnostic/);
  assert.doesNotMatch(service, /SERVICE_ROLE/i);
  assert.doesNotMatch(service, /service[_-]?role/i);
});

test("coach-context-memory provides JWT protected preview and apply without fixtures", async () => {
  const edge = await readText("supabase/functions/coach-context-memory/index.ts");
  const service = await readText("src/services/coachMemoryService.js");
  const config = await readText("supabase/config.toml");

  assert.match(edge, /coach_memory_conversation/);
  assert.match(edge, /mode === "apply"/);
  assert.match(edge, /mode === "preview"/);
  assert.match(edge, /auth\.getUser\(\)/);
  assert.match(edge, /user_id: userId/);
  assert.match(edge, /coach_context_sources/);
  assert.match(edge, /coach_athlete_training_goals/);
  assert.match(edge, /coach_athlete_constraints/);
  assert.match(edge, /coach_equipment_items/);
  assert.doesNotMatch(edge, /fixture_user: "jotason"/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(edge, /training_sessions/);
  assert.doesNotMatch(edge, /fit_message_payloads/);
  assert.doesNotMatch(edge, /session_samples/);

  assert.match(service, /previewCoachMemory/);
  assert.match(service, /applyCoachMemory/);
  assert.match(service, /functions\.invoke\("coach-context-memory"/);
  assert.doesNotMatch(service, /SERVICE_ROLE/i);
  assert.match(config, /\[functions\.coach-context-memory\][\s\S]*verify_jwt = true/);
});

test("Coach UI has minimal context status card and does not touch FIT import strings", async () => {
  const main = await readText("src/main.jsx");
  const styles = await readText("src/styles.css");

  assert.match(main, /fetchCoachContextStatus/);
  assert.match(main, /CoachContextStatusCard/);
  assert.match(main, /Contexto del entrenador/);
  assert.match(main, /Crear contexto desde conversacion/);
  assert.match(styles, /\.coachContextCard/);
  assert.match(styles, /\.coachContextStats/);
  assert.match(styles, /\.coachContextAction/);
  assert.match(main, /fit-file-parser/);
  assert.match(main, /getArrayBuffer, readRecord/);
});

test("finish integration does not modify migrations or add destructive package scripts", async () => {
  const packageJson = JSON.parse(await readText("package.json"));
  const scripts = JSON.stringify(packageJson.scripts);

  assert.doesNotMatch(scripts, /supabase\s+db\s+reset/i);
  assert.doesNotMatch(scripts, /supabase\s+seed/i);
  assert.doesNotMatch(scripts, /supabase\s+migration\s+up/i);
});

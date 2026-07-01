import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("session correction Edge Functions expose preview and apply with JWT", async () => {
  const preview = await readText("supabase/functions/session-correction-preview/index.ts");
  const apply = await readText("supabase/functions/session-correction-apply/index.ts");
  const shared = await readText("supabase/functions/_shared/sessionCorrection.ts");
  const config = await readText("supabase/config.toml");

  assert.match(preview, /handleSessionCorrection\(req, "preview"\)/);
  assert.match(apply, /handleSessionCorrection\(req, "apply"\)/);
  assert.match(config, /\[functions\.session-correction-preview\][\s\S]*verify_jwt = true/);
  assert.match(config, /\[functions\.session-correction-apply\][\s\S]*verify_jwt = true/);
  assert.match(shared, /auth\.getUser\(\)/);
  assert.doesNotMatch(shared, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(shared, /fixture_user/);
});

test("preview path is dry-run and does not perform writes", async () => {
  const shared = await readText("supabase/functions/_shared/sessionCorrection.ts");
  const previewBranch = shared.slice(
    shared.indexOf('if (mode === "preview")'),
    shared.indexOf("const structureHash"),
  );

  assert.match(previewBranch, /dry_run: true/);
  assert.doesNotMatch(previewBranch, /\.insert\(/);
  assert.doesNotMatch(previewBranch, /\.upsert\(/);
  assert.doesNotMatch(previewBranch, /\.delete\(/);
  assert.doesNotMatch(previewBranch, /\.update\(/);
});

test("apply requires session_id and never creates or updates training_sessions", async () => {
  const shared = await readText("supabase/functions/_shared/sessionCorrection.ts");

  assert.match(shared, /session_id_required/);
  assert.match(shared, /\.from\("training_sessions"\)[\s\S]*\.select\(/);
  assert.doesNotMatch(shared, /\.from\("training_sessions"\)[\s\S]{0,120}\.insert\(/);
  assert.doesNotMatch(shared, /\.from\("training_sessions"\)[\s\S]{0,120}\.update\(/);
  assert.doesNotMatch(shared, /\.from\("training_sessions"\)[\s\S]{0,120}\.delete\(/);
});

test("apply only replaces coach/manual blocks and preserves Garmin FIT surfaces", async () => {
  const shared = await readText("supabase/functions/_shared/sessionCorrection.ts");

  assert.match(shared, /REPLACEABLE_SOURCES = new Set\(\["chatgpt_manual_pilot", "chatgpt_session_correction"\]\)/);
  assert.match(shared, /protected_non_coach_blocks_preserved/);
  assert.match(shared, /error: "no_replaceable_coach_blocks_found"/);
  assert.match(shared, /}, 409\)/);
  assert.match(shared, /garmin_fit: true/);
  assert.match(shared, /activity_metrics: true/);
  assert.doesNotMatch(shared, /\.from\("session_samples"\)/);
  assert.doesNotMatch(shared, /\.from\("session_laps"\)/);
  assert.doesNotMatch(shared, /\.from\("fit_message_payloads"\)/);
  assert.doesNotMatch(shared, /\.from\("wearable_provider_raw_payloads"\)/);
  assert.doesNotMatch(shared, /\.from\("training_sources"\)[\s\S]{0,120}\.insert\(/);
  assert.doesNotMatch(shared, /\.from\("training_sources"\)[\s\S]{0,120}\.update\(/);
  assert.doesNotMatch(shared, /\.from\("training_sources"\)[\s\S]{0,120}\.delete\(/);
});

test("apply records traceability and is idempotent by correction key", async () => {
  const shared = await readText("supabase/functions/_shared/sessionCorrection.ts");

  assert.match(shared, /correction_key/);
  assert.match(shared, /session_correction/);
  assert.match(shared, /onConflict: "session_id,enrichment_type,source"/);
  assert.match(shared, /\.from\("enkidu_conversation_enrichments"\)[\s\S]*\.upsert\(/);
  assert.match(shared, /\.from\("session_metrics"\)[\s\S]*\.delete\(\)[\s\S]*source_path", "chatgpt_session_correction"/);
});

test("2026-07-01 corrected structure is documented as 6 blocks with integrated polea wall ball carry block", async () => {
  const doc = await readText("docs/session-corrections/2026-07-01-conversational-correction.md");

  assert.match(doc, /5ce7302b-fdce-478d-aaee-72f36023416e/);
  assert.match(doc, /"blocks": \[/);
  assert.match(doc, /"name": "Bloque integrado: polea, wall ball y carry"/);
  assert.match(doc, /"name": "Remo en polea estirando el brazo"/);
  assert.match(doc, /"name": "Wall ball con rotaciones"/);
  assert.match(doc, /"name": "Carry\/granjero con posicion de press\/front rack y brazo estirado"/);
  assert.match(doc, /Expected after: 6 coach blocks/);
  assert.match(doc, /Integrated block exercises: 3/);
});

test("metric confidence values are constrained to the allowed contract", async () => {
  const shared = await readText("supabase/functions/_shared/sessionCorrection.ts");

  assert.match(shared, /"reported", "calculated", "estimated", "manual", "unknown"/);
  assert.match(shared, /corrected_structure\.metrics_invalid_confidence/);
});

test("session correction docs record deployment and product boundaries", async () => {
  const doc = await readText("docs/session-corrections/conversational-session-correction-flow.md");

  assert.match(doc, /No crea una sesion nueva/);
  assert.match(doc, /No toca Garmin\/FIT/);
  assert.match(doc, /session-correction-preview/);
  assert.match(doc, /session-correction-apply/);
  assert.match(doc, /supabase functions deploy session-correction-preview/);
  assert.match(doc, /supabase functions deploy session-correction-apply/);
});

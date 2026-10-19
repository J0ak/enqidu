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

test("legacy preview is read-only and apply is explicitly retired after authentication", async () => {
  const shared = await readText("supabase/functions/_shared/sessionCorrection.ts");
  assert.match(shared, /if \(mode === "apply"\) return reply\([\s\S]*legacy_correction_deprecated/);
  assert.match(shared, /dry_run: true/);
  assert.doesNotMatch(shared, /\.(insert|upsert|delete|update)\(/);
  assert.match(shared, /preview_training_semantics_v1/);
  assert.match(shared, /session_id_required/);
  assert.match(shared, /garmin_fit: true/);
});

test("2026-07-01 corrected structure is documented as 6 blocks with integrated polea wall ball carry block", async () => {
  const doc = await readText("docs/session-corrections/2026-07-01-conversational-correction.md");
  const payloadBlock = doc.match(/## Payload\s+```json\s*([\s\S]*?)\s*```/);
  assert.ok(payloadBlock);
  const payload = JSON.parse(payloadBlock[1]);
  const blocks = payload.corrected_structure.blocks;

  assert.match(doc, /5ce7302b-fdce-478d-aaee-72f36023416e/);
  assert.match(doc, /"blocks": \[/);
  assert.deepEqual(blocks.map((block) => block.name), [
    "Activacion inicial",
    "Rotaciones sobre pared / caballero",
    "Kettlebell 12 kg",
    "Bloque integrado: polea, wall ball y carry",
    "Remo / paladas controladas",
    "Vuelta a la calma",
  ]);
  assert.equal(blocks[3].exercises.length, 3);
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

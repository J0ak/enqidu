import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCoachContextFixture,
  loadCoachContextReferences,
  normalizeEquipmentInventory,
  normalizeJotasonSession,
  normalizePromaestroReference,
} from "../src/coachContext/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const coachContextRoot = path.join(root, "docs", "coach-context");
const manifestPath = path.join(coachContextRoot, "source-json-manifest.json");
const referencesRoot = path.join(coachContextRoot, "references", "jotason");
const sessionsRoot = path.join(coachContextRoot, "fixtures", "jotason", "sessions");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("loads source-json-manifest.json", async () => {
  const loaded = await loadCoachContextReferences({ rootDir: root });

  assert.equal(loaded.manifest.product, "ENQIDU");
  assert.equal(loaded.manifest.principle, "generic_product_with_jotason_as_fixture");
  assert.equal(loaded.manifest.sources.length, 20);
});

test("all copied manifest JSON files exist", async () => {
  const manifest = await readJson(manifestPath);
  const copied = manifest.sources.filter((source) => source.status === "copied");

  assert.equal(copied.length, 20);
  for (const source of copied) {
    await access(path.join(root, source.target_path));
  }
});

test("normalizeEquipmentInventory preserves home location", async () => {
  const raw = await readJson(path.join(referencesRoot, "inventory_home_v4.json"));
  const inventory = normalizeEquipmentInventory(raw);

  assert.equal(inventory.location.id, "home");
  assert.equal(inventory.location.type, "home");
  assert.equal(inventory.location.label, "Home");
  assert.ok(inventory.equipment.length > 0);
  assert.equal(inventory.product, "ENQIDU");
  assert.equal(inventory.fixture_user, "jotason");
});

test("normalizeEquipmentInventory preserves cardioAtHome false", async () => {
  const raw = await readJson(path.join(referencesRoot, "inventory_home_v4.json"));
  const inventory = normalizeEquipmentInventory(raw);

  assert.equal(inventory.constraints.cardioAtHome, false);
});

test("normalizePromaestroReference preserves priorities", async () => {
  const raw = await readJson(path.join(referencesRoot, "jotason_promaestro_v5.json"));
  const reference = normalizePromaestroReference(raw);

  assert.equal(reference.priorities.primary, "functional_lean_mass_full_body");
  assert.equal(reference.priorities.secondary, "skills_mastery");
  assert.equal(reference.priorities.tertiary, "endurance_events_trail_triathlon");
  assert.ok(reference.rules.includes("priority_mass_over_cardio"));
  assert.equal(reference.product, "ENQIDU");
  assert.equal(reference.fixture_user, "jotason");
});

test("normalizeJotasonSession tolerates every session fixture", async () => {
  const loaded = await loadCoachContextReferences({ rootDir: root });

  assert.equal(loaded.sessionFixtures.length, 16);
  for (const fixture of loaded.sessionFixtures) {
    assert.equal(fixture.source.fixture, "jotason");
    assert.equal(fixture.source.role, "session_fixture");
    assert.equal(fixture.product, "ENQIDU");
    assert.equal(fixture.fixture_user, "jotason");
    assert.ok(fixture.raw && typeof fixture.raw === "object", fixture.source.file);
    assert.ok(Array.isArray(fixture.blocks), fixture.source.file);
    assert.ok(fixture.summary && typeof fixture.summary === "object", fixture.source.file);
    assert.ok(Array.isArray(fixture.data_quality.missing_fields), fixture.source.file);
  }
});

test("normalizeJotasonSession keeps raw traceability for sparse fixture shapes", async () => {
  const raw = await readJson(path.join(sessionsRoot, "2026-04-29_jotason_full_day_v2.json"));
  const fixture = normalizeJotasonSession(raw, { file: "2026-04-29_jotason_full_day_v2.json" });

  assert.equal(fixture.date, "2026-04-29");
  assert.equal(fixture.title, null);
  assert.deepEqual(fixture.blocks, []);
  assert.equal(fixture.raw, raw);
});

test("buildCoachContextFixture returns product ENQIDU", async () => {
  const fixture = await buildCoachContextFixture({ rootDir: root });

  assert.equal(fixture.product, "ENQIDU");
  assert.equal(fixture.fixture, "jotason");
  assert.equal(fixture.fixture_user, "jotason");
  assert.equal(fixture.generatedFrom, "docs/coach-context");
  assert.equal(fixture.warnings.length, 0);
  assert.equal(fixture.references.sessionContractReference.product, "ENQIDU");
  assert.equal(fixture.references.monthlyHistoryReference.product, "ENQIDU");
});

test("fixture manifest paths stay under docs/coach-context", async () => {
  const manifest = await readJson(manifestPath);

  for (const source of manifest.sources) {
    assert.match(source.target_path, /^docs\/coach-context\//, source.file);
  }
});

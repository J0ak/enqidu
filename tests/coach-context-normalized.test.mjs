import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeNormalizedCoachContext } from "../src/coachContext/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const normalizedRoot = path.join(root, "docs", "coach-context", "normalized", "jotason");
const normalizedSessionsRoot = path.join(normalizedRoot, "sessions");
const rawSessionsRoot = path.join(root, "docs", "coach-context", "fixtures", "jotason", "sessions");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizedName(rawName) {
  return rawName.replace(/\.json$/i, ".normalized.json");
}

async function sourceFiles() {
  const coachContextRoot = path.join(root, "src", "coachContext");
  const scriptsRoot = path.join(root, "scripts", "coach-context");
  const files = [];

  for (const dir of [coachContextRoot, scriptsRoot]) {
    for (const name of await readdir(dir)) {
      if (name.endsWith(".js") || name.endsWith(".mjs")) {
        files.push(path.join(dir, name));
      }
    }
  }

  return files;
}

test("writes normalized coach context fixtures", async () => {
  const result = await writeNormalizedCoachContext({ rootDir: root });

  assert.equal(result.manifest.product, "ENQIDU");
  assert.equal(result.manifest.fixture_user, "jotason");
  assert.equal(result.manifest.counts.references, 4);
  assert.equal(result.manifest.counts.session_fixtures, 16);
  assert.equal(result.manifest.counts.normalized_sessions, 16);
});

test("normalized root files exist with common contract fields", async () => {
  const names = [
    "athlete-context.normalized.json",
    "equipment-inventory.normalized.json",
    "training-reference.normalized.json",
    "coach-context.normalized.json",
    "normalized-manifest.json",
  ];

  for (const name of names) {
    const json = await readJson(path.join(normalizedRoot, name));
    assert.equal(json.product, "ENQIDU", name);
    assert.equal(json.fixture_user, "jotason", name);
    assert.ok(json.schema_version, name);
    assert.ok(json.source_traceability, name);
    assert.ok(json.data_quality, name);
  }
});

test("all raw sessions have a matching normalized session", async () => {
  const rawNames = (await readdir(rawSessionsRoot)).filter((name) => name.endsWith(".json")).sort();
  const normalizedNames = (await readdir(normalizedSessionsRoot)).filter((name) => name.endsWith(".json")).sort();

  assert.deepEqual(normalizedNames, rawNames.map(normalizedName).sort());
});

test("all normalized sessions use ENQIDU product and jotason fixture user", async () => {
  const normalizedNames = (await readdir(normalizedSessionsRoot)).filter((name) => name.endsWith(".json"));

  for (const name of normalizedNames) {
    const json = await readJson(path.join(normalizedSessionsRoot, name));
    assert.equal(json.product, "ENQIDU", name);
    assert.equal(json.fixture_user, "jotason", name);
    assert.ok(json.source_traceability.file, name);
    assert.match(json.source_traceability.source_path ?? "docs/coach-context/unknown", /^docs\/coach-context\//);
    assert.ok(Array.isArray(json.data_quality.missing_fields), name);
    assert.ok(Array.isArray(json.data_quality.warnings), name);
  }
});

test("normalized equipment preserves home and cardio_at_home false", async () => {
  const inventory = await readJson(path.join(normalizedRoot, "equipment-inventory.normalized.json"));

  assert.equal(inventory.location.type, "home");
  assert.equal(inventory.constraints.cardioAtHome, false);
});

test("normalized training reference preserves primary priority", async () => {
  const reference = await readJson(path.join(normalizedRoot, "training-reference.normalized.json"));

  assert.equal(reference.priorities.primary, "functional_lean_mass_full_body");
});

test("normalized manifest paths stay under docs/coach-context", async () => {
  const manifest = await readJson(path.join(normalizedRoot, "normalized-manifest.json"));

  for (const filePath of [...manifest.generated_files, ...manifest.source_files]) {
    assert.match(filePath, /^docs\/coach-context\//, filePath);
  }
});

test("coach context source does not import UI Supabase migrations or Garmin FIT runtime", async () => {
  const forbidden = [
    "src/main.jsx",
    "ActivityView",
    "supabase",
    "migrations",
    "functions/",
    "fit-file-parser",
    "Garmin",
  ];

  for (const filePath of await sourceFiles()) {
    const content = await readFile(filePath, "utf8");
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, `${path.relative(root, filePath)} includes ${token}`);
    }
  }
});


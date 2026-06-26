import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  expectedSupabaseSeedPlanTables,
  loadJsonFile,
  validateNormalizedCoachContext,
  validateSupabaseSeedPlan,
} from "../src/coachContext/index.js";
import {
  buildSupabaseSeedPlan,
  writeSupabaseSeedPlan,
} from "../scripts/coach-context/plan-supabase-seed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const normalizedRoot = path.join(root, "docs", "coach-context", "normalized", "jotason");
const normalizedSessionsRoot = path.join(normalizedRoot, "sessions");
const seedPlanPath = path.join(normalizedRoot, "supabase-seed-plan.generated.json");

const forbiddenRuntimePaths = [
  "src/main.jsx",
  "src/pages",
  "src/components",
  "supabase/migrations",
  "supabase/functions",
];

const forbiddenContentPatterns = [
  /@supabase\/supabase-js/i,
  /SUPABASE_URL/i,
  /SUPABASE_SERVICE_ROLE/i,
  /\bservice[_-]?role\b/i,
  /\banon[_-]?key\b/i,
  /\bfetch\s*\(/i,
  /\bexecute_sql\s*\(/i,
  /\bapply_migration\s*\(/i,
  /fit-file-parser/i,
];

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readPackageJson() {
  return loadJsonFile(path.join(root, "package.json"));
}

async function changedCandidateFiles() {
  const files = [
    "scripts/coach-context/inspect-normalized-for-supabase.mjs",
    "scripts/coach-context/plan-supabase-seed.mjs",
  ];

  return Promise.all(files.map(async (filePath) => ({
    filePath,
    content: await readFile(path.join(root, filePath), "utf8"),
  })));
}

test("normalized fixtures required for Supabase dry-run exist", async () => {
  const rootFiles = [
    "athlete-context.normalized.json",
    "coach-context.normalized.json",
    "equipment-inventory.normalized.json",
    "training-reference.normalized.json",
  ];

  for (const fileName of rootFiles) {
    assert.equal(await fileExists(path.join(normalizedRoot, fileName)), true, fileName);
  }

  const sessionNames = (await readdir(normalizedSessionsRoot)).filter((name) =>
    name.endsWith(".normalized.json"),
  );
  assert.equal(sessionNames.length, 16);
});

test("plan-supabase-seed builds expected dry-run shape", async () => {
  const result = await writeSupabaseSeedPlan(root);
  const plan = result.plan;

  assert.equal(await fileExists(seedPlanPath), true);
  assert.equal(plan.schema_version, "enqidu_supabase_seed_plan_v0");
  assert.equal(plan.product, "ENQIDU");
  assert.equal(plan.fixture_user, "jotason");
  assert.equal(plan.mode, "dry_run");
  assert.ok(Array.isArray(plan.source_traceability));

  for (const table of expectedSupabaseSeedPlanTables()) {
    assert.ok(Array.isArray(plan.would_create[table]), table);
    assert.equal(plan.counts[table], plan.would_create[table].length, table);
  }

  assert.equal(plan.counts.athlete_profiles, 1);
  assert.equal(plan.counts.coach_session_fixtures, 16);
  assert.ok(plan.counts.coach_context_sources > 0);
  assert.ok(plan.would_create.coach_context_sources.some((row) => row.operation === "insert_if_absent"));
  assert.ok(plan.would_create.coach_session_fixtures.some((row) => row.operation === "insert_if_absent"));
  assert.ok(plan.source_traceability.some((entry) => entry.kind === "raw_json"));
  assert.ok(plan.source_traceability.some((entry) => entry.kind === "normalized_json"));
});

test("seed plan validates and contains no credentials or real Supabase writes", async () => {
  const plan = await buildSupabaseSeedPlan(root);
  const validation = validateSupabaseSeedPlan(plan);

  assert.equal(validation.valid, true, validation.errors.join(", "));

  const serialized = JSON.stringify(plan);
  for (const pattern of forbiddenContentPatterns) {
    assert.equal(pattern.test(serialized), false, pattern.toString());
  }

  assert.equal(serialized.includes("writes_to_database\":true"), false);
});

test("seed plan generation is idempotent in structure and counts", async () => {
  const first = await writeSupabaseSeedPlan(root);
  const second = await writeSupabaseSeedPlan(root);

  assert.deepEqual(first.plan.counts, second.plan.counts);
  assert.deepEqual(Object.keys(first.plan.would_create), Object.keys(second.plan.would_create));
  assert.deepEqual(first.plan.source_traceability, second.plan.source_traceability);
});

test("local validators reject invalid normalized and seed payloads", () => {
  const normalizedValidation = validateNormalizedCoachContext({
    product: "OTHER",
    fixture_user: "",
    schema_version: "",
    source_traceability: {
      source_path: "outside/path.json",
    },
  });

  assert.equal(normalizedValidation.valid, false);
  assert.ok(normalizedValidation.errors.includes("product_must_be_ENQIDU"));
  assert.ok(
    normalizedValidation.errors.some((error) =>
      error.startsWith("source_traceability_path_outside_docs_coach_context"),
    ),
  );

  const seedValidation = validateSupabaseSeedPlan({
    schema_version: "wrong",
    product: "ENQIDU",
    fixture_user: "jotason",
    mode: "write",
    would_create: {},
    source_traceability: [],
  });

  assert.equal(seedValidation.valid, false);
  assert.ok(seedValidation.errors.includes("mode_must_be_dry_run"));
});

test("new Supabase-ready scripts do not import Supabase clients or network APIs", async () => {
  for (const { filePath, content } of await changedCandidateFiles()) {
    for (const pattern of forbiddenContentPatterns) {
      assert.equal(pattern.test(content), false, `${filePath} matches ${pattern}`);
    }
  }
});

test("SQL draft is documentation only and not under migrations", async () => {
  const draftPath = path.join(root, "docs", "coach-context", "supabase-draft-schema.sql");
  if (!(await fileExists(draftPath))) return;

  const relative = path.relative(root, draftPath).replaceAll(path.sep, "/");
  assert.equal(relative.startsWith("supabase/migrations/"), false);

  const content = await readFile(draftPath, "utf8");
  assert.match(content, /DRAFT ONLY/);
  assert.match(content, /Do not place this SQL under supabase\/migrations/);
});

test("package scripts exist and dependencies were not added", async () => {
  const packageJson = await readPackageJson();

  assert.equal(
    packageJson.scripts["coach:supabase:inspect"],
    "node scripts/coach-context/inspect-normalized-for-supabase.mjs",
  );
  assert.equal(
    packageJson.scripts["coach:supabase:plan"],
    "node scripts/coach-context/plan-supabase-seed.mjs",
  );

  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/supabase-js",
    "@vitejs/plugin-react",
    "fit-file-parser",
    "jszip",
    "lucide-react",
    "react",
    "react-dom",
    "vite",
  ].sort());
});

test("forbidden runtime and Supabase real paths are not created for this layer", async () => {
  const mainContent = await readFile(path.join(root, "src/main.jsx"), "utf8");
  assert.ok(mainContent.length > 0);

  const plan = await buildSupabaseSeedPlan(root);
  const serialized = JSON.stringify(plan);

  for (const relativePath of forbiddenRuntimePaths.filter((item) => item !== "src/main.jsx")) {
    assert.equal(serialized.includes(relativePath), false, relativePath);
  }
});

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const expectedTables = [
  "coach_athlete_profiles",
  "coach_athlete_training_goals",
  "coach_athlete_constraints",
  "coach_equipment_locations",
  "coach_equipment_items",
  "coach_context_sources",
  "coach_context_snapshots",
  "coach_session_fixtures",
  "coach_session_blocks",
  "coach_session_exercises",
  "coach_seed_runs",
];

const schemaMigrationPath = ["supabase", "migrations", "20260626123654_coach_context_schema_v0.sql"].join("/");
const rollbackDraftPath = ["supabase", "seed", "coach_context_jotason_rollback_draft.sql"].join("/");
const schemaTestPath = ["tests", "coach-context-supabase-schema.test.mjs"].join("/");

const requiredFiles = [
  schemaMigrationPath,
  "supabase/seed/coach_context_jotason_seed_draft.sql",
  "supabase/seed/coach_context_jotason_seed.generated.sql",
  rollbackDraftPath,
  "docs/coach-context/apply-supabase-schema-v0.md",
  "docs/coach-context/supabase-rollback-plan.md",
  schemaTestPath,
  "tests/coach-context-dev-apply.test.mjs",
];

const requiredScripts = [
  "coach:supabase:inspect",
  "coach:supabase:plan",
  "coach:supabase:seed-sql",
  "coach:supabase:dev-preflight",
  "coach:supabase:dev-verify-sql",
];

async function exists(rootDir, relativePath) {
  try {
    await stat(path.join(rootDir, relativePath));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function loadPackageJson(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
}

export async function runDevApplyPreflight(rootDir = process.cwd()) {
  const warnings = [
    "This preflight does not connect to Supabase.",
    "This preflight does not apply migrations.",
    "This preflight does not execute seed SQL.",
  ];
  const errors = [];
  const packageJson = await loadPackageJson(rootDir);

  for (const file of requiredFiles) {
    if (!(await exists(rootDir, file))) errors.push(`missing_file:${file}`);
  }

  for (const scriptName of requiredScripts) {
    if (!packageJson.scripts?.[scriptName]) errors.push(`missing_script:${scriptName}`);
  }

  const functionsDir = path.join(rootDir, "supabase", "functions");
  const functionNames = (await readdir(functionsDir)).sort();

  return {
    migration: schemaMigrationPath,
    expected_tables: expectedTables,
    seed_drafts_present: errors.every((error) => !error.includes("seed")),
    rollback_draft_present: !errors.includes(`missing_file:${rollbackDraftPath}`),
    tests_present: !errors.includes(`missing_file:${schemaTestPath}`),
    scripts: Object.fromEntries(requiredScripts.map((scriptName) => [scriptName, packageJson.scripts?.[scriptName] ?? null])),
    existing_edge_functions: functionNames,
    warnings,
    errors,
    valid: errors.length === 0,
  };
}

function printPreflight(result) {
  console.log(`Migration: ${result.migration}`);
  console.log(`Expected coach tables: ${result.expected_tables.join(", ")}`);
  console.log(`Seed drafts present: ${result.seed_drafts_present}`);
  console.log(`Rollback draft present: ${result.rollback_draft_present}`);
  console.log(`Tests present: ${result.tests_present}`);
  console.log(`Existing Edge Functions: ${result.existing_edge_functions.join(", ")}`);
  console.log("Relevant npm scripts:");
  for (const [name, command] of Object.entries(result.scripts)) {
    console.log(`- ${name}: ${command ?? "missing"}`);
  }
  console.log("Warnings:");
  for (const warning of result.warnings) console.log(`- ${warning}`);
  if (result.errors.length > 0) {
    console.log("Errors:");
    for (const error of result.errors) console.log(`- ${error}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runDevApplyPreflight();
  printPreflight(result);
  if (!result.valid) process.exitCode = 1;
}

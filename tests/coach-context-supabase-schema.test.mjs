import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildSupabaseSeedSql, writeSupabaseSeedSql } from "../scripts/coach-context/generate-supabase-seed-sql.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const migrationsRoot = path.join(root, "supabase", "migrations");
const seedRoot = path.join(root, "supabase", "seed");
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
const tablesWithCoachContextOwnership = expectedTables.filter((table) => table !== "coach_seed_runs");
const tablesWithAthleteProfile = [
  "coach_athlete_training_goals",
  "coach_athlete_constraints",
  "coach_equipment_locations",
  "coach_equipment_items",
  "coach_context_snapshots",
  "coach_session_fixtures",
  "coach_session_blocks",
  "coach_session_exercises",
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

async function schemaMigration() {
  const names = await readdir(migrationsRoot);
  const matches = names.filter((name) => /^\d{14}_coach_context_schema_v0\.sql$/.test(name));
  assert.equal(matches.length, 1, matches.join(", "));
  const relativePath = path.join("supabase", "migrations", matches[0]).replaceAll(path.sep, "/");
  return {
    name: matches[0],
    relativePath,
    sql: await readText(relativePath),
  };
}

function withoutComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function createTableBlock(sql, table) {
  const match = sql.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`, "i"));
  assert.ok(match, `missing create table block for ${table}`);
  return match[0];
}

function selectPolicyBlocks(sql) {
  return [...sql.matchAll(/create policy "[^"]+"\s+on public\.\w+\s+for select[\s\S]*?;/gi)].map(
    (match) => match[0],
  );
}

test("coach context schema migration exists", async () => {
  const migration = await schemaMigration();
  assert.match(migration.name, /^\d{14}_coach_context_schema_v0\.sql$/);
});

test("migration creates only expected coach-prefixed tables", async () => {
  const { sql } = await schemaMigration();
  const createdTables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((match) => match[1]);

  assert.deepEqual(createdTables.sort(), expectedTables.sort());
  assert.ok(createdTables.every((table) => table.startsWith("coach_")));
});

test("migration enables RLS on all new tables and avoids public true policies", async () => {
  const { sql } = await schemaMigration();

  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`), table);
  }

  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/i);
});

test("migration has owner policies for user-owned coach rows", async () => {
  const { sql } = await schemaMigration();

  for (const table of expectedTables.filter((table) => table !== "coach_seed_runs")) {
    assert.match(sql, new RegExp(`on public\\.${table}[\\s\\S]*?for select[\\s\\S]*?auth\\.uid\\(\\) = user_id`, "i"), table);
  }

  assert.match(sql, /using \(false\);/);
});

test("migration keeps fixtures invisible to final users by default", async () => {
  const { sql } = await schemaMigration();
  const selectPolicies = selectPolicyBlocks(sql);

  assert.ok(selectPolicies.length > 0);
  for (const policy of selectPolicies) {
    assert.doesNotMatch(policy, /fixture_user\s+is\s+not\s+null/i);
    assert.doesNotMatch(policy, /fixture_user\s*=/i);
  }
});

test("migration uses a Coach Context scoped updated_at function", async () => {
  const { sql } = await schemaMigration();

  assert.match(sql, /create or replace function public\.coach_context_set_updated_at\(\)/);
  assert.match(sql, /execute function public\.coach_context_set_updated_at\(\);/);
  assert.doesNotMatch(sql, /create or replace function public\.set_updated_at\(\)/);
  assert.doesNotMatch(sql, /execute function public\.set_updated_at\(\);/);
});

test("migration contains no credentials or dangerous data operations", async () => {
  const { sql } = await schemaMigration();
  const executableSql = withoutComments(sql);

  assert.doesNotMatch(sql, /SUPABASE_URL/i);
  assert.doesNotMatch(sql, /SUPABASE_SERVICE/i);
  assert.doesNotMatch(sql, /\bservice[_-]?role\b/i);
  assert.doesNotMatch(sql, /\banon[_-]?key\b/i);
  assert.doesNotMatch(sql, /-----BEGIN [A-Z ]*PRIVATE KEY-----/i);
  assert.doesNotMatch(executableSql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(executableSql, /\btruncate\b/i);
  assert.doesNotMatch(executableSql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(executableSql, /\bupdate\s+auth\.users\b/i);
  assert.doesNotMatch(executableSql, /\balter\s+table\s+auth\.users\b/i);
  assert.doesNotMatch(executableSql, /\bdrop\s+.*auth\.users\b/i);
});

test("migration does not touch Garmin/FIT or existing runtime tables", async () => {
  const { sql } = await schemaMigration();
  const executableSql = withoutComments(sql);

  assert.doesNotMatch(executableSql, /training_sessions/i);
  assert.doesNotMatch(executableSql, /planned_training_sessions/i);
  assert.doesNotMatch(executableSql, /fit_message_payloads/i);
  assert.doesNotMatch(executableSql, /session_garmin/i);
  assert.doesNotMatch(executableSql, /\bgarmin\b/i);
  assert.doesNotMatch(executableSql, /\bactivities\b/i);
  assert.doesNotMatch(executableSql, /supabase\/functions/i);
});

test("migration includes indexes and traceability fields", async () => {
  const { sql } = await schemaMigration();

  for (const table of tablesWithCoachContextOwnership) {
    assert.match(sql, new RegExp(`create index if not exists ${table}_.*user.*idx`, "i"), table);
    assert.match(sql, new RegExp(`create index if not exists ${table}_.*fixture.*idx`, "i"), table);
  }

  assert.match(sql, /source_key text not null/);
  assert.match(sql, /source_traceability jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /raw_source_file text null/);
  assert.match(sql, /normalized_source_file text null/);
});

test("main coach tables include critical ownership and traceability columns", async () => {
  const { sql } = await schemaMigration();

  for (const table of tablesWithCoachContextOwnership) {
    const block = createTableBlock(sql, table);
    assert.match(block, /user_id uuid null/, `${table}:user_id`);
    assert.match(block, /fixture_user text null/, `${table}:fixture_user`);
    assert.match(block, /source_key text not null/, `${table}:source_key`);
    assert.match(block, /source_traceability jsonb not null default '\{\}'::jsonb/, `${table}:source_traceability`);
    assert.match(block, /data_quality jsonb not null default '\{\}'::jsonb/, `${table}:data_quality`);
  }

  for (const table of tablesWithAthleteProfile) {
    const block = createTableBlock(sql, table);
    assert.match(block, /athlete_profile_id uuid not null/, `${table}:athlete_profile_id`);
  }
});

test("seed draft files are marked as drafts and contain no credentials", async () => {
  const draft = await readText("supabase/seed/coach_context_jotason_seed_draft.sql");
  const rollback = await readText("supabase/seed/coach_context_jotason_rollback_draft.sql");

  assert.match(draft, /DRAFT ONLY/);
  assert.match(draft, /This file is not executed automatically/);
  assert.match(draft, /\bbegin;/i);
  assert.match(draft, /rollback;/i);
  assert.match(rollback, /DRAFT ONLY/);
  assert.match(rollback, /\bbegin;/i);
  assert.match(rollback, /rollback;/i);

  for (const sql of [draft, rollback]) {
    assert.doesNotMatch(sql, /SUPABASE_URL/i);
    assert.doesNotMatch(sql, /SUPABASE_SERVICE/i);
    assert.doesNotMatch(sql, /\bservice[_-]?role\b/i);
    assert.doesNotMatch(sql, /\banon[_-]?key\b/i);
    assert.doesNotMatch(withoutComments(sql), /training_sessions/i);
    assert.doesNotMatch(withoutComments(sql), /fit_message_payloads/i);
    assert.doesNotMatch(withoutComments(sql), /session_garmin/i);
  }
});

test("generated seed SQL is draft-only and generator is idempotent", async () => {
  const first = await writeSupabaseSeedSql(root);
  const second = await writeSupabaseSeedSql(root);
  const generated = await readText("supabase/seed/coach_context_jotason_seed.generated.sql");
  const built = await buildSupabaseSeedSql(root);

  assert.equal(await fileExists("supabase/seed/coach_context_jotason_seed.generated.sql"), true);
  assert.equal(second.changed, false);
  assert.equal(generated, built);
  assert.match(generated, /GENERATED DRAFT ONLY/);
  assert.match(generated, /\bbegin;/i);
  assert.match(generated, /rollback;/i);
  assert.match(generated, /fixture_user = 'jotason'|fixture_user, source_key/);
  assert.doesNotMatch(generated, /SUPABASE_URL/i);
  assert.doesNotMatch(generated, /SUPABASE_SERVICE/i);
  assert.doesNotMatch(generated, /\bservice[_-]?role\b/i);
  assert.doesNotMatch(generated, /\banon[_-]?key\b/i);
  assert.equal(typeof first.changed, "boolean");
});

test("seed SQL only targets coach tables", async () => {
  const seedFiles = [
    "supabase/seed/coach_context_jotason_seed_draft.sql",
    "supabase/seed/coach_context_jotason_seed.generated.sql",
    "supabase/seed/coach_context_jotason_rollback_draft.sql",
  ];

  for (const file of seedFiles) {
    const sql = withoutComments(await readText(file));
    const tableReferences = [...sql.matchAll(/\b(?:into|from|update)\s+public\.(\w+)/gi)].map((match) => match[1]);
    assert.ok(tableReferences.length > 0, file);
    for (const table of tableReferences) {
      assert.ok(table.startsWith("coach_"), `${file}:${table}`);
    }
  }
});

test("seed generator does not import Supabase client or network APIs", async () => {
  const script = await readText("scripts/coach-context/generate-supabase-seed-sql.mjs");

  assert.doesNotMatch(script, /@supabase\/supabase-js/i);
  assert.doesNotMatch(script, /\bfetch\s*\(/i);
  assert.doesNotMatch(script, /SUPABASE_URL/i);
  assert.doesNotMatch(script, /SUPABASE_SERVICE/i);
  assert.doesNotMatch(script, /\bservice[_-]?role\b/i);
});

test("package scripts do not apply migrations or run real seed", async () => {
  const packageJson = JSON.parse(await readText("package.json"));
  const scripts = JSON.stringify(packageJson.scripts);

  assert.equal(
    packageJson.scripts["coach:supabase:seed-sql"],
    "node scripts/coach-context/generate-supabase-seed-sql.mjs",
  );
  assert.equal(
    packageJson.scripts["coach:supabase:seed-v1"],
    "node scripts/coach-context/generate-coach-context-seed-sql.mjs",
  );
  assert.doesNotMatch(scripts, /supabase\s+db\s+push/i);
  assert.doesNotMatch(scripts, /supabase\s+migration\s+up/i);
  assert.doesNotMatch(scripts, /supabase\s+db\s+reset/i);
  assert.doesNotMatch(scripts, /\bpsql\b/i);
});

test("schema branch does not create forbidden runtime files", async () => {
  assert.equal(await fileExists("src/main.jsx"), true);

  const functionEntries = await readdir(path.join(root, "supabase", "functions"));
  assert.deepEqual(functionEntries.sort(), ["coach-context", "coach-context-memory", "coach-reply", "session-context"].sort());
});

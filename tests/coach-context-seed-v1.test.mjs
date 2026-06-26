import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCoachContextSeedRollbackSql,
  buildCoachContextSeedSql,
  buildCoachContextSeedVerifySql,
  writeCoachContextSeedSql,
} from "../scripts/coach-context/generate-coach-context-seed-sql.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const generatedFiles = [
  "docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.sql",
  "docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.verify.sql",
  "docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.rollback.sql",
];

const forbiddenPatterns = [
  /service[_-]?role/i,
  /anon[_-]?key/i,
  /password/i,
  /SUPABASE_URL/i,
  /SUPABASE_SERVICE/i,
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

function withoutComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("coach context seed v1 generated files exist and are idempotent", async () => {
  const first = await writeCoachContextSeedSql(root);
  const second = await writeCoachContextSeedSql(root);

  assert.equal(first.length, 3);
  assert.deepEqual(second.map((item) => item.changed), [false, false, false]);

  for (const file of generatedFiles) {
    assert.equal(await fileExists(file), true, file);
  }

  assert.equal(
    await readText("docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.sql"),
    await buildCoachContextSeedSql(root),
  );
});

test("coach context seed v1 is scoped to jotason fixture rows", async () => {
  const seed = await readText("docs/coach-context/generated/coach-context-jotason-fixture-seed-v1.sql");

  assert.match(seed, /fixture_user = 'jotason'/);
  assert.match(seed, /'coach_context_jotason_fixture_v1'/);
  assert.match(seed, /profile_type/);
  assert.match(seed, /'fixture'/);
  assert.match(seed, /user_id, fixture_user/);
  assert.match(seed, /on conflict \(fixture_user, source_key\) where fixture_user is not null do update set/i);
  assert.match(seed, /insert into public\.coach_seed_runs/);
  assert.match(seed, /'applied'/);
  assert.doesNotMatch(withoutComments(seed), /\brollback\b/i);
});

test("coach context seed v1 only writes coach tables and contains no secrets", async () => {
  const seed = withoutComments(await buildCoachContextSeedSql(root));
  const tableReferences = [...seed.matchAll(/\b(?:into|from|update)\s+public\.(\w+)/gi)].map((match) => match[1]);

  assert.ok(tableReferences.length > 0);
  for (const table of tableReferences) {
    assert.ok(table.startsWith("coach_"), table);
  }

  assert.doesNotMatch(seed, /training_sessions/i);
  assert.doesNotMatch(seed, /fit_message_payloads/i);
  assert.doesNotMatch(seed, /session_samples/i);
  assert.doesNotMatch(seed, /\bgarmin\b/i);

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(seed, pattern, pattern.toString());
  }
});

test("coach context seed v1 verification is select-only", async () => {
  const verify = buildCoachContextSeedVerifySql();
  const executable = withoutComments(verify);

  assert.match(verify, /SELECT-only verification/i);
  assert.match(verify, /fixture_rows_with_user_id/);
  assert.match(verify, /duplicate_source_keys/);
  assert.match(verify, /orphan_relationships/);
  assert.match(verify, /garmin_fit_untouched/);
  assert.doesNotMatch(executable, /\b(insert|update|delete|truncate|drop|alter|create)\b/i);
});

test("coach context seed v1 rollback only deletes jotason fixture coach rows", async () => {
  const rollback = buildCoachContextSeedRollbackSql();
  const executable = withoutComments(rollback);

  assert.match(rollback, /fixture_user = 'jotason'/);
  assert.match(rollback, /seed_key = 'coach_context_jotason_fixture_v1'/);
  assert.doesNotMatch(executable, /\btruncate\b/i);
  assert.doesNotMatch(executable, /\bdrop\b/i);

  const deleteTargets = [...executable.matchAll(/\bdelete\s+from\s+public\.(\w+)\s+where\s+([^;]+);/gi)];
  assert.ok(deleteTargets.length > 0);
  for (const [, table, whereClause] of deleteTargets) {
    assert.ok(table.startsWith("coach_"), table);
    assert.match(whereClause, /fixture_user = 'jotason'|seed_key = 'coach_context_jotason_fixture_v1'/);
  }
});

test("manual SQL editor result documents schema applied and seed ready", async () => {
  const applied = await readText("docs/coach-context/dev-apply-results/2026-06-26-coach-context-schema-v0-applied-manual-sql-editor.md");
  const ready = await readText("docs/coach-context/dev-apply-results/2026-06-26-coach-context-jotason-seed-v1-ready-for-sql-editor.md");

  assert.match(applied, /rdduqsziboqxlgeqouxq/);
  assert.match(applied, /coach_tables_count = 11/);
  assert.match(applied, /rls_enabled_count = 11/);
  assert.match(applied, /policy_count = 31/);
  assert.match(applied, /Seed executed: no/);
  assert.match(ready, /Seed executed: no/);
  assert.match(ready, /ready for SQL Editor/i);
  assert.match(ready, /coach-context-jotason-fixture-seed-v1\.sql/);

  for (const text of [applied, ready]) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(text, pattern, pattern.toString());
    }
  }
});

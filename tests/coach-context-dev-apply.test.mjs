import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildDevApplyVerificationSql,
  writeDevApplyVerificationSql,
} from "../scripts/coach-context/generate-dev-apply-verification-sql.mjs";
import { runDevApplyPreflight } from "../scripts/coach-context/preflight-dev-apply.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

const destructivePatterns = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\balter\b/i,
  /\bcreate\b/i,
  /\btruncate\b/i,
  /supabase\s+db\s+push/i,
  /supabase\s+db\s+reset/i,
  /supabase\s+migration\s+up/i,
];

const secretPatterns = [
  /SUPABASE_URL/i,
  /SUPABASE_SERVICE/i,
  /\bservice[_-]?role\b/i,
  /\banon[_-]?key\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

test("dev apply documentation exists", async () => {
  assert.equal(await fileExists("docs/coach-context/dev-apply-runbook.md"), true);
  assert.equal(await fileExists("docs/coach-context/dev-apply-checklist.md"), true);
  assert.equal(await fileExists("docs/coach-context/dev-apply-verification.md"), true);
});

test("dev apply runbook and checklist contain safety gates", async () => {
  const runbook = await readText("docs/coach-context/dev-apply-runbook.md");
  const checklist = await readText("docs/coach-context/dev-apply-checklist.md");

  assert.match(runbook, /El seed real vendra despues/);
  assert.match(runbook, /No aplicar seed todavia/);
  assert.match(runbook, /no es produccion/i);
  assert.match(checklist, /Estoy en entorno dev/);
  assert.match(checklist, /No estoy en produccion/);
  assert.match(checklist, /backup\/snapshot/);
  assert.match(checklist, /No he ejecutado seed/);
});

test("verification docs cover RLS policies coach tables and empty pre-seed counts", async () => {
  const verification = await readText("docs/coach-context/dev-apply-verification.md");

  assert.match(verification, /rowsecurity/);
  assert.match(verification, /pg_policies/);
  assert.match(verification, /table_name like 'coach_%'/);
  assert.match(verification, /cero filas|count\(\*\)/i);
});

test("dev verification SQL generator emits only safe selects", async () => {
  const result = await writeDevApplyVerificationSql(root);
  const generated = await readText("docs/coach-context/generated/dev-apply-verification.sql");
  const built = buildDevApplyVerificationSql();
  const executableSql = withoutComments(generated);

  assert.equal(await fileExists("docs/coach-context/generated/dev-apply-verification.sql"), true);
  assert.equal(generated, built);
  assert.equal(typeof result.changed, "boolean");
  assert.match(generated, /VERIFICATION ONLY - SAFE SELECTS ONLY/);
  assert.match(generated, /rowsecurity/);
  assert.match(generated, /pg_policies/);
  assert.match(generated, /table_name like 'coach_%'/);
  assert.match(generated, /count\(\*\) as rows/);

  for (const pattern of destructivePatterns) {
    assert.doesNotMatch(executableSql, pattern, pattern.toString());
  }
  for (const pattern of secretPatterns) {
    assert.doesNotMatch(generated, pattern, pattern.toString());
  }
});

test("preflight is local-only and detects required artifacts", async () => {
  const result = await runDevApplyPreflight(root);

  assert.equal(result.valid, true, result.errors.join(", "));
  assert.equal(result.migration, "supabase/migrations/20260626123654_coach_context_schema_v0.sql");
  assert.equal(result.expected_tables.length, 11);
  assert.equal(result.rollback_draft_present, true);
  assert.equal(result.tests_present, true);
  assert.match(result.warnings.join("\n"), /does not connect to Supabase/);
});

test("preflight script does not import Supabase client or network APIs", async () => {
  const script = await readText("scripts/coach-context/preflight-dev-apply.mjs");

  assert.doesNotMatch(script, /@supabase\/supabase-js/i);
  assert.doesNotMatch(script, /\bfetch\s*\(/i);
  assert.doesNotMatch(script, /SUPABASE_URL/i);
  assert.doesNotMatch(script, /SUPABASE_SERVICE/i);
  assert.doesNotMatch(script, /\bservice[_-]?role\b/i);
});

test("dev verification generator does not import Supabase client or network APIs", async () => {
  const script = await readText("scripts/coach-context/generate-dev-apply-verification-sql.mjs");

  assert.doesNotMatch(script, /@supabase\/supabase-js/i);
  assert.doesNotMatch(script, /\bfetch\s*\(/i);
  for (const pattern of secretPatterns) {
    assert.doesNotMatch(script, pattern, pattern.toString());
  }
});

test("package scripts do not apply migrations or real seed", async () => {
  const packageJson = JSON.parse(await readText("package.json"));
  const scripts = JSON.stringify(packageJson.scripts);

  assert.equal(
    packageJson.scripts["coach:supabase:dev-preflight"],
    "node scripts/coach-context/preflight-dev-apply.mjs",
  );
  assert.equal(
    packageJson.scripts["coach:supabase:dev-verify-sql"],
    "node scripts/coach-context/generate-dev-apply-verification-sql.mjs",
  );

  for (const pattern of destructivePatterns.slice(7)) {
    assert.doesNotMatch(scripts, pattern, pattern.toString());
  }
  assert.doesNotMatch(scripts, /\bpsql\b/i);
});

test("dev apply phase does not touch forbidden runtime surfaces", async () => {
  assert.equal(await fileExists("src/main.jsx"), true);
  assert.equal(await fileExists("supabase/functions/coach-context/index.ts"), true);

  const newScripts = [
    await readText("scripts/coach-context/preflight-dev-apply.mjs"),
    await readText("scripts/coach-context/generate-dev-apply-verification-sql.mjs"),
  ].join("\n");

  assert.doesNotMatch(newScripts, /fit-file-parser/i);
  assert.doesNotMatch(newScripts, /\bGarmin\b/i);
  assert.doesNotMatch(newScripts, /src\/main\.jsx/i);
  assert.doesNotMatch(newScripts, /supabase\/functions/i);
});


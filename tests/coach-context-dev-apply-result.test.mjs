import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const resultsDir = path.join(root, "docs", "coach-context", "dev-apply-results");

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function resultFiles() {
  const names = await readdir(resultsDir);
  return names.filter((name) => name.endsWith(".md") && name !== "README.md").sort();
}

const sensitivePatterns = [
  /service[_-]?role/i,
  /anon\s*key/i,
  /anon[_-]?key/i,
  /password/i,
  /token/i,
  /SUPABASE_URL/i,
  /SUPABASE_SERVICE/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

test("dev apply results folder and result document exist", async () => {
  assert.equal(await fileExists(resultsDir), true);
  const files = await resultFiles();

  assert.ok(files.some((name) => /coach-context-schema-v0(?:-not-applied)?\.md$/.test(name)), files.join(", "));
});

test("dev apply result contains required outcome fields and no sensitive values", async () => {
  const files = await resultFiles();
  const resultText = (await Promise.all(
    files.map((name) => readFile(path.join(resultsDir, name), "utf8")),
  )).join("\n");

  assert.match(resultText, /Migration applied: (yes|no)/);
  assert.match(resultText, /Seed executed: no/);
  assert.match(resultText, /Supabase writes: (migration only|none)/);
  assert.match(resultText, /Verification SQL executed: (yes|no)/);
  assert.match(resultText, /Verification SQL file:/);
  assert.match(resultText, /Garmin\/FIT untouched: yes/);

  for (const pattern of sensitivePatterns) {
    assert.doesNotMatch(resultText, pattern, pattern.toString());
  }
});

test("package scripts do not contain destructive Supabase apply or seed commands", async () => {
  const packageJson = JSON.parse(await readText("package.json"));
  const scripts = JSON.stringify(packageJson.scripts);

  assert.doesNotMatch(scripts, /supabase\s+db\s+reset/i);
  assert.doesNotMatch(scripts, /supabase\s+seed/i);
  assert.doesNotMatch(scripts, /supabase\s+migration\s+up/i);
  assert.doesNotMatch(scripts, /supabase\s+db\s+push/i);
});

test("dev apply result confirms forbidden runtime surfaces were not touched", async () => {
  const files = await resultFiles();
  const resultText = (await Promise.all(
    files.map((name) => readFile(path.join(resultsDir, name), "utf8")),
  )).join("\n");

  assert.equal(await fileExists(path.join(root, "src", "main.jsx")), true);
  assert.equal(await fileExists(path.join(root, "supabase", "functions", "coach-context", "index.ts")), true);
  assert.match(resultText, /UI untouched: yes/);
  assert.match(resultText, /`src\/main\.jsx` untouched: yes/);
  assert.match(resultText, /Edge Functions untouched: yes/);
  assert.match(resultText, /import Garmin\/FIT untouched: yes/);
  assert.match(resultText, /Garmin\/FIT untouched: yes/);
  assert.match(resultText, /no migration was applied and no Supabase write was performed/);
});

import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import pg from "pg";
if (process.env.ENQIDU_TRANSACTION_ENV_FILE)
  loadEnvFile(process.env.ENQIDU_TRANSACTION_ENV_FILE);
assert.equal(process.env.ENQIDU_TRANSACTION_LOCAL, "1");
const url = new URL(process.env.DB_URL);
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    !url.search &&
    url.pathname === "/postgres" &&
    url.port,
);
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
const name = `enqidu_reconciliation_test_semantics_${Date.now()}`;
await admin.query(`create database ${name}`);
try {
  url.pathname = "/" + name;
  const result = spawnSync(
    process.execPath,
    ["--test", "tests/semantic-corrections-postgres.test.mjs"],
    {
      stdio: "inherit",
      env: { ...process.env, ENQIDU_RECONCILIATION_PG_URL: url.href },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await admin.query(`drop database ${name} with (force)`);
  await admin.end();
}

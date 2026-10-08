import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Apply the exact incremental product migration to the disposable local E2E
// database. This launcher has no host, URL, credential or container override.
// The slim E2E baseline lives outside product migration history; do not copy or
// reimplement the wrapper in a second fixture migration.
const sql = await readFile(new URL("../supabase/migrations/20261007045422_apply_enqidu_action_v1.sql", import.meta.url), "utf8");
if (!sql.includes("create or replace function public.apply_enqidu_action_v1")) throw new Error("The transactional migration is missing its expected closed RPC");
const dockerEnv = { ...process.env };
for (const name of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete dockerEnv[name];
const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", "supabase_db_enqidu-e2e", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
  input: `${sql}\nnotify pgrst, 'reload schema';\n`, encoding: "utf8", env: dockerEnv, maxBuffer: 8 * 1024 * 1024,
});
if (result.status !== 0) throw new Error(`Disposable transactional migration failed: ${result.stderr || result.error?.message}`);
console.log("Transactional action migration ready in disposable local Supabase; no remote changes.");

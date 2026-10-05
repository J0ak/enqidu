import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Reconstruct inspected canonical Health tables only in the disposable local
// project. Reuse the existing fixture and migration; create no migration files.
const container = "supabase_db_enqidu-e2e";
const dockerEnv = { ...process.env };
for (const name of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete dockerEnv[name];

function query(sql, args = []) {
  const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...args], {
    input: sql, encoding: "utf8", env: dockerEnv, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Disposable local Health bootstrap failed: ${result.stderr || result.error?.message}`);
  return result.stdout.trim();
}

// This command cannot accept a remote URL, credentials, or a container override.
const alreadyBootstrapped = query("select count(*) from information_schema.columns where table_schema='public' and table_name='wearable_health_daily' and column_name='foundation_record_key';", ["-At"]);
if (alreadyBootstrapped === "1") {
  console.log("Disposable local Health Foundation already bootstrapped.");
} else {
  const fixture = await readFile(new URL("../tests/fixtures/health-foundation-live-schema.sql", import.meta.url), "utf8");
  const canonicalFixture = fixture.slice(fixture.indexOf("create table public.wearable_health_imports("));
  const tables = [...canonicalFixture.matchAll(/create table public\.(\w+)\(/g)].map((match) => match[1]);
  if (tables.length !== 15 || tables.some((table) => !table.startsWith("wearable_"))) throw new Error("Unexpected canonical Health fixture; inspect before bootstrapping.");
  const existingMigration = await readFile(new URL("../supabase/migrations/20261004134444_health_foundation_v1.sql", import.meta.url), "utf8");
  const migrationBody = existingMigration.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, "");
  query(`begin;\ndrop table if exists ${tables.map((table) => `public.${table}`).join(",")} cascade;\n${canonicalFixture}\n${migrationBody}\ncommit;\nnotify pgrst, 'reload schema';`);
  console.log(`Disposable local Health Foundation ready (${tables.length} inspected tables; existing migration reused).`);
}

const secured = query("select (to_regprocedure('public.ingest_garmin_health_record(uuid,jsonb)') is not null and not has_function_privilege('authenticated','public.ingest_garmin_health_record(uuid,jsonb)','EXECUTE') and not has_table_privilege('authenticated','public.wearable_health_daily','INSERT') and not has_table_privilege('authenticated','public.planned_training_sessions','UPDATE'))::text;", ["-At"]);
if (secured !== "true") throw new Error("Disposable local Health/plan security contract is incomplete.");

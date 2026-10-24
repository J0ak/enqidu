import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Restore the audited production RLS baseline missing from the slim local fixture.
// This is ONLY a disposable-stack fixture; no application RLS is changed by the new migration.
let sql = "BEGIN;";
for (const table of [
  "session_blocks",
  "session_exercises",
  "session_metrics",
  "session_laps",
  "session_samples",
  "fit_message_payloads",
]) {
  sql += `alter table public.${table} enable row level security;
  create policy local_audited_owner on public.${table} for all to authenticated
  using (exists(select 1 from public.training_sessions s where s.id=${table}.session_id and s.user_id=(select auth.uid())))
  with check (exists(select 1 from public.training_sessions s where s.id=${table}.session_id and s.user_id=(select auth.uid())));\n`;
}
sql += `alter table public.ai_usage_events enable row level security;
create policy local_audited_owner on public.ai_usage_events for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.equipment_catalog enable row level security;
create policy local_audited_read on public.equipment_catalog for select to authenticated using(true);
alter table public.wearable_activity_imports enable row level security;
create policy local_audited_read on public.wearable_activity_imports for select to authenticated using ((select auth.uid())=user_id);
create policy local_audited_insert on public.wearable_activity_imports for insert to authenticated with check ((select auth.uid())=user_id);
create policy local_audited_update on public.wearable_activity_imports for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
`;
sql += readFileSync(
  new URL("./audited-context-auth-baseline.sql", import.meta.url),
  "utf8",
);
sql += "COMMIT;";
sql = sql.replace(
  /create policy (local_audited_\w+) on public\.(\w+)/g,
  "drop policy if exists $1 on public.$2; create policy $1 on public.$2",
);
sql += readFileSync(
  new URL(
    "../supabase/migrations/20261023150630_mcp_private_oauth_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
// New production migrations must also participate in this acceptance schema. If a
// future migration needs more baseline fixtures, CI must fail until they are supplied.
const migrations = new URL("../supabase/migrations/", import.meta.url);
for (const file of readdirSync(migrations)
  .filter(
    (name) =>
      /^\d{14}_.+\.sql$/.test(name) &&
      name > "20261023150630_mcp_private_oauth_v1.sql",
  )
  .sort())
  sql += "\n" + readFileSync(new URL(file, migrations), "utf8");
const env = { ...process.env };
for (const k of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[k];
const r = spawnSync(
  "docker",
  [
    "--host=unix:///var/run/docker.sock",
    "exec",
    "-i",
    "supabase_db_enqidu-e2e",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8", env },
);
if (r.status !== 0) throw Error(r.stderr);
console.log(
  "Private OAuth schema installed ONLY in disposable local database.",
);

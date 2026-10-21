import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Disposable local stack only, after reconciliation bootstrap. Real SQL contract.
const sql =
  `create table if not exists public.exercise_catalog(id uuid primary key default gen_random_uuid(),code text unique not null,name text not null,is_active boolean not null default true,metadata jsonb not null default '{}');
alter table public.exercise_catalog enable row level security;
do $$ begin if not exists(select 1 from pg_policies where tablename='exercise_catalog' and policyname='local_catalog_read') then create policy local_catalog_read on public.exercise_catalog for select to authenticated using(true); end if; end $$;
alter table public.session_exercises add column if not exists exercise_id uuid references public.exercise_catalog(id);
alter table public.enkidu_conversation_enrichments add column if not exists local_date date, add column if not exists enrichment_type text default 'conversation_training_log', add column if not exists source text default 'chatgpt_pilot', add column if not exists ai_usage jsonb default '{}';
create unique index if not exists local_semantic_event_identity on public.enkidu_conversation_enrichments(session_id,enrichment_type,source);
` +
  readFileSync(
    new URL(
      "../supabase/migrations/20261018143400_canonical_training_semantics_v1.sql",
      import.meta.url,
    ),
    "utf8",
  ) +
  readFileSync(
    new URL(
      "../supabase/migrations/20261019190737_semantic_materialization_v1.sql",
      import.meta.url,
    ),
    "utf8",
  ) +
  "\nnotify pgrst,'reload schema';";
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const result = spawnSync(
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
  { input: sql, encoding: "utf8", env, maxBuffer: 1024 * 1024 },
);
if (result.status !== 0)
  throw Error(result.stderr || "Local semantic bootstrap failed");
console.log(
  "Canonical semantic migration installed in disposable local database only.",
);

import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Reconstruct missing *production* columns in the deliberately slim local fixture.
// No remote host/container override is accepted.
const schema=readFileSync(new URL('../tests/fixtures/reconciliation-production-schema.sql',import.meta.url),'utf8');
let sql='begin;\n';
for(const match of schema.matchAll(/create table public\.(\w+) \(\n([\s\S]*?)\n\);/g)){
 const [,table,columns]=match;
 if(['session_source_links','wearable_activity_imports'].includes(table)){
   sql+=`create table if not exists public.${table} (${columns});\n`;
 } else {
   for(const line of columns.split('\n')){
     const col=line.trim().replace(/,$/,'').replace(/ not null$/,'');
     sql+=`alter table public.${table} add column if not exists ${col};\n`;
   }
 }
}
sql+=`create unique index if not exists local_source_identity on public.training_sources(user_id,file_checksum);
create unique index if not exists local_session_source_identity on public.session_source_links(session_id,source_id);
alter table public.session_source_links enable row level security;
create policy local_source_link_owner on public.session_source_links for select to authenticated using(exists(select 1 from public.training_sessions s where s.id=session_id and s.user_id=auth.uid()));
grant select on public.session_source_links to authenticated;
grant all on public.session_source_links,public.wearable_activity_imports to service_role;
alter table public.session_laps add column if not exists lap_order integer, add column if not exists lap_type text, add column if not exists elapsed_seconds numeric, add column if not exists distance_m numeric;
commit;\n`;
sql+=readFileSync(new URL('../supabase/migrations/20261016054109_canonical_training_reconciliation_v1.sql',import.meta.url),'utf8');
sql+="\nnotify pgrst, 'reload schema';\n";
const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const result=spawnSync('docker',['--host=unix:///var/run/docker.sock','exec','-i','supabase_db_enqidu-e2e','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',env});
if(result.status!==0)throw Error(result.stderr||'Local reconciliation bootstrap failed');
console.log('Production reconciliation migration applied to disposable local E2E database only.');

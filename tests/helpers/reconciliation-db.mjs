import assert from 'node:assert/strict';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
export const migration = readFileSync(new URL('../../supabase/migrations/20261016054109_canonical_training_reconciliation_v1.sql', import.meta.url),'utf8');
export async function database({ install = true } = {}) {
 let db;
 if (process.env.ENQIDU_RECONCILIATION_PG_URL) {
   const url=new URL(process.env.ENQIDU_RECONCILIATION_PG_URL);
   assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname) && /^\/enqidu_reconciliation_test_[a-z0-9_]+$/.test(url.pathname) && !url.search);
   pg.types.setTypeParser(1700,Number);
   const client=new pg.Client({connectionString:url.href});await client.connect();
   db={exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args),close:()=>client.end()};
 } else db = new PGlite();
 await db.exec(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
 await db.exec(readFileSync(new URL('../fixtures/reconciliation-production-schema.sql',import.meta.url),'utf8'));
 await db.exec(`alter table training_sessions add primary key(id); alter table training_sources add primary key(id); alter table training_sources add unique(user_id,file_checksum);
 alter table planned_training_sessions add primary key(id); alter table profiles add primary key(id);
 alter table session_blocks add primary key(id); alter table session_exercises add primary key(id);
 alter table session_source_links add primary key(session_id,source_id);
 alter table session_blocks add foreign key(session_id) references training_sessions(id);
 alter table session_exercises add foreign key(block_id) references session_blocks(id);
 grant usage on schema public,auth to service_role,authenticated,anon;
 -- Production role_table_grants verified read-only on 2026-10-17. No blanket CRUD.
 grant references, trigger, truncate on training_sessions,training_sources,
   session_source_links,session_blocks,session_exercises to service_role;
 grant insert, references, select, trigger, truncate on planned_training_sessions to service_role;
 grant select,insert,update,delete,references,trigger,truncate on profiles,wearable_activity_imports to service_role;`);
 await db.exec(`create function public.chatgpt_pilot_apply_capture(jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
 create function public.persist_conversation_enrichment(uuid,jsonb,jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
 grant execute on function public.chatgpt_pilot_apply_capture(jsonb),public.persist_conversation_enrichment(uuid,jsonb,jsonb) to authenticated,service_role;`);
 if (install) await db.exec(migration);
 return db;
}
export async function insert(db,table,row) {
 const keys=Object.keys(row);
 await db.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>row[k] && typeof row[k]==='object' && !Array.isArray(row[k])?JSON.stringify(row[k]):Array.isArray(row[k]) && !['tags','disciplines','usual_environment','usual_equipment'].includes(k)?JSON.stringify(row[k]):row[k]));
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { connect, role, assertBlocked } from '../tests/transactional-actions/local-postgres.mjs';
import { normalizeGarminHealthRecord } from '../src/health/garminAdapter.js';

// Opt-in and loopback checks are enforced by local-postgres.mjs. Refuse any nonempty database.
// This creates the inspected fixtures only, never runs against a Supabase project or production URL.
const monitor=await connect('garmin-monitor'),a=await connect('garmin-revoke'),b=await connect('garmin-ingest');
try {
  const {rows}=await monitor.query("select count(*)::int as n from pg_tables where schemaname in ('public','auth')");
  assert.equal(rows[0].n,0,'This check requires an EMPTY disposable local PostgreSQL database');
  for (const path of ['tests/fixtures/health-foundation-live-schema.sql','supabase/migrations/20261004134444_health_foundation_v1.sql','tests/fixtures/garmin-connections-live-schema.sql','supabase/migrations/20261013104703_garmin_sync_ownership_consent.sql'])
    await monitor.query(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
  const owner=randomUUID();
  await monitor.query('insert into auth.users(id) values($1)',[owner]);
  await role(a,'authenticated',owner);
  await a.query("select set_garmin_sync_consent('enable','garmin_daily_v1')");
  const binding=await monitor.query("update user_wearable_connections set connection_status='connected', connected_at=now(), binding_verified_at=now(), external_user_reference='local-test' where user_id=$1 returning binding_revision",[owner]);
  const revision=binding.rows[0].binding_revision;
  const record=normalizeGarminHealthRecord({provider:'garmin',provider_mode:'aggregator',ingestion_channel:'fitness_ai_connector',data_type:'sleep',calendar_date:'2026-10-12',timezone:'Europe/Madrid',retrieved_at:'2026-10-12T08:00:00Z',measurements:{sleep_score:{value:80,unit:'score'}}});
  await role(b,'service_role');
  const persist=()=>b.query('select ingest_owned_garmin_health_record($1,$2,$3::jsonb) as result',[owner,revision,JSON.stringify(record)]);
  assert.equal((await persist()).rows[0].result.status,'inserted');
  await a.query('begin');await a.query("select set_garmin_sync_consent('revoke',null)");
  await b.query('begin');
  let settled=false;
  const pending=persist().then(result=>{settled=true;return result;},error=>{settled=true;throw error;});pending.catch(()=>{});
  try {
    await assertBlocked(monitor,a,b,()=>settled);
    await a.query('commit');await assert.rejects(pending,/sync_authorization_changed/);await b.query('rollback');
  } finally {await a.query('rollback');await pending.catch(()=>{});await b.query('rollback');}
  assert.equal((await monitor.query('select count(*)::int as n from wearable_health_imports')).rows[0].n,1);
  // Active consent alone does not re-verify the revoked connection.
  await a.query("select set_garmin_sync_consent('reconnect',null)");await a.query("select set_garmin_sync_consent('enable','garmin_daily_v1')");
  assert.equal((await b.query('select * from claim_garmin_sync_batch()')).rows.length,0);
  await monitor.query("update user_wearable_connections set connection_status='connected', connected_at=now(), binding_verified_at=now(), external_user_reference='local-test' where user_id=$1",[owner]);
  await role(a,'service_role');await a.query('begin');
  assert.equal((await a.query('select * from claim_garmin_sync_batch()')).rows.length,1);
  assert.equal((await b.query('select * from claim_garmin_sync_batch()')).rows.length,0);
  await a.query('commit');assert.equal((await b.query('select * from claim_garmin_sync_batch()')).rows.length,0);
  const verification=await monitor.query(await readFile(new URL('../supabase/verification/garmin_sync_ownership.sql',import.meta.url),'utf8'));
  assert.ok(verification[2].rows.every(row=>Object.values(row).every(value=>value===true)));
  console.log('PASS: PostgreSQL 17 real migration, canonical writer, concurrent revoke lock, no late write, preserved Health, reconnect gate, concurrent claim isolation, RLS/grants verification.');
} finally {
  await Promise.allSettled([a.query('rollback'),b.query('rollback')]);
  await Promise.allSettled([a.end(),b.end(),monitor.end()]);
}

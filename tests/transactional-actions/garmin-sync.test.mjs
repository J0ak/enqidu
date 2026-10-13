import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, role, assertBlocked, DAY } from './local-postgres.mjs';
import { normalizeGarminHealthRecord } from '../../src/health/garminAdapter.js';

async function enable(f, userId=f.userId) {
  await role(f.reader,'authenticated',userId);
  await f.reader.query("select set_garmin_sync_consent('enable','garmin_daily_v1')");
  const {rows}=await f.monitor.query("update user_wearable_connections set connection_status='connected', connected_at=now(), binding_verified_at=now(), external_user_reference=$2 where user_id=$1 and provider='garmin' returning binding_revision",[userId,`test-${userId}`]);
  return rows[0].binding_revision;
}
const record=()=>normalizeGarminHealthRecord({provider:'garmin',provider_mode:'aggregator',ingestion_channel:'fitness_ai_connector',data_type:'sleep',calendar_date:DAY,timezone:'Europe/Madrid',retrieved_at:`${DAY}T08:00:00Z`,measurements:{sleep_score:{value:80,unit:'score'}}});

test('Garmin: real concurrent revoke holds row lock; waiting fetched record cannot commit after revoke',async t=>{
  const f=await fixture(t),revision=await enable(f);
  await role(f.a,'authenticated',f.userId);
  await f.a.query('begin');
  await f.a.query("select set_garmin_sync_consent('revoke',null)");
  await f.b.query('begin');
  let settled=false;
  const write=f.b.query('select ingest_owned_garmin_health_record($1,$2,$3::jsonb)',[f.userId,revision,JSON.stringify(record())]).then(result=>{settled=true;return result;},error=>{settled=true;throw error;});
  write.catch(()=>{});
  try {
    await assertBlocked(f.monitor,f.a,f.b,()=>settled);
    await f.a.query('commit');
    await assert.rejects(write,/sync_authorization_changed/);
    await f.b.query('rollback');
    assert.equal((await f.monitor.query('select count(*)::int as n from wearable_health_imports where user_id=$1',[f.userId])).rows[0].n,0);
  } finally {await f.a.query('rollback');await write.catch(()=>{});await f.b.query('rollback');}
});

test('Garmin: concurrent batch claims skip locked owners without duplicating work',async t=>{
  const f=await fixture(t);await enable(f);await enable(f,f.otherId);
  await f.a.query('begin');
  try {
    const first=await f.a.query('select * from claim_garmin_sync_batch()');
    const second=await f.b.query('select * from claim_garmin_sync_batch()');
    assert.equal(first.rows.length,2);assert.equal(second.rows.length,0);
    await f.a.query('commit');
    assert.equal((await f.b.query('select * from claim_garmin_sync_batch()')).rows.length,0);
  } finally {await f.a.query('rollback');}
});

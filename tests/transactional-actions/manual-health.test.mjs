import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, role, assertBlocked, DAY, persisted } from './local-postgres.mjs';
import { normalizeManualHealthImport } from '../../src/health/manualHealthImport.js';
const record = (value=80,hour='08') => normalizeManualHealthImport({version:'enqidu.manual-health.v1',observation_date:DAY,captured_at:`${DAY}T${hour}:00:00Z`,family:'sleep',source_evidence:{kind:'garmin_connect_visible_summary'},measurements:{sleep_score:{value,unit:'score'}}},{timezone:'Europe/Madrid',retrievedAt:`${DAY}T12:00:00Z`});
const apply = async (db,user,rec,expected=null) => (await db.query('select public.apply_manual_health_import($1,$2::jsonb,$3) result',[user,JSON.stringify(rec),expected])).rows[0].result;

test('manual Health: concurrent first imports serialize; stale confirmation writes no raw or projection',async t=>{
  const f=await fixture(t);const before=await persisted(f.monitor,[f.userId,f.otherId]);
  await f.a.query('begin');await apply(f.a,f.userId,record());
  await f.b.query('begin');let settled=false;
  const pending=apply(f.b,f.userId,record(30,'09')).finally(()=>{settled=true;});pending.catch(()=>{});
  try{
    await assertBlocked(f.monitor,f.a,f.b,()=>settled);await f.a.query('commit');
    await assert.rejects(pending,e=>e.code==='40001');await f.b.query('rollback');
    assert.equal((await f.monitor.query('select count(*)::int n from wearable_provider_raw_payloads where user_id=$1',[f.userId])).rows[0].n,1);
    assert.equal((await f.monitor.query('select sleep_score from wearable_sleep_sessions where user_id=$1',[f.userId])).rows[0].sleep_score,80);
    assert.deepEqual(await persisted(f.monitor,[f.userId,f.otherId]),before);
  }finally{await f.a.query('rollback');await pending.catch(()=>{});await f.b.query('rollback');}
});
test('manual Health: committed profile timezone change invalidates a waiting confirmation',async t=>{
  const f=await fixture(t);
  await f.a.query('begin');await f.a.query("update profiles set timezone='UTC' where id=$1",[f.userId]);
  await f.b.query('begin');let settled=false;const pending=apply(f.b,f.userId,record()).finally(()=>{settled=true;});pending.catch(()=>{});
  try{
    await assertBlocked(f.monitor,f.a,f.b,()=>settled);await f.a.query('commit');
    await assert.rejects(pending,e=>e.code==='40001');await f.b.query('rollback');
    assert.equal((await f.monitor.query('select count(*)::int n from wearable_health_imports where user_id=$1',[f.userId])).rows[0].n,0);
  }finally{await f.a.query('rollback');await pending.catch(()=>{});await f.b.query('rollback');}
});
test('manual Health: browser role cannot invoke closed writer for self or another user',async t=>{
  const f=await fixture(t);await role(f.reader,'authenticated',f.userId);
  for(const user of [f.userId,f.otherId])await assert.rejects(()=>apply(f.reader,user,record()),e=>e.code==='42501');
  await apply(f.a,f.userId,record());
  assert.equal((await f.reader.query('select count(*)::int n from wearable_sleep_sessions where user_id=$1',[f.otherId])).rows[0].n,0);
});

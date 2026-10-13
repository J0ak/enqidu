import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openHealthDb, HEALTH_USER_A as A, HEALTH_USER_B as B } from './support/healthFoundationDb.mjs';
import { GarminAdapter } from '../src/health/garminAdapter.js';
const migration = new URL('../supabase/migrations/20261013104703_garmin_sync_ownership_consent.sql', import.meta.url);
async function open() {
  const db = await openHealthDb();
  await db.exec(await readFile(new URL('./fixtures/garmin-connections-live-schema.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(migration, 'utf8'));
  return db;
}
async function as(db, role, user, op) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
  try { return await op(); } finally { await db.exec('reset role'); }
}
const consent = (db, user, action, version = 'garmin_daily_v1') => as(db, 'authenticated', user,
  () => db.query('select set_garmin_sync_consent($1,$2) as result', [action, version]));
async function connect(db, user) {
  await db.query("update user_wearable_connections set connection_status='connected', external_user_reference=$2, connected_at=now(), binding_verified_at=now() where user_id=$1", [user, `fixture-${user}`]);
  return (await db.query('select binding_revision from user_wearable_connections where user_id=$1', [user])).rows[0].binding_revision;
}

test('real migration: consent is explicit, audited, owner-only; users cannot forge server bindings or write Health', async () => {
  const db = await open();
  try {
    await assert.rejects(consent(db,A,'enable',null), /consent_version_required/);
    await assert.rejects(as(db,'anon',null,()=>db.query("select set_garmin_sync_consent('enable','garmin_daily_v1')")), /permission denied/);
    await assert.rejects(as(db,'authenticated',null,()=>db.query("select set_garmin_sync_consent('enable','garmin_daily_v1')")), /auth_required/);
    assert.equal((await consent(db,A,'enable')).rows[0].result.sync_enabled,true);
    const status = (await db.query('select * from user_wearable_connections where user_id=$1',[A])).rows[0];
    assert.equal(status.connection_status,'pending'); assert.equal(status.binding_verified_at,null);
    await consent(db,B,'disable');
    await as(db,'authenticated',A,async()=>{
      assert.equal((await db.query('select user_id from user_wearable_connections')).rows.length,1);
      assert.equal((await db.query('select user_id from garmin_sync_consent_events')).rows.length,1);
      for (const sql of ["update user_wearable_connections set binding_verified_at=now()", "update user_wearable_connections set consent_status='active'", "delete from user_wearable_connections", "truncate user_wearable_connections", "delete from garmin_sync_consent_events", "select claim_garmin_sync_batch()", "select ingest_owned_garmin_health_record(null,0,'{}')", "insert into wearable_health_daily(user_id,calendar_date) values(null,current_date)"])
        await assert.rejects(db.query(sql),/permission denied/);
    });
    const rev = await connect(db,A);
    assert.equal((await consent(db,A,'disable')).rows[0].result.sync_enabled,false);
    assert.equal((await consent(db,A,'enable')).rows[0].result.sync_enabled,true);
    await consent(db,A,'revoke');
    await assert.rejects(consent(db,A,'enable'),/reconnect_required/);
    await consent(db,A,'reconnect');
    const reconnected=(await db.query('select * from user_wearable_connections where user_id=$1',[A])).rows[0];
    assert.equal(reconnected.binding_verified_at,null); assert.equal(reconnected.external_user_reference,null);
    assert.equal(reconnected.consent_status,'pending_consent'); assert.ok(reconnected.binding_revision>rev);
    const events=(await db.query('select action from garmin_sync_consent_events where user_id=$1 order by id',[A])).rows.map(x=>x.action);
    for (const action of ['enable','disable','revoke','reconnect','binding_changed']) assert.ok(events.includes(action));
  } finally { await db.close(); }
});

test('real writer: revoke after fetch blocks persist; disable/re-enable rejects old revision; existing Health survives', async()=>{
  const db=await open();
  try {
    await consent(db,A,'enable'); const revision=await connect(db,A);
    const record=new GarminAdapter().normalize({provider:'garmin',provider_mode:'aggregator',ingestion_channel:'fitness_ai_connector',data_type:'sleep',calendar_date:'2026-10-12',timezone:'Europe/Madrid',retrieved_at:'2026-10-12T08:00:00Z',measurements:{sleep_score:{value:80,unit:'score'}}});
    const persist=()=>as(db,'service_role',null,()=>db.query('select ingest_owned_garmin_health_record($1,$2,$3::jsonb) as result',[A,revision,JSON.stringify(record)]));
    assert.equal((await persist()).rows[0].result.status,'inserted');
    await consent(db,A,'disable'); await consent(db,A,'enable');
    await assert.rejects(persist(),/sync_authorization_changed/);
    await consent(db,A,'revoke'); await assert.rejects(persist(),/sync_authorization_changed/);
    assert.equal((await db.query('select count(*)::int as n from wearable_health_imports')).rows[0].n,1);
  } finally {await db.close();}
});

test('batch SQL claims only consented verified due owners, bounds to five and advances due time',async()=>{
  const db=await open();
  try {
    for(let n=1;n<=8;n++) {
      const id=`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
      await db.query('insert into auth.users(id) values($1)',[id]);
      await consent(db,id,'enable'); if(n!==8) await connect(db,id);
      if(n===7) await consent(db,id,'revoke');
    }
    const claim=()=>as(db,'service_role',null,()=>db.query('select * from claim_garmin_sync_batch()'));
    const first=await claim(),second=await claim(),third=await claim();
    assert.equal(first.rows.length,5);assert.equal(second.rows.length,1);assert.equal(third.rows.length,0);
    assert.equal(new Set([...first.rows,...second.rows].map(x=>x.user_id)).size,6);
  } finally {await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolsDb, TOOL_USER_A as A, TOOL_USER_B as B, TOOL_NOW } from './support/enqiduToolsDb.mjs';
import { createGarminSourceForUser, readGarminSourceBinding, consentCheckedPersistence } from '../supabase/functions/_shared/garminSourceBinding.js';
import { FitnessAiServerTransportUnavailable } from '../src/health/fitnessAiServerTransport.js';
import { createGarminDailySyncHandler } from '../supabase/functions/_shared/garminDailySyncHandler.js';
import { runGarminSyncBatch } from '../supabase/functions/_shared/garminSyncBatch.js';
import { runMorningForOwner } from '../supabase/functions/_shared/autonomousMorningFlow.js';
import { loadGarminSyncStatus } from '../src/health/garminSyncStatus.js';
const row = (user_id=A, patch={})=>({user_id,provider:'garmin',consent_status:'active',consent_version:'garmin_daily_v1',connection_status:'connected',connected_at:TOOL_NOW,revoked_at:null,binding_verified_at:TOOL_NOW,binding_revision:1,...patch});
function fixture(rows=[row()]) { const f=createToolsDb();f.tables.user_wearable_connections=rows;return f; }

test('unavailable transport never attempts remote access',async()=>{
  assert.equal(FitnessAiServerTransportUnavailable.runtimeAvailable,false);
  await assert.rejects(new FitnessAiServerTransportUnavailable().getHealthSummary(),{code:'connector_runtime_unavailable'});
  const f=fixture(),binding=await createGarminSourceForUser({db:f.db})(A);
  await assert.rejects(binding.source.getHealthRecords({from_date:'2026-10-05',to_date:'2026-10-05',timezone:'Europe/Madrid'}),{code:'connector_runtime_unavailable'});
});
test('binding ignores another owner, rejects legacy client-managed connections and rechecks revocation per fetch',async()=>{
  for(const [rows,code] of [[[row(B)],'consent_missing'],[[row(A,{consent_status:'pending_consent'})],'consent_missing'],[[row(A,{consent_status:'revoked'})],'consent_revoked'],[[row(A,{binding_verified_at:null})],'binding_unverified'],[[row(A,{connection_status:'error'})],'connection_unavailable']])
    await assert.rejects(readGarminSourceBinding(fixture(rows).db,A),{code});
  const f=fixture();let calls=0;
  const binding=await createGarminSourceForUser({db:f.db,transportForBinding:async b=>{assert.equal(b.user_id,A);return {getHealthSummary:async()=>{calls++;return {data_status:'no_data'};}};}})(A);
  f.tables.user_wearable_connections[0].consent_status='revoked';
  await assert.rejects(binding.source.getHealthRecords({}),{code:'consent_revoked'});assert.equal(calls,0);
  await assert.rejects(consentCheckedPersistence({rpc:()=>assert.fail()},binding).rpc('arbitrary_rpc',{p_user_id:A}),{code:'sync_authorization_changed'});
});
test('manual and scheduler auth are disjoint; requests cannot choose identities, transport or dates',async()=>{
  const f=fixture();let privileged=0;
  const secret='s'.repeat(40);
  const handler=createGarminDailySyncHandler({createReadDb:()=>f.db,createServiceDb:()=>{privileged++;throw Error('SECRET');},sourceForUser:async()=>assert.fail(),schedulerSecret:secret});
  const req=(body={},headers={Authorization:'Bearer user'},search='')=>new Request(`http://local/sync${search}`,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await handler(req({},{}))).status,401);
  for(const headers of [{'X-ENQIDU-Scheduler-Secret':'wrong'},{Authorization:'Bearer user','X-ENQIDU-Scheduler-Secret':secret}]) assert.equal((await handler(req({},headers))).status,401);
  for(const key of ['user_id','userId','garmin_user_id','token','endpoint','provider','rpc','date','timezone']) assert.equal((await handler(req({[key]:'evil'}))).status,400);
  assert.equal((await handler(req({},undefined,'?user_id=other'))).status,400);
  assert.equal((await handler(req({}, {'X-ENQIDU-Scheduler-Secret':secret}))).status,503);
  assert.equal((await handler(req())).status,503);assert.equal(privileged,0);
  f.tables.user_wearable_connections[0].consent_status='revoked';
  const revoked=await handler(req());assert.equal(revoked.status,403);assert.equal((await revoked.json()).error,'consent_revoked');
});
test('manual success uses only the authenticated owner and consent-checked writer; brief never returned',async()=>{
  const f=fixture();const owners=[];
  const sourceForUser=createGarminSourceForUser({db:f.db,transportForBinding:binding=>{owners.push(binding.user_id);return {getHealthSummary:async()=>({data_status:'no_data'})};}});
  const handler=createGarminDailySyncHandler({createReadDb:()=>f.db,createServiceDb:()=>({rpc:()=>assert.fail('no records')}),sourceForUser,runtimeAvailable:true,now:()=>new Date(TOOL_NOW)});
  const result=await handler(new Request('http://local/sync',{method:'POST',headers:{Authorization:'Bearer user'},body:'{}'}));
  assert.equal(result.status,200);assert.deepEqual(owners,[A]);assert.doesNotMatch(JSON.stringify(await result.json()),/brief|FOREIGN_SECRET|authenticated_user_id/);
});
test('batch isolates errors, never emits owners or biometrics, uses only DB claimed owners',async()=>{
  const visited=[];
  const report=await runGarminSyncBatch({serviceDb:{rpc:async name=>{assert.equal(name,'claim_garmin_sync_batch');return {data:[{user_id:A},{user_id:B}]};}},runForOwner:async({userId,days})=>{visited.push(userId);assert.equal(days,2);if(userId===A)throw Error('PRIVATE_HEALTH_STACK');return {ingestion:{failed:0,warnings:[]},brief:{sleep_score:80},applied:false};}});
  assert.deepEqual(visited,[A,B]);assert.equal(report.succeeded,1);assert.equal(report.failed,1);assert.equal(report.applied,false);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE_HEALTH_STACK|sleep_score|11111111|22222222/);
  await assert.rejects(runGarminSyncBatch({serviceDb:{rpc:async()=>({data:Array(6).fill({user_id:A})})}}));
});
test('scheduler owner resolves profile timezone without a human JWT and cannot accept an unbound source',async()=>{
  const f=fixture([row(B)]);f.db.auth.getUser=()=>assert.fail('scheduler must not impersonate a user');
  const dates=[];
  const binding={...row(B),source:{getHealthRecords:async input=>{dates.push(input);return {records:[],next_cursor:null};}}};
  const result=await runMorningForOwner({readDb:f.db,serviceDb:f.db,userId:B,sourceForUser:async()=>binding,now:'2026-10-05T01:00:00Z'});
  assert.deepEqual(dates.map(x=>x.from_date),['2026-10-03','2026-10-04']);assert.ok(dates.every(x=>x.timezone==='America/Los_Angeles'));assert.equal(result.applied,false);
  await assert.rejects(runMorningForOwner({readDb:f.db,userId:A,sourceForUser:async()=>binding}),{code:'binding_unverified'});
});
test('status distinguishes consent from operational availability and never returns binding internals',async()=>{
  const f=fixture();const status=await loadGarminSyncStatus(f.db,A);
  assert.equal(status.sync_enabled,true);assert.equal(status.runtime_available,false);assert.equal(status.scheduler_status,'blocked_runtime');
  assert.doesNotMatch(JSON.stringify(status),/binding_revision|external_user_reference|user_id/);
  assert.equal((await loadGarminSyncStatus(f.db,B)).consent_status,'not_configured');
});

test('deadline cancels a hanging source and no late source result can initiate persistence',async()=>{
  const f=fixture();const controller=new AbortController();let release,entered;
  const started=new Promise(resolve=>{entered=resolve;});let writes=0;
  const binding={...row(),source:{getHealthRecords:()=>{entered();return new Promise(resolve=>{release=resolve;});}}};
  const pending=runMorningForOwner({readDb:f.db,serviceDb:{rpc:async()=>{writes++;}},userId:A,sourceForUser:async()=>binding,now:TOOL_NOW,signal:controller.signal});
  await started;controller.abort();
  const result=await pending;
  assert.ok(result.ingestion.warnings.includes('sync_deadline_exceeded'));
  release({records:[{private:'late data'}],next_cursor:null});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0);
});

test('production wrapper refuses invalid profile timezone before requesting or persisting health',async()=>{
  const f=fixture();f.tables.profiles[0].timezone='invalid/zone';let requests=0;
  await assert.rejects(runMorningForOwner({readDb:f.db,serviceDb:f.db,userId:A,sourceForUser:async()=>({...row(),source:{getHealthRecords:()=>{requests++;}}}),now:TOOL_NOW}),{code:'profile_timezone_required'});
  assert.equal(requests,0);
});

test('Supabase Deno window alias can resolve consent and persist, but a browser DOM cannot',async()=>{
  const original={window:globalThis.window,Deno:globalThis.Deno,document:globalThis.document};
  globalThis.window=globalThis;globalThis.Deno={version:{deno:'supabase-edge-runtime-1.77.4'}};
  try {
    const f=fixture();let writes=0;
    assert.equal((await readGarminSourceBinding(f.db,A)).user_id,A);
    const source={getHealthRecords:async({from_date,timezone})=>({next_cursor:null,records:from_date==='2026-10-05'?[{provider:'garmin',provider_mode:'aggregator',ingestion_channel:'fitness_ai_connector',data_type:'sleep',calendar_date:from_date,timezone,retrieved_at:TOOL_NOW,measurements:{sleep_score:{value:80,unit:'score'}}}]:[]})};
    const result=await runMorningForOwner({readDb:f.db,serviceDb:{rpc:async name=>{assert.equal(name,'ingest_owned_garmin_health_record');writes++;return {data:{status:'inserted'}};}},userId:A,sourceForUser:async()=>({...row(),source}),now:TOOL_NOW});
    assert.equal(writes,1);assert.equal(result.ingestion.failed,0);assert.equal(result.ingestion.inserted,1);
    globalThis.document={};
    await assert.rejects(readGarminSourceBinding(f.db,A),{code:'server_only'});
  } finally {for(const [key,value] of Object.entries(original)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

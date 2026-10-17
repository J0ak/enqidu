import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, insert, migration } from './helpers/reconciliation-db.mjs';
let db;
before(async()=>{
 db=await database({install:false});
 for(const table of ['training_sessions','training_sources','session_source_links','session_blocks','session_exercises']){
   const baseline=(await db.query("select has_table_privilege('service_role',$1,'SELECT') r",[table])).rows[0].r;
   assert.equal(baseline,false,`${table}: production baseline must not mask missing grants`);
 }
 assert.equal((await db.query("select has_table_privilege('service_role','planned_training_sessions','UPDATE') r")).rows[0].r,false);
 await db.exec(migration);
});
after(async()=>{await db?.close();});
const DAY='2026-10-14';
const payload={session_date:DAY,garmin_matching_hint:{activity_id:'1234',start_time_local:'2026-10-14T07:03:55+02:00',activity_type:'HIIT',duration_s:3632},blocks:[{type:'strength',rounds:3,rest_seconds:30,exercises:[{name:'Press',load_value:12,load_unit:'kg',reps_per_set:[6,7,8],sets_completed:3,tempo:'3-1-1',notes:'Modificado'}]}]};
async function user(){const id=randomUUID(); await insert(db,'auth.users',{id}); await insert(db,'profiles',{id,timezone:'Europe/Madrid'});return id;}
async function fit(u,patch={}) {
 const source=randomUUID(),id=randomUUID();
 await insert(db,'training_sources',{id:source,user_id:u,source_type:'garmin_fit',source_name:'FIT',original_json:{innerFitName:'1234_ACTIVITY.fit'}});
 await insert(db,'training_sessions',{id,user_id:u,source_id:source,session_kind:'completed',session_status:'completed',local_date:DAY,started_at:'2026-10-14T05:03:55Z',duration_seconds:3632,session_structure:{garmin_fit_summary:{sport:'62',sub_sport:'generic',heart_rate:{avg_bpm:107}}},...patch});
 await insert(db,'session_source_links',{session_id:id,source_id:source,source_role:'garmin_fit',is_primary:true});
 return id;
}
async function coach(u,p=payload){const id=randomUUID();await insert(db,'training_sources',{id,user_id:u,source_type:'manual_entry',source_name:'Coach',original_json:p});return id;}
async function plan(u,patch={}){const id=randomUUID();await insert(db,'planned_training_sessions',{id,user_id:u,title:'Intent',session_type:'hybrid',planned_date:DAY,planned_time:'07:03:55',planned_duration_min:50,planned_duration_max:70,...patch});return id;}
async function run(u,dry=false){return (await db.query('select public.reconcile_training_day_v1($1,$2,$3) r',[u,DAY,dry])).rows[0].r;}
async function state(id){return (await db.query(`select jsonb_build_object('session',(select to_jsonb(s) from training_sessions s where id=$1),'blocks',(select coalesce(jsonb_agg(to_jsonb(b) order by block_order),'[]') from session_blocks b where session_id=$1),'exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by exercise_order),'[]') from session_exercises e where session_id=$1),'links',(select jsonb_agg(to_jsonb(l) order by source_id) from session_source_links l where session_id=$1)) r`,[id])).rows[0].r;}
for(const order of [['plan','fit','coach'],['plan','coach','fit'],['fit','coach','plan']]) test(`arrival ${order.join(' -> ')} converges; FIT preserved; retry creates nothing`,async()=>{
 const u=await user();let id,p;
 for(const action of order){if(action==='plan')p=await plan(u); if(action==='fit')id=await fit(u);if(action==='coach')await coach(u);await run(u);}
 const before=await state(id);assert.equal(before.blocks.length,1);assert.equal(before.exercises.length,1);
 assert.equal(before.session.duration_seconds,3632);assert.deepEqual(before.session.session_structure.garmin_fit_summary.heart_rate,{avg_bpm:107});
 assert.deepEqual(before.exercises[0].reps_per_set,[6,7,8]);assert.equal(before.exercises[0].tempo_or_pause,'3-1-1');assert.equal(before.exercises[0].load_value,12);
 assert.equal(before.blocks[0].prescription.rest_seconds,30);assert.equal(before.links.length,2);
 assert.equal((await db.query('select linked_completed_session_id from planned_training_sessions where id=$1',[p])).rows[0].linked_completed_session_id,id);
 const result=await run(u);assert.ok(result.decisions.every(d=>d.outcome==='already_reconciled'));assert.deepEqual(await state(id),before);
});
test('ambiguous physical sessions do not merge; different tenant cannot match',async()=>{
 const u=await user(),other=await user();await coach(u);await fit(other);assert.equal((await run(u,true)).decisions[0].outcome,'skipped');
 await fit(u);await fit(u);const r=await run(u);assert.equal(r.decisions[0].outcome,'ambiguous');
 assert.equal((await db.query('select count(*)::int n from training_reconciliation_events where user_id=$1',[u])).rows[0].n,0);
});
test('same-day Upper and Pilates are two activities; only strength plan links',async()=>{
 const u=await user();const strength=await fit(u,{duration_seconds:3000,session_structure:{garmin_fit_summary:{sport:'training',sub_sport:'strength_training'}}});
 const yoga=await fit(u,{duration_seconds:3000,session_structure:{garmin_fit_summary:{sport:'fitness_equipment',sub_sport:'pilates'}}});
 const p=await plan(u,{session_type:'strength',planned_duration_min:45,planned_duration_max:55});
 assert.equal((await db.query('select linked_completed_session_id id from planned_training_sessions where id=$1',[p])).rows[0].id,strength);
 assert.notEqual(strength,yoga);assert.equal((await state(yoga)).blocks.length,0);
});
test('plan ambiguity is reciprocal and writes neither link',async()=>{
 const u=await user();await plan(u);await plan(u);await fit(u);const r=await run(u);
 assert.equal(r.decisions.filter(d=>d.outcome==='ambiguous').length,2);
 assert.equal((await db.query('select count(*)::int n from planned_training_sessions where user_id=$1 and linked_completed_session_id is not null',[u])).rows[0].n,0);
});
test('contradictory activity ID, modality, duration or date fails closed',async()=>{
 for(const patch of [{activity_id:'other'},{activity_type:'YOGA'},{duration_s:500},{start_time_local:'2026-10-15T07:03:55+02:00'}]){
 const u=await user();await fit(u);await coach(u,{...payload,garmin_matching_hint:{...payload.garmin_matching_hint,...patch}});assert.equal((await run(u,true)).decisions[0].outcome,'skipped');
 }
});
test('unknown plan or unsupported semantics preserves source without fabrication',async()=>{
 const u=await user(),id=await fit(u);await coach(u,{...payload,blocks:undefined});
 const r=await run(u,true);assert.equal(r.decisions[0].reason,'unsupported_semantic_shape_preserved');assert.equal((await state(id)).blocks.length,0);
});
test('service RPCs deny authenticated and anonymous callers',async()=>{
 const u=await user();
 for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`);await assert.rejects(run(u),/permission denied/);await db.exec('reset role');
 }
});
test('golden structure is untouched and existing source link wins on retry',async()=>{
 for(const [title,blocksCount,exercisesCount] of [['Armadura técnica – Core, glúteo y hombro',5,21],['Aconcagua 07/10',6,14]]) {
 const u=await user(),id=await fit(u,{title});
 for(let i=0;i<blocksCount;i++)await insert(db,'session_blocks',{session_id:id,block_order:i+1,block_type:'other',name:'Existing'});
 for(let i=0;i<exercisesCount;i++)await insert(db,'session_exercises',{session_id:id,exercise_order:i+1,reported_name:'Existing'});
 const s=await coach(u);await insert(db,'session_source_links',{session_id:id,source_id:s,source_role:'manual_description',is_primary:false});
 const old=await state(id);await run(u);assert.deepEqual(await state(id),old);
 }
});
test('dry-run has no writes; audit rollback restores only its rows; retry safe',async()=>{
 const u=await user();await coach(u);const id=await fit(u);const old=await state(id);
 const dry=await run(u,true);assert.equal(dry.decisions[0].outcome,'matched');assert.deepEqual(await state(id),old);
 await run(u);const ev=(await db.query('select id from training_reconciliation_events where user_id=$1',[u])).rows[0];
 await db.query('select public.rollback_training_reconciliation_v1($1)',[ev.id]);assert.deepEqual(await state(id),old);
 await db.query('select public.rollback_training_reconciliation_v1($1)',[ev.id]);
});
test('rollback rejects semantic edits made after reconciliation',async()=>{
 const u=await user();await coach(u);const id=await fit(u);await run(u);
 await db.query("update session_exercises set notes='User correction' where session_id=$1",[id]);
 const ev=(await db.query('select id from training_reconciliation_events where user_id=$1',[u])).rows[0];
 await assert.rejects(db.query('select public.rollback_training_reconciliation_v1($1)',[ev.id]),/changed since/);
});

test('event adapters handle Coach before FIT completion and late plan without frontend reconciliation',async()=>{
 const u=await user();await coach(u);const id=await fit(u);
 assert.equal((await state(id)).blocks.length,0);
 await insert(db,'wearable_activity_imports',{user_id:u,provider:'garmin',external_activity_id:'test',session_id:id,processing_status:'persisted'});
 assert.equal((await state(id)).blocks.length,1);
 const p=await plan(u);
 assert.equal((await db.query('select linked_completed_session_id id from planned_training_sessions where id=$1',[p])).rows[0].id,id);
});
test('event adapter rejects foreign JWT scope even for a privileged insert',async()=>{
 const a=await user(),b=await user();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 await assert.rejects(coach(b),/Foreign reconciliation scope/);
 await db.query("select set_config('request.jwt.claim.sub','',false)");
});
test('Trainer adds only supporting provenance, never physiology or duplicate exercises',async()=>{
 const u=await user(),id=await fit(u);await coach(u);const before=await state(id);
 await coach(u,{...payload,semantic_role:'trainer_evidence',blocks:undefined,video_note:'Técnica revisada'});
 const after=await state(id);assert.deepEqual(after.session,before.session);assert.deepEqual(after.exercises,before.exercises);
 assert.equal(after.links.filter(l=>l.source_role==='supporting').length,1);
});
test('transaction failure rolls back all inserted blocks, exercises and links',async()=>{
 const u=await user();await coach(u);const id=await fit(u);const before=await state(id);
 await db.exec(`create function fail_test_event() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$; create trigger fail_test_event before insert on training_reconciliation_events for each row execute function fail_test_event();`);
 await assert.rejects(run(u),/injected failure/);assert.deepEqual(await state(id),before);
 await db.exec('drop trigger fail_test_event on training_reconciliation_events; drop function fail_test_event();');
});
test('authenticated semantic capture scopes to JWT, preserves source on retry and cannot create a session',async()=>{
 const u=await user(),other=await user(),id=await fit(u),foreign=await fit(other);
 await db.exec('grant select on training_sessions,training_sources,profiles,session_source_links to authenticated; grant insert on training_sources to authenticated;');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select capture_training_semantics_v1($1,$2)',[foreign,JSON.stringify(payload)]),/Owned session required/);
 const first=(await db.query('select capture_training_semantics_v1($1,$2) r',[id,JSON.stringify(payload)])).rows[0].r;
 const again=(await db.query('select capture_training_semantics_v1($1,$2) r',[id,JSON.stringify(payload)])).rows[0].r;
 assert.deepEqual(again,first);assert.equal(first.reconciled,true);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");
 assert.equal((await state(id)).exercises.length,1);
});
test('date, modality and duration alone cannot silently link a plan without an anchor',async()=>{
 const u=await user();await fit(u);const p=await plan(u,{planned_time:null});
 const decision=(await run(u,true)).decisions.find(d=>d.entity_id===p);
 assert.equal(decision.outcome,'skipped');assert.equal(decision.reason,'no_execution_with_sufficient_plan_anchor');
});
test('explicit planned_session_id from the matched source links a plan without scheduled time',async()=>{
 const u=await user();const p=await plan(u,{planned_time:null});const id=await fit(u);
 await coach(u,{...payload,planned_session_id:p});
 assert.equal((await db.query('select linked_completed_session_id id from planned_training_sessions where id=$1',[p])).rows[0].id,id);
});
if(process.env.ENQIDU_RECONCILIATION_PG_URL)test('real PostgreSQL concurrent retries serialize at the athlete lock',async()=>{
 const {default:pg}=await import('pg');
 const second=new pg.Client({connectionString:process.env.ENQIDU_RECONCILIATION_PG_URL});await second.connect();
 const u=await user();await coach(u);const id=await fit(u);
 await db.exec('begin');
 try{
   await run(u);
   const pid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
   const pending=second.query('select reconcile_training_day_v1($1,$2,false) r',[u,DAY]);
   const deadline=Date.now()+5000;let blocked=false;
   while(Date.now()<deadline){
     blocked=(await db.query('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;
     if(blocked)break;
     await new Promise(resolve=>setTimeout(resolve,5));
   }
   assert.equal(blocked,true,'second connection must wait on the real transaction lock');
   await db.exec('commit');
   const result=await pending;assert.equal(result.rows[0].r.decisions[0].outcome,'already_reconciled');
   assert.equal((await state(id)).exercises.length,1);
 }finally{await db.exec('rollback');await second.end();}
});
test('legacy capture bypasses cannot create another activity through any API role',async()=>{
 for(const role of ['anon','authenticated','service_role']){
 const result=await db.query("select has_function_privilege($1,'public.chatgpt_pilot_apply_capture(jsonb)','EXECUTE') legacy,has_function_privilege($1,'public.persist_conversation_enrichment(uuid,jsonb,jsonb)','EXECUTE') enrichment",[role]);
 assert.deepEqual(result.rows[0],{legacy:false,enrichment:false});
 }
});


test('service_role invoker dry-run, apply, rollback restores state and retries are idempotent',async()=>{
 // Seed before FIT exists so adapters cannot pre-reconcile using their owner privileges.
 const u=await user(),p=await plan(u);await coach(u);const id=await fit(u);
 const original=await state(id);
 const planState=async()=>(await db.query('select to_jsonb(p) r from planned_training_sessions p where id=$1',[p])).rows[0].r;
 const originalPlan=await planState();
 const events=async()=>(await db.query('select id from training_reconciliation_events where user_id=$1 order by created_at desc,id',[u])).rows;
 await db.exec('set role service_role');
 try {
   assert.equal((await db.query('select current_user r')).rows[0].r,'service_role');
   for(const table of ['session_blocks','session_exercises','session_source_links']){
     assert.equal((await db.query("select has_any_column_privilege(current_user,$1,'UPDATE') r",[table])).rows[0].r,false);
   }
   const functions=await db.query("select prosecdef from pg_proc where oid in ('public.reconcile_training_day_v1(uuid,date,boolean)'::regprocedure,'public.rollback_training_reconciliation_v1(uuid)'::regprocedure)");
   assert.deepEqual(functions.rows,[{prosecdef:false},{prosecdef:false}]);
   const dry=await run(u,true);
   assert.equal(dry.decisions.filter(d=>d.outcome==='matched').length,2);
   assert.deepEqual(await state(id),original);assert.deepEqual(await planState(),originalPlan);assert.equal((await events()).length,0);
   await run(u);
   const applied=await state(id);assert.equal(applied.blocks.length,1);assert.equal(applied.exercises.length,1);assert.equal(applied.links.length,2);
   assert.deepEqual(applied.session,original.session);assert.equal((await planState()).linked_completed_session_id,id);
   const appliedEvents=await events();assert.equal(appliedEvents.length,2);
   await run(u);assert.deepEqual(await state(id),applied);assert.deepEqual(await events(),appliedEvents);
   for(const event of appliedEvents)await db.query('select rollback_training_reconciliation_v1($1)',[event.id]);
   assert.deepEqual(await state(id),original);assert.deepEqual(await planState(),originalPlan);
   for(const event of appliedEvents){
     const retry=(await db.query('select rollback_training_reconciliation_v1($1) r',[event.id])).rows[0].r;
     assert.equal(retry.already_rolled_back,true);
   }
   assert.deepEqual(await state(id),original);assert.deepEqual(await planState(),originalPlan);
   await run(u);const reapplied=await state(id);assert.equal(reapplied.exercises.length,1);assert.equal(reapplied.links.length,2);
   await run(u);assert.deepEqual(await state(id),reapplied);assert.equal((await events()).length,4);
 } finally {await db.exec('reset role');}
});

async function asService(action){
 await db.exec('set role service_role');
 try{return await action();}finally{await db.exec('reset role');}
}
async function rollbackFixture(){
 const u=await user(),p=await plan(u);
 await coach(u,{...payload,blocks:[...payload.blocks,{type:'strength',exercises:[{name:'Row',reps:8}]}]});
 const id=await fit(u);await asService(()=>run(u));
 const events=(await db.query('select * from training_reconciliation_events where user_id=$1',[u])).rows;
 return {u,p,id,source:events.find(e=>e.source_id),plan:events.find(e=>e.plan_id)};
}
for(const kind of ['exercise','missing exercise','block','missing block','extra exercise','source link','plan'])test(`service_role rollback rejects changed ${kind} and restores every earlier delete`,async()=>{
 const f=await rollbackFixture();
 if(kind==='exercise')await db.query("update session_exercises set notes='Later edit' where id=(select id from session_exercises where session_id=$1 order by exercise_order limit 1)",[f.id]);
 if(kind==='missing exercise')await db.query('delete from session_exercises where id=(select id from session_exercises where session_id=$1 order by exercise_order limit 1)',[f.id]);
 if(kind==='block')await db.query("update session_blocks set name='Later edit' where session_id=$1",[f.id]);
 if(kind==='missing block'){
   const b=(await db.query('select id from session_blocks where session_id=$1 limit 1',[f.id])).rows[0].id;
   await db.query('delete from session_exercises where block_id=$1',[b]);await db.query('delete from session_blocks where id=$1',[b]);
 }
 if(kind==='extra exercise')await insert(db,'session_exercises',{session_id:f.id,block_id:f.source.after_state.blocks[0].id,exercise_order:99,reported_name:'Later addition'});
 if(kind==='source link')await db.query("update session_source_links set source_role='supporting' where session_id=$1 and source_id=$2",[f.id,f.source.source_id]);
 if(kind==='plan')await db.query('update planned_training_sessions set linked_completed_session_id=null where id=$1',[f.p]);
 const before=await state(f.id);
 const plans=(await db.query('select to_jsonb(p) r from planned_training_sessions p where id=$1',[f.p])).rows;
 const audit=(await db.query('select * from training_reconciliation_events where user_id=$1 order by id',[f.u])).rows;
 const event=kind==='plan'?f.plan:f.source;
 const message=kind==='plan'?/Plan changed since reconciliation/:kind==='source link'?/Source link changed since reconciliation/:/Semantics changed since reconciliation/;
 await asService(()=>assert.rejects(db.query('select rollback_training_reconciliation_v1($1)',[event.id]),message));
 assert.deepEqual(await state(f.id),before);
 assert.deepEqual((await db.query('select to_jsonb(p) r from planned_training_sessions p where id=$1',[f.p])).rows,plans);
 assert.deepEqual((await db.query('select * from training_reconciliation_events where user_id=$1 order by id',[f.u])).rows,audit);
});

const requiredGrants=[
 ...['training_sessions','training_sources','session_source_links','session_blocks','session_exercises','planned_training_sessions'].map(t=>[t,'SELECT',t==='session_exercises'?'apply':'dry-run']),
 ...['session_source_links','session_blocks','session_exercises'].map(t=>[t,'INSERT','apply']),
 ...['session_source_links','session_blocks','session_exercises'].map(t=>[t,'DELETE','rollback']),
 ['planned_training_sessions','UPDATE','apply'],
 ['planned_training_sessions','UPDATE','rollback'],
];
for(const [table,privilege,path] of requiredGrants)test(`service_role requires ${privilege} on ${table} for ${path}`,async()=>{
 let u,id,event;
 if(path==='rollback'){
   const f=await rollbackFixture();u=f.u;id=f.id;event=table==='planned_training_sessions'?f.plan:f.source;
 } else {u=await user();await plan(u);await coach(u);id=await fit(u);}
 const before=await state(id);
 const audit=(await db.query('select * from training_reconciliation_events where user_id=$1 order by id',[u])).rows;
 await db.exec(`revoke ${privilege} on public.${table} from service_role`);
 try {
   await asService(()=>assert.rejects(
     path==='rollback'?db.query('select rollback_training_reconciliation_v1($1)',[event.id]):run(u,path==='dry-run'),
     error=>error.code==='42501' && error.message.includes(table)
   ));
   assert.deepEqual(await state(id),before);
   assert.deepEqual((await db.query('select * from training_reconciliation_events where user_id=$1 order by id',[u])).rows,audit);
 } finally {await db.exec(`grant ${privilege} on public.${table} to service_role`);}
});

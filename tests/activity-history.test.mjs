import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivityPeriod, athleteToday, ACTIVITY_COLUMNS } from '../src/training/activityHistory.js';
import { readFileSync } from 'node:fs';
const userId='00000000-0000-4000-8000-000000000001';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function client(rows){
 const calls=[];
 return {calls,from(table){assert.equal(table,'training_sessions');let start,end,cursor,size,owner;
 const q={select(cols){assert.equal(cols,ACTIVITY_COLUMNS);return q;},eq(k,v){assert.equal(k,'user_id');owner=v;return q;},gte(k,v){start=v;return q;},lte(k,v){end=v;return q;},order(){return q;},limit(n){size=n;return q;},or(expression){if(expression.startsWith('local_date.lt.')){const m=expression.match(/local_date.lt.([^,]+),and\(local_date.eq.[^,]+,id.lt.([^\)]+)\)/);cursor={date:m[1],id:m[2]};}return q;},then(resolve){calls.push({start,end,cursor,size});return Promise.resolve({error:null,data:rows.filter(r=>r.user_id===owner&&r.local_date>=start&&r.local_date<=end&&(!cursor||r.local_date<cursor.date||r.local_date===cursor.date&&r.id<cursor.id)).sort((a,b)=>b.local_date.localeCompare(a.local_date)||b.id.localeCompare(a.id)).slice(0,size)}).then(resolve);}};return q;}};
}
for(const count of [100,101,213])test(`${count} activities: cursor crosses second page, total order and no duplicates`,async()=>{
 const rows=Array.from({length:count},(_,n)=>({id:id(n+1),user_id:userId,local_date:'2026-05-12'}));
 const db=client(rows.reverse());const result=await fetchActivityPeriod(db,{userId,start:'2026-05-01',end:'2026-05-31'});
 assert.equal(result.error,null);assert.equal(result.data.length,count);assert.equal(new Set(result.data.map(r=>r.id)).size,count);assert.ok(db.calls.length>=2);
 assert.equal(result.data[0].id,id(count));assert.equal(result.data.at(-1).id,id(1));
});
test('older months, future migrated April and tenant isolation',async()=>{
 const db=client([{id:id(1),user_id:userId,local_date:'2026-04-20'},{id:id(2),user_id:userId,local_date:'2026-05-12'},{id:id(3),user_id:id(99),local_date:'2026-04-20'}]);
 assert.deepEqual((await fetchActivityPeriod(db,{userId,start:'2026-04-01',end:'2026-04-30'})).data.map(r=>r.id),[id(1)]);
 assert.deepEqual((await fetchActivityPeriod(db,{userId,start:'2026-05-01',end:'2026-05-31'})).data.map(r=>r.id),[id(2)]);
});
test('Madrid today crosses UTC day and DST independently of browser timezone',()=>{
 for(const [instant,day] of [['2026-10-15T22:30:00Z',16],['2026-03-28T23:30:00Z',29]]){
 const today=athleteToday('Europe/Madrid',new Date(instant));assert.equal(today.getDate(),day);
 }
});
test('frontend uses the production status and no summary_metrics projection',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(main.includes('.select("payload, status, created_at")'));assert.ok(!main.includes('enrichment_status'));
 assert.ok(!ACTIVITY_COLUMNS.includes('summary_metrics'));
});
test('production lap read/write projection round-trips FIT precision without stale columns',async()=>{
 const {readLap,writeLap,LAP_COLUMNS}=await import('../src/training/lapSchema.js');
 const original={lap_index:2,duration_seconds:60.25,start_elapsed_seconds:10,end_elapsed_seconds:70.25,distance_meters:200,heart_rate_avg_bpm:123,raw_payload:{total_timer_time:60.25}};
 const saved=writeLap(id(1),original);assert.equal(saved.lap_order,2);assert.equal(saved.distance_m,200);assert.ok(!('lap_index' in saved));assert.ok(!LAP_COLUMNS.includes('distance_meters'));
 const read=readLap(saved);assert.equal(read.start_elapsed_seconds,10);assert.equal(read.end_elapsed_seconds,70.25);assert.equal(read.duration_seconds,60.25);assert.equal(read.raw_payload.total_timer_time,60.25);
});
test('browser ingress cannot issue reconciliation writes after capture or FIT persistence',()=>{
 for(const file of ['../src/main.jsx','../src/services/conversationEnrichmentService.ts']){
 const code=readFileSync(new URL(file,import.meta.url),'utf8');assert.ok(!code.includes('reconcileSessionTemporalBlocks'));
 }
});

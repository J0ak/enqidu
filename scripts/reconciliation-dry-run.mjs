// Offline only: input is an explicit read-only production snapshot, never credentials.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { database, insert, migration } from '../tests/helpers/reconciliation-db.mjs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node scripts/reconciliation-dry-run.mjs snapshot.json report.json');
const snapshot = JSON.parse(readFileSync(input,'utf8'));
const db = await database({ install: false });
for(const p of snapshot.profiles) await insert(db,'auth.users',{id:p.id});
for(const table of ['profiles','training_sources','training_sessions','planned_training_sessions','session_source_links','session_blocks','session_exercises']) {
 for(const row of snapshot[table] || []) await insert(db,table,row);
}
await db.exec(migration);
const report=[];
for(const p of snapshot.profiles) {
 const days=[...new Set(['2026-07-21',...snapshot.training_sessions.filter(s=>s.user_id===p.id && s.local_date>='2026-10-07').map(s=>s.local_date)])].sort();
 for(const day of days) {
 const {rows}=await db.query('select public.reconcile_training_day_v1($1,$2,true) report',[p.id,day]);
 report.push(rows[0].report);
 }
}
// Apply ONLY to the disposable in-memory copy to verify real golden row integrity.
const before = (await db.query("select jsonb_agg(to_jsonb(s) order by id) data from training_sessions s")).rows[0].data;
const goldenIds = snapshot.training_sessions.filter(s=>['2026-07-21','2026-10-07'].includes(s.local_date)).map(s=>s.id);
const golden = async()=> (await db.query(`select jsonb_build_object('blocks',(select jsonb_agg(to_jsonb(b) order by id) from session_blocks b where session_id=any($1::uuid[])),'exercises',(select jsonb_agg(to_jsonb(e) order by id) from session_exercises e where session_id=any($1::uuid[])),'links',(select jsonb_agg(to_jsonb(l) order by source_id) from session_source_links l where session_id=any($1::uuid[]))) data`,[goldenIds])).rows[0].data;
const goldenBefore=await golden();
for(const r of report) await db.query('select public.reconcile_training_day_v1($1,$2,false)',[r.user_id,r.day]);
assert.deepEqual((await db.query("select jsonb_agg(to_jsonb(s) order by id) data from training_sessions s")).rows[0].data,before);
assert.deepEqual(await golden(),goldenBefore);
const applied = (await db.query("select reason, count(*)::int count from training_reconciliation_events group by reason order by reason")).rows;
for(const r of report) await db.query('select public.reconcile_training_day_v1($1,$2,false)',[r.user_id,r.day]);
assert.deepEqual((await db.query("select reason, count(*)::int count from training_reconciliation_events group by reason order by reason")).rows,applied);
const materialized_sessions=(await db.query(`select distinct ev.session_id,s.local_date,(select count(*)::int from session_blocks b where b.session_id=s.id) blocks,(select count(*)::int from session_exercises e where e.session_id=s.id) exercises from training_reconciliation_events ev join training_sessions s on s.id=ev.session_id where ev.source_id is not null order by s.local_date`)).rows;
const counts={candidate:report.flatMap(r=>r.decisions).length,matched:0,ambiguous:0,skipped:0,already_reconciled:0};
for(const d of report.flatMap(r=>r.decisions))counts[d.outcome]++;
writeFileSync(output,JSON.stringify({counts,local_verification:{materialized_sessions,golden_unchanged:true,all_training_sessions_unchanged:true,retry_unchanged:true,applied_in_disposable_copy:applied},generated_at:new Date().toISOString(),mode:'offline_dry_run_of_read_only_production_snapshot',production_writes:0,report},null,2)+'\n');
console.log(JSON.stringify(report.map(r=>({day:r.day,decisions:r.decisions})),null,2));
await db.close();

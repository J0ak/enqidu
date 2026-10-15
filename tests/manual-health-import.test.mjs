import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeManualHealthImport, manualHealthExample } from '../src/health/manualHealthImport.js';
import { createManualHealthImportHandler } from '../supabase/functions/_shared/manualHealthImportHandler.js';
import { openHealthDb, HEALTH_USER_A as A, HEALTH_USER_B as B } from './support/healthFoundationDb.mjs';
import { buildHealthEvidence } from '../src/health/healthEvidence.js';
import { buildDailyOperatingBrief } from '../src/dailyCoach/operatingBrief.js';
import { calculateReadiness } from '../src/health/readinessV1.js';
const NOW = '2026-10-14T12:00:00.000Z';
const options = { timezone: 'Europe/Madrid', retrievedAt: NOW };
const payload = (family = 'sleep', measurements = manualHealthExample.measurements) => ({ ...structuredClone(manualHealthExample), family, measurements });
const canonical = p => normalizeManualHealthImport(p, options);
const migration = await readFile(new URL('../supabase/migrations/20261014184601_manual_health_import_v1.sql', import.meta.url), 'utf8');
async function dbTest(run) { const db = await openHealthDb(); try { await db.exec("create table profiles(id uuid primary key,timezone text); grant select, update on profiles to service_role;"); await db.query("insert into profiles values ($1,'Europe/Madrid'),($2,'Europe/Madrid')",[A,B]); await db.exec(migration); await run(db); } finally { await db.close(); } }
async function apply(db, record, expected = null, user = A) {
  await db.exec('set role service_role');
  try { return (await db.query('select apply_manual_health_import($1,$2::jsonb,$3) result', [user, JSON.stringify(record), expected])).rows[0].result; }
  finally { await db.exec('reset role'); }
}
const revision = async db => (await db.query('select foundation_revision_hash from wearable_health_imports where user_id=$1', [A])).rows[0]?.foundation_revision_hash ?? null;

test('manual adapter: all supported families, zeros, missing and exact assisted provenance', () => {
  for (const [family, field, unit, value] of [['sleep','total_duration_seconds','s',0],['hrv','last_night_avg_ms','ms',0],['stress','average_stress_level','score',0],['body_battery','body_battery_current','score',0],['heart_rate','resting_heart_rate_bpm','bpm',55],['spo2','spo2_avg_pct','%',0],['respiration','respiration_avg_brpm','brpm',0],['daily_health','steps','count',0]]) {
    const record = canonical(payload(family, { [field]: { value, unit } }));
    assert.equal(record.metrics[field], value);
    assert.ok(Object.values(record.metrics).includes(null));
    assert.equal(record.timezone, 'Europe/Madrid');
    assert.equal(record.provenance.provider, 'garmin');
    assert.equal(record.provenance.provider_mode, 'assisted_capture');
    assert.equal(record.provenance.ingestion_channel, 'chatgpt_assisted_capture');
    assert.equal(record.evidence.raw.source_evidence.kind, 'garmin_connect_visible_summary');
  }
});
test('closed input rejects identity, SQL/RPC, secrets, arbitrary evidence, unknown fields and structures', () => {
  for (const key of ['user_id','sql','table','rpc','url','credentials','token','cookies','headers','timezone','provider','raw','__proto__']) {
    const p = JSON.parse(JSON.stringify(payload()));
    Object.defineProperty(p, key, { value: 'forbidden', enumerable: true });
    assert.throws(() => canonical(p));
  }
  assert.throws(() => canonical({ ...payload(), source_evidence: { kind: 'garmin_user_export', credentials: 'secret' } }));
  assert.throws(() => canonical(payload('sleep', { unknown: { value: 0, unit: 's' } })));
  assert.throws(() => canonical(payload('sleep', { sleep_score: { value: 10, unit: 'score', token: 'secret' } })));
  assert.throws(() => canonical(payload('sleep', { sleep_score: { value: '0', unit: 'score' } })));
  assert.throws(() => canonical({ ...payload(), family: 'vendor_insight' }));
  assert.throws(() => canonical({ ...payload(), observation_date: '2026-02-30' }));
  assert.throws(() => canonical({ ...payload(), captured_at: '2027-01-01T00:00:00Z' }));
  assert.throws(() => normalizeManualHealthImport(payload(), { ...options, timezone: null }));
  assert.throws(() => canonical({ ...payload(), extra: 'x'.repeat(17000) }), /payload_too_large/);
  let deep = {}; for(let i=0;i<8;i++) deep={nested:deep};
  assert.throws(() => canonical({ ...payload(), extra: deep }), /payload_depth/);
});

function harness({ service, current = null, userId = A, timezone = 'Europe/Madrid', clock = NOW } = {}) {
  const state = { writes: 0, identity: userId, timezone, current, clock };
  const db = {
    auth: { getUser: async () => ({ data: { user: state.identity ? { id: state.identity } : null } }) },
    from: table => { const filters = {}; const q = {
      select: () => q, eq: (key, value) => { filters[key] = value; return q; },
      maybeSingle: async () => {
        assert.equal(filters[table === 'profiles' ? 'id' : 'user_id'], state.identity);
        return { data: table === 'profiles' ? { timezone: state.timezone } : state.current, error: null };
      },
    }; return q; },
  };
  const handler = createManualHealthImportHandler({ createReadDb: () => db, createServiceDb: () => ({ rpc: async (name, args) => {
    state.writes++; assert.equal(name, 'apply_manual_health_import'); assert.equal(args.p_user_id, state.identity);
    return service ? service(name, args) : { data: { status: 'inserted' }, error: null };
  } }), signingSecret: 'synthetic-local-signing-key-32-characters', now: () => new Date(state.clock) });
  const request = async (body, auth = true) => { const response = await handler(new Request('http://localhost/manual-health-import', { method:'POST', headers:auth ? { Authorization:'Bearer local-test' } : {}, body: JSON.stringify(body) })); return { status: response.status, ...await response.json() }; };
  return { state, request };
}
test('HTTP preview never writes; apply requires exact confirmation and server auth', async () => {
  const h=harness(); const p=payload();
  assert.equal((await h.request({action:'preview_manual_health_import',payload:p},false)).status,401);
  const preview=await h.request({action:'preview_manual_health_import',payload:p});
  assert.equal(preview.ok,true); assert.equal(h.state.writes,0);
  const applyBody={action:'apply_manual_health_import',payload:p,preview_token:preview.preview_token};
  assert.equal((await h.request(applyBody)).error,'confirmation_required');
  assert.equal((await h.request({...applyBody,confirmation:true})).ok,true);
  assert.equal(h.state.writes,1);
});
test('signed preview binds user, timezone, exact payload and expiry; client identity rejected', async () => {
  const h=harness(); const p=payload();
  const preview=await h.request({action:'preview_manual_health_import',payload:p});
  const body={action:'apply_manual_health_import',payload:p,preview_token:preview.preview_token,confirmation:true};
  h.state.identity=B; assert.equal((await h.request(body)).error,'invalid_preview');
  h.state.identity=A; h.state.timezone='UTC'; assert.equal((await h.request(body)).error,'invalid_preview');
  h.state.timezone='Europe/Madrid'; assert.equal((await h.request({...body,payload:{...p,measurements:{sleep_score:{value:1,unit:'score'}}}})).error,'invalid_preview');
  assert.equal((await h.request({...body,user_id:B})).error,'invalid_request');
  h.state.clock='2026-10-14T12:16:00Z'; assert.equal((await h.request(body)).error,'invalid_preview');
  assert.equal(h.state.writes,0);
});
test('HTTP oversized request and credential fields fail without writes or value disclosure', async () => {
  const h=harness();
  assert.equal((await h.request({payload:'x'.repeat(21000)})).status,413);
  const result=await h.request({action:'preview_manual_health_import',payload:{...payload(),token:'SECRET_VALUE'}});
  assert.equal(result.error,'rejected_fields'); assert.ok(result.rejected_fields.includes('payload.token'));
  assert.equal(JSON.stringify(result).includes('SECRET_VALUE'),false); assert.equal(h.state.writes,0);
});
test('actual SQL: duplicate, correction, stale preview/capture, null withdrawal and tenant isolation',()=>dbTest(async db=>{
  const p=payload(); const record=canonical(p);
  const first=await apply(db,record); assert.equal(first.status,'inserted');
  assert.equal((await apply(db,record)).status,'unchanged');
  const expected=await revision(db);
  const corrected=canonical({...p,captured_at:'2026-10-14T09:00:00Z',measurements:{sleep_score:{value:0,unit:'score'}}});
  assert.equal((await apply(db,corrected,expected)).status,'updated');
  assert.equal((await apply(db,corrected,expected)).status,'unchanged');
  await assert.rejects(()=>apply(db,record,expected),e=>e.code==='40001');
  const latest=await revision(db);
  assert.equal((await apply(db,record,latest)).status,'ignored_stale');
  const rows=(await db.query('select user_id,sleep_score,total_duration_seconds from wearable_sleep_sessions')).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].user_id,A); assert.equal(Number(rows[0].sleep_score),0); assert.equal(rows[0].total_duration_seconds,null);
  await apply(db,record,null,B);
  assert.equal((await db.query('select count(*) n from wearable_sleep_sessions')).rows[0].n,2);
  await db.exec("set role authenticated");
  await assert.rejects(()=>db.query('select apply_manual_health_import($1,$2,null)',[B,JSON.stringify(record)]),e=>e.code==='42501');
  await db.exec('reset role');
}));
test('HTTP → actual Foundation → Health Evidence → Readiness; preview writes nothing',()=>dbTest(async db=>{
  const h=harness({service:async(_,{p_user_id,p_record,p_expected_revision})=>{
    try{return {data:await apply(db,p_record,p_expected_revision,p_user_id),error:null};}catch(error){return {error};}
  }});
  for(const p of [payload(),payload('hrv',{last_night_avg_ms:{value:55,unit:'ms'}}),payload('daily_health',{resting_heart_rate_bpm:{value:55,unit:'bpm'},average_stress_level:{value:0,unit:'score'},body_battery_current:{value:80,unit:'score'}})]){
    const before=(await db.query('select count(*) n from wearable_health_imports')).rows[0].n;
    const preview=await h.request({action:'preview_manual_health_import',payload:p});
    assert.equal((await db.query('select count(*) n from wearable_health_imports')).rows[0].n,before);
    assert.equal((await h.request({action:'apply_manual_health_import',payload:p,confirmation:true,preview_token:preview.preview_token})).ok,true);
  }
  const records={daily:(await db.query('select * from wearable_health_daily')).rows,sleep:(await db.query('select * from wearable_sleep_sessions')).rows,hrv:(await db.query('select * from wearable_hrv_nightly_summaries')).rows};
  // pg/PGlite date/numeric formats are normalized as PostgREST does.
  for(const rows of Object.values(records))for(const row of rows){row.calendar_date=(row.calendar_date instanceof Date ? row.calendar_date.toISOString() : String(row.calendar_date)).slice(0,10);for(const [k,v]of Object.entries(row))if(typeof v==='string'&&/^\d+(\.\d+)?$/.test(v))row[k]=Number(v);}
  const evidence=buildHealthEvidence({userId:A,calendarDate:'2026-10-14',timezone:'Europe/Madrid',generatedAt:NOW,records});
  assert.equal(evidence.sleep.duration_seconds,28800);
  assert.equal(evidence.stress.average,0);
  const readiness=calculateReadiness(evidence,[],{userId:A,generatedAt:NOW});
  assert.ok(Number.isFinite(readiness.score));
  assert.ok(readiness.factors.length >= 2);
  evidence.readiness=readiness;
  const brief=buildDailyOperatingBrief({morning:{date:'2026-10-14',timezone:'Europe/Madrid',recommendation:'KEEP'},health:evidence,days:[]});
  assert.equal(brief.readiness_score,readiness.score);
  assert.equal(brief.health_today.evidence.sleep.duration_seconds,28800);
  assert.equal(brief.llm_used,false);
  assert.doesNotMatch(migration, /insert into public.readiness_snapshots/i);
}));

test('exact assisted provenance cannot masquerade as official or aggregator in Health Evidence', async()=>{
  const {safeHealthProvenance}=await import('../src/health/healthEvidence.js');
  assert.equal(safeHealthProvenance({provider_mode:'official_api',ingestion_channel:'chatgpt_assisted_capture'}),null);
  assert.equal(safeHealthProvenance({provider_mode:'assisted_capture',ingestion_channel:'fitness_ai_connector'}),null);
});
test('migration extends only writer provenance; automatic transport, scheduler and MCP stay disabled',async()=>{
  const original=await readFile(new URL('../supabase/migrations/20261004134444_health_foundation_v1.sql',import.meta.url),'utf8');
  const body=sql=>sql.split('as $foundation$')[1].split('$foundation$;')[0];
  assert.equal(body(migration).replace("\n    or (v_mode = 'assisted_capture' and v_channel = 'chatgpt_assisted_capture')",''),body(original));
  const sync=await readFile(new URL('../supabase/functions/garmin-daily-sync/index.ts',import.meta.url),'utf8');
  assert.match(sync,/schedulerEnabled: false/);assert.match(sync,/FitnessAiServerTransportUnavailable.runtimeAvailable/);
  assert.doesNotMatch(migration,/^security definer/im);
});
test('SQL rejects equal-time conflicting correction, changed profile and nonmanual authority',()=>dbTest(async db=>{
  const p=payload();await apply(db,canonical(p));const expected=await revision(db);
  await assert.rejects(()=>apply(db,canonical({...p,measurements:{sleep_score:{value:1,unit:'score'}}}),expected),e=>e.code==='40001');
  await db.query("update profiles set timezone='UTC' where id=$1",[A]);
  await assert.rejects(()=>apply(db,canonical(p),expected),e=>e.code==='40001');
  await db.query("update profiles set timezone='Europe/Madrid' where id=$1",[A]);
  await db.query("update wearable_health_imports set ingestion_channel='garmin_health_api' where user_id=$1",[A]);
  await assert.rejects(()=>apply(db,canonical(p),expected),e=>e.code==='22023');
}));
test('migration retires browser legacy raw writes without removing owner reads',()=>dbTest(async db=>{
  await apply(db,canonical(payload()));
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
  await assert.rejects(()=>db.query("insert into wearable_provider_raw_payloads(user_id,provider,provider_mode,ingestion_channel,api_product,payload_type,raw_payload) values ($1,'garmin','assisted_capture','chatgpt_assisted_capture','ui_evidence','sleep','{}')",[A]),e=>e.code==='42501');
  assert.equal((await db.query('select count(*) n from wearable_sleep_sessions')).rows[0].n,1);
  await db.exec('reset role');
}));
test('profile IANA aliases remain server-owned and can be applied transactionally',()=>dbTest(async db=>{
  await db.query("update profiles set timezone='Etc/UTC' where id=$1",[A]);
  const record=normalizeManualHealthImport(payload(),{timezone:'Etc/UTC',retrievedAt:NOW});
  assert.equal(record.evidence.raw.profile_timezone,'Etc/UTC');
  assert.equal((await apply(db,record)).status,'inserted');
}));

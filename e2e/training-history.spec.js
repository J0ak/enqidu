import {test,expect} from '@playwright/test';
import {createToolsFixture,TOOLS_PASSWORD} from './tools-fixture.js';

test('Activities loads the second page and older months; one reconciled activity opens FIT and Coach detail',async({page})=>{
 test.setTimeout(180000);
 const f=await createToolsFixture('history',{health:false,plans:false});
 const own=await f.adminDb.from('training_sessions').insert(Array.from({length:105},(_,n)=>({user_id:f.user.id,title:`Mayo historial ${n+1}`,session_kind:'completed',session_status:'completed',local_date:'2026-05-12',started_at:'2026-05-12T08:00:00Z',duration_seconds:3600}))).select('id');
 expect(own.error).toBeNull();
 const source=(await f.insert('training_sources',{user_id:f.user.id,source_type:'garmin_fit',source_name:'FIT sintético',original_json:{innerFitName:'1234_ACTIVITY.fit'}}))[0];
 const session=(await f.insert('training_sessions',{user_id:f.user.id,source_id:source.id,title:'Híbrido canónico',session_kind:'completed',session_status:'completed',local_date:'2026-05-12',started_at:'2026-05-12T05:03:55Z',duration_seconds:3632,session_structure:{garmin_fit_summary:{sport:'62',sub_sport:'generic',heart_rate:{avg_bpm:107}}}}))[0];
 await f.insert('session_source_links',{session_id:session.id,source_id:source.id,source_role:'garmin_fit',is_primary:true});
 await f.insert('training_sources',{user_id:f.user.id,source_type:'manual_entry',source_name:'Coach sintético',original_json:{session_date:'2026-05-12',session_title:'Híbrido descrito',observations:{overall:'Técnica controlada'},garmin_matching_hint:{activity_id:'1234',start_time_local:'2026-05-12T07:03:55+02:00',activity_type:'HIIT',duration_s:3632},blocks:[{type:'strength',name:'Fuerza técnica',rounds:3,exercises:[{name:'Press confirmado',reps_per_set:[6,6,6],load_value:12,load_unit:'kg'}]}]}});
 const errors=[];page.on('response',r=>{if(r.url().includes('/rest/v1/')&&r.status()>=400)errors.push({url:r.url(),status:r.status()});});
 try {
 await page.goto('/#/profile');
 await page.getByPlaceholder('email').fill(f.email);await page.getByPlaceholder('password').fill(TOOLS_PASSWORD);await page.getByRole('button',{name:'Conectar',exact:true}).click();
 await page.locator('button.railButton[aria-label="Actividades"]').click();
 await page.getByRole('button',{name:'Mes',exact:true}).click();
 // The fixture is anchored in May; the browser timezone is deliberately Los Angeles.
 const [year,month]=f.date(0).split('-').map(Number);const monthNow=year*12+month-1;const target=2026*12+4;
 for(let i=monthNow;i>target;i--)await page.getByRole('button',{name:'Periodo anterior',exact:true}).click();
 const list=page.locator('.activityListPanel');
 await expect(list.getByText('Mayo historial 1',{exact:true})).toBeVisible();
 await expect(list.getByText('Mayo historial 105',{exact:true})).toBeVisible();
 await expect(list.getByText('Híbrido canónico',{exact:true})).toHaveCount(1);
 await list.getByText('Híbrido canónico',{exact:true}).click();
 await expect(page.getByText('Press confirmado',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Técnica controlada',{exact:true})).toBeVisible();
 expect(errors.filter(e=>/training_sessions|session_laps|enrichments|session_blocks|session_exercises|source_links|training_sources/.test(e.url))).toEqual([]);
 } finally {await f.adminDb.from('session_source_links').delete().eq('session_id',session.id);await f.dispose();}
});

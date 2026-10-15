import { test, expect } from '@playwright/test';
import { createToolsFixture, TOOLS_PASSWORD, toolsDate } from './tools-fixture.js';

const capture = (family, measurements, offset=0) => ({version:'enqidu.manual-health.v1',observation_date:toolsDate(),captured_at:new Date(Date.now()-60000+offset).toISOString(),family,source_evidence:{kind:'garmin_connect_visible_summary'},measurements});
test('manual capture: browser preview/confirmation → canonical evidence/readiness/Daily Coach, isolated from another user',async({page,request})=>{
  const a=await createToolsFixture('manual-a',{health:false,plans:false});
  const b=await createToolsFixture('manual-b',{health:false,plans:false});
  const call=async(body,owner=a)=>{const response=await request.post(`${owner.url}/functions/v1/manual-health-import`,{headers:owner.headers,data:body});return {status:response.status(),...await response.json()};};
  const importApi=async(p)=>{const preview=await call({action:'preview_manual_health_import',payload:p});expect(preview.ok).toBe(true);return call({action:'apply_manual_health_import',payload:p,confirmation:true,preview_token:preview.preview_token});};
  try {
    const unauthorized=await request.post(`${a.url}/functions/v1/manual-health-import`,{data:{}});expect(unauthorized.status()).toBe(401);
    const p=capture('sleep',{total_duration_seconds:{value:28800,unit:'s'},sleep_score:{value:80,unit:'score'}});
    const preview=await call({action:'preview_manual_health_import',payload:p});expect(preview.ok).toBe(true);
    expect((await call({action:'apply_manual_health_import',payload:p,confirmation:true,preview_token:preview.preview_token},b)).ok).not.toBe(true);
    expect((await a.db.from('wearable_health_imports').select('id')).data).toHaveLength(0);
    await page.goto('/#/profile');await page.getByRole('button',{name:'Perfil'}).click();
    await page.getByPlaceholder('email').fill(a.email);await page.getByPlaceholder('password').fill(TOOLS_PASSWORD);
    await page.getByRole('button',{name:'Conectar',exact:true}).click();await expect(page.getByText('Sesión iniciada.')).toBeVisible();
    await page.locator('button.railButton[aria-label="Salud"]').click();
    const region=page.getByRole('region',{name:'Importación manual de salud'});
    await region.getByLabel('JSON de salud').fill(JSON.stringify(p));
    await region.getByRole('button',{name:'Revisar importación'}).click();
    await expect(region.getByText('Revisa los datos',{exact:true})).toBeVisible();
    await expect(region.getByText(/Europe\/Madrid/)).toBeVisible();
    await expect(region.getByRole('button',{name:'Confirmar e importar'})).toBeDisabled();
    expect((await a.db.from('wearable_health_imports').select('id')).data).toHaveLength(0);
    await region.getByRole('checkbox').check();await region.getByRole('button',{name:'Confirmar e importar'}).click();
    await expect(region.getByText('Datos importados.',{exact:true})).toBeVisible();
    const saved=(await a.db.from('wearable_sleep_sessions').select('*')).data;
    expect(saved).toHaveLength(1);expect(saved[0].total_duration_seconds).toBe(28800);expect(saved[0].ingestion_channel).toBe('chatgpt_assisted_capture');
    expect((await importApi(p)).result.status).toBe('unchanged');
    expect((await importApi({...p,captured_at:new Date(Date.now()-30000).toISOString(),measurements:{sleep_score:{value:0,unit:'score'}}})).result.status).toBe('updated');
    expect((await importApi(p)).result.status).toBe('ignored_stale');
    expect((await a.db.from('wearable_sleep_sessions').select('sleep_score,total_duration_seconds')).data[0]).toEqual({sleep_score:0,total_duration_seconds:null});
    for(const [family,measurements] of [
      ['hrv',{last_night_avg_ms:{value:50,unit:'ms'}}],['stress',{average_stress_level:{value:0,unit:'score'}}],
      ['body_battery',{body_battery_current:{value:80,unit:'score'}}],['heart_rate',{resting_heart_rate_bpm:{value:55,unit:'bpm'}}],
      ['spo2',{spo2_avg_pct:{value:98,unit:'%'}}],['respiration',{respiration_avg_brpm:{value:14,unit:'brpm'}}],
    ])expect((await importApi(capture(family,measurements))).ok).toBe(true);
    const tool=async name=>{const response=await request.post(`${a.url}/functions/v1/enqidu-tools`,{headers:a.headers,data:{tool:name,arguments:{}}});const result=await response.json();expect(result.ok).toBe(true);return result.data;};
    const health=await tool('get_health_status');expect(health.sleep.sleep_score).toBe(0);expect(health.stress.average).toBe(0);expect(health.spo2.average).toBe(98);expect(health.respiration.average).toBe(14);
    expect(health.sleep.provenance.provider_mode).toBe('assisted_capture');
    const readiness=await tool('get_readiness');expect(readiness.score).not.toBeNull();
    const brief=await tool('get_daily_coach_operating_brief');expect(brief.readiness_score).not.toBeNull();expect(brief.health_today.evidence.stress.average).toBe(0);expect(brief.llm_used).toBe(false);
    await page.locator('button.railButton[aria-label="Coach"]').click();await expect(page.getByRole('region',{name:'Tu día con ENQIDU'}).getByText(/Readiness \d+\/100/)).toBeVisible();
    expect((await b.db.from('wearable_health_imports').select('id')).data).toHaveLength(0);
    expect((await b.db.from('wearable_sleep_sessions').select('id').eq('user_id',a.user.id)).data).toHaveLength(0);
  } finally {await a.dispose();await b.dispose();}
});

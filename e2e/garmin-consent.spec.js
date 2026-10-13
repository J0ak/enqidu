import { test, expect } from '@playwright/test';
import { createToolsFixture, TOOLS_PASSWORD } from './tools-fixture.js';
test('Health consent controls save explicit permission, disable and revoke without deleting Health',async({page,request})=>{
  const f=await createToolsFixture('garmin-consent');
  try {
    const before=await f.snapshot();
    await page.goto('/#/profile');
    await page.getByRole('button',{name:'Perfil'}).click();
    await page.getByPlaceholder('email').fill(f.email);
    await page.getByPlaceholder('password').fill(TOOLS_PASSWORD);
    await page.getByRole('button',{name:'Conectar',exact:true}).click();
    await expect(page.getByText('Sesión iniciada.')).toBeVisible();
    await page.locator('button.railButton[aria-label="Salud"]').click();
    const controls=page.getByRole('region',{name:'Sincronización Garmin'});
    await expect(controls.getByText('Sin configurar',{exact:true})).toBeVisible();
    await expect(controls.getByRole('button',{name:'Autorizar sincronización'})).toBeDisabled();
    await controls.getByRole('checkbox').check();
    await controls.getByRole('button',{name:'Autorizar sincronización'}).click();
    await expect(controls.getByText('Consentimiento concedido',{exact:true})).toBeVisible();
    await expect(controls.getByRole('button',{name:'Sincronizar ahora'})).toBeDisabled();
    await controls.getByRole('button',{name:'Desactivar',exact:true}).click();
    await expect(controls.getByText('Sincronización desactivada',{exact:true})).toBeVisible();
    const manual=await request.post(`${f.url}/functions/v1/garmin-daily-sync`,{headers:f.headers,data:{}});
    expect(manual.status()).toBe(403);expect((await manual.json()).error).toBe('consent_missing');
    await controls.getByRole('button',{name:'Revocar permiso'}).click();
    await expect(controls.getByText('Consentimiento revocado',{exact:true})).toBeVisible();
    await controls.getByRole('button',{name:'Volver a conectar'}).click();
    await expect(controls.getByText('Sincronización desactivada',{exact:true})).toBeVisible();
    const {data:events,error}=await f.db.from('garmin_sync_consent_events').select('action');
    expect(error).toBeNull();expect(events.map(x=>x.action)).toEqual(expect.arrayContaining(['enable','disable','revoke','reconnect']));
    expect(await f.snapshot()).toEqual(before);
  } finally {await f.dispose();}
});

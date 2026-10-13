import React, { useEffect, useRef, useState } from 'react';
import { loadGarminSyncStatus, GARMIN_CONSENT_VERSION } from '../health/garminSyncStatus.js';

const labels = { not_configured: 'Sin configurar', pending_consent: 'Sincronización desactivada', active: 'Consentimiento concedido', revoked: 'Consentimiento revocado', error: 'Estado no disponible' };
export default function GarminSyncConsent({ db }) {
  const generation = useRef(0);
  const [status, setStatus] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!db?.auth) return;
    let current = true;
    const refresh = async () => {
      const requestGeneration = ++generation.current;
      const auth = await db.auth.getUser();
      const next = auth.data?.user ? await loadGarminSyncStatus(db, auth.data.user.id) : null;
      if (current && requestGeneration === generation.current) { setStatus(next); setAccepted(false); }
    };
    refresh().catch(() => { if (current) setMessage('No se pudo consultar la conexión.'); });
    const { data } = db.auth.onAuthStateChange(() => { if (current) { generation.current++; setStatus(null); setAccepted(false); setBusy(false); setMessage(''); } setTimeout(() => refresh().catch(() => {}), 0); });
    return () => { current = false; generation.current++; data.subscription.unsubscribe(); };
  }, [db]);
  async function change(action) {
    const requestGeneration = generation.current;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await db.rpc('set_garmin_sync_consent', {
        p_action: action, p_consent_version: action === 'enable' ? GARMIN_CONSENT_VERSION : null,
      });
      if (requestGeneration !== generation.current) return;
      if (error) throw error;
      setStatus(data); setAccepted(false);
      setMessage(action === 'reconnect' ? 'Solicitud reiniciada. La conexión automática sigue sin estar disponible.' : 'Preferencia guardada.');
    } catch { if (requestGeneration === generation.current) setMessage('No se pudo guardar la preferencia. Vuelve a intentarlo.'); }
    finally { if (requestGeneration === generation.current) setBusy(false); }
  }
  async function sync() {
    const requestGeneration = generation.current;
    setBusy(true); setMessage('');
    try {
      const { error } = await db.functions.invoke('garmin-daily-sync', { body: {} });
      if (requestGeneration !== generation.current) return;
      setMessage(error ? 'No se pudo sincronizar. Revisa el estado de la conexión.' : 'Sincronización completada.');
    } catch { if (requestGeneration === generation.current) setMessage('No se pudo sincronizar.'); }
    finally { if (requestGeneration === generation.current) setBusy(false); }
  }
  return <section className="healthHero" aria-label="Sincronización Garmin">
    <div>
      <h3>Sincronización Garmin</h3>
      <p>{status ? labels[status.consent_status] || 'Estado no disponible' : 'Inicia sesión para gestionar tu consentimiento.'}</p>
      <p>La sincronización automática aún no está disponible. Tus datos de salud guardados se conservan.</p>
      {status && <>
        <label><input type="checkbox" checked={accepted} disabled={busy || status.consent_status === 'revoked'} onChange={event => setAccepted(event.target.checked)} />
          Autorizo a ENQIDU a consultar y guardar diariamente mis datos Garmin de hoy y ayer para Salud, Readiness y el resumen del Coach cuando la conexión esté disponible. Puedo desactivar o revocar este permiso. No autoriza cambios automáticos en mi plan.
        </label>
        <div className="healthTags">
          <button type="button" disabled={busy || !accepted || status.consent_status === 'revoked'} onClick={() => change('enable')}>Autorizar sincronización</button>
          <button type="button" disabled={busy || !status.sync_enabled} onClick={() => change('disable')}>Desactivar</button>
          <button type="button" disabled={busy || status.consent_status === 'revoked'} onClick={() => change('revoke')}>Revocar permiso</button>
          <button type="button" disabled={busy} onClick={() => change('reconnect')}>Volver a conectar</button>
          <button type="button" disabled={busy || !status.sync_enabled || !status.runtime_available} onClick={sync}>Sincronizar ahora</button>
        </div>
      </>}
      <p role="status">{message}</p>
    </div>
  </section>;
}

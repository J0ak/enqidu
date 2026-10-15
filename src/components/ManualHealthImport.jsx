import React, { useEffect, useState } from 'react';
import { manualHealthExample, MANUAL_HEALTH_MAX_BYTES } from '../health/manualHealthImport.js';

import { manualFamilyNames as familyNames, manualMetricPresentation } from '../health/manualHealthPresentation.js';
import { requestEnqiduTool } from '../services/enqiduToolsService';
const errors = {
  auth_required: 'Inicia sesión para importar.', invalid_user: 'Vuelve a iniciar sesión.',
  confirmation_required: 'Confirma que has revisado los datos.', stale_preview: 'Los datos han cambiado. Revisa un nuevo preview.',
  invalid_preview: 'El preview ha caducado o ha cambiado. Vuelve a revisar.',
  source_conflict: 'Esta fecha ya tiene otra fuente o una serie que esta captura no puede sustituir.',
  payload_too_large: 'El JSON supera el límite de 16 KiB.', profile_timezone_required: 'Configura tu zona horaria en el perfil.',
};
export default function ManualHealthImport({ db, onImported }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [rejected, setRejected] = useState([]);
  const [health, setHealth] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  useEffect(() => {
    let active = true;
    requestEnqiduTool({ tool: 'get_health_status', arguments: selectedDate ? { date: selectedDate } : {} }).then(result => {
      if (active) setHealth(result.ok ? result.data : null);
    });
    return () => { active = false; };
  }, [refresh, selectedDate]);
  const change = value => { setText(value); setPreview(null); setConfirmed(false); setNotice(''); setRejected([]); };
  async function run(apply) {
    setBusy(true); setNotice(''); setRejected([]);
    try {
      if (new TextEncoder().encode(text).length > MANUAL_HEALTH_MAX_BYTES) throw new Error(errors.payload_too_large);
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error('Introduce un JSON válido.'); }
      const { data, error } = await db.functions.invoke('manual-health-import', { body: {
        action: apply ? 'apply_manual_health_import' : 'preview_manual_health_import', payload,
        ...(apply ? { confirmation: confirmed, preview_token: preview.preview_token } : {}),
      } });
      let result = data;
      if (error?.context?.json) { try { result = await error.context.json(); } catch { /* generic error below */ } }
      if (error || !result?.ok) {
        setRejected(result?.rejected_fields || []);
        if (apply) { setPreview(null); setConfirmed(false); }
        throw new Error(errors[result?.error] || 'No se pudo validar o importar. Revisa fecha, campos, valores y unidades.');
      }
      if (!apply) { setPreview(result); setConfirmed(false); }
      else {
        setPreview(null); setConfirmed(false);
        const labels = { inserted: 'Datos importados.', updated: 'Corrección importada.', unchanged: 'Estos datos ya estaban importados.', ignored_stale: 'Captura antigua: se conservan los datos más recientes.' };
        setNotice(labels[result.result.status]);
        setSelectedDate(payload.observation_date); setRefresh(n => n + 1);
        try { await onImported?.(); } catch { setNotice(`${labels[result.result.status]} No se pudo refrescar la vista. Vuelve a abrir Salud.`); }
      }
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  return <section className="manualHealthImport" aria-label="Importación manual de salud" aria-busy={busy}>
    <h2>Importar datos de salud</h2>
    <p>Pega un resumen obtenido por ti de Garmin. Revisa cada valor antes de confirmar. ChatGPT puede ayudarte a preparar el JSON; ENQIDU no lee imágenes ni sincroniza automáticamente.</p>
    <details><summary>Formato y ejemplo</summary><p>Una fecha y una familia por importación. Segundos (s), VFC (ms), pulso (bpm), respiración (brpm), SpO₂ (%) y puntuaciones (score). No incluyas credenciales ni información secreta.</p><pre>{JSON.stringify(manualHealthExample, null, 2)}</pre><p>Usa tu fecha real. captured_at indica cuándo capturaste o corregiste los valores, con zona horaria explícita. Las correcciones necesitan una fecha de captura posterior. La fecha observada se interpreta en la zona de tu perfil.</p></details>
    <label>JSON de salud<textarea aria-label="JSON de salud" value={text} onChange={e => change(e.target.value)} disabled={busy} rows={10} spellCheck={false} /></label>
    <button disabled={busy || !text.trim()} onClick={() => run(false)}>Revisar importación</button>
    {notice && <p role="status">{notice}</p>}
    {rejected.length > 0 && <p role="alert">Campos rechazados: {rejected.join(', ')}</p>}
    {health && <div aria-label="Evidencia de salud actualizada">
      <h3>Salud · {health.calendar_date}</h3>
      <p>Readiness {health.readiness?.score == null ? 'sin evidencia suficiente' : `${health.readiness.score}/100`}</p>
      <dl>{[
        ['sleep','sleep_score','Sueño','/100'], ['hrv','last_night_avg_ms','VFC','ms'],
        ['stress','average','Estrés','/100'], ['body_battery','current','Body Battery','/100'],
        ['heart_rate','resting','Pulso en reposo','bpm'], ['spo2','average','SpO₂','%'], ['respiration','average','Respiración','resp/min'],
      ].map(([family,field,label,unit]) => Number.isFinite(health[family]?.[field]) ? <div key={family}><dt>{label} · {health[family].calendar_date}</dt><dd>{health[family][field]} {unit}</dd></div> : null)}</dl>
      <p>El Coach consultará estos datos al abrir su resumen diario.</p>
    </div>}
    {preview && <div>
      <h3>Revisa los datos</h3><p>{preview.preview.observation_date} · {preview.preview.timezone} · {familyNames[preview.preview.family]}</p>
      <p>Origen: captura manual de Garmin · verificada por ti.</p>
      <dl>{Object.entries(preview.preview.metrics).map(([name, value]) => <div key={name}><dt>{manualMetricPresentation(preview.preview.family, name).label}</dt><dd>{String(value)} {manualMetricPresentation(preview.preview.family, name).unit}</dd></div>)}</dl>
      <p>Campos ignorados: ninguno. Campos rechazados: ninguno.</p>
      <p>Las métricas ausentes quedan sin dato. Esta importación sustituye el resumen completo de esta familia y fecha; no añade valores a un resumen anterior.</p>
      {preview.preview.replaces_existing && <p>Ya existe un resumen para esta fecha. Se aplicará como corrección si es más reciente.</p>}
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />He revisado los valores y confirmo la importación.</label>
      <button disabled={busy || !confirmed} onClick={() => run(true)}>Confirmar e importar</button>
    </div>}
  </section>;
}

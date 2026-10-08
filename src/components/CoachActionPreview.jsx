import React from "react";
import { previewExplanation, previewSessions, previewSessionView } from "../coachTools/actionPreviewView.js";

function SessionState({ session }) {
  const view = previewSessionView(session);
  return <article className="coachPreviewSession">
    <strong>{view.title}</strong>
    <p>{view.date}</p>
    <p>{[view.duration, view.environment, view.status].filter(Boolean).join(" · ")}</p>
    {view.objective && <p>{view.objective}</p>}
    {view.intensity && <p>Intensidad: {view.intensity}</p>}
    {view.blocks.length > 0 && <ol>{view.blocks.map((block, index) => <li key={index}>
      {block.title}{block.duration ? ` · ${block.duration}` : ""}{block.rounds ? ` · ${block.rounds} rondas` : ""}
      {block.objective && <p>{block.objective}</p>}
      {block.exercises && <p>{block.exercises}</p>}
      {block.constraints && <p>Precauciones: {block.constraints}</p>}
      {block.notes && <p>Notas: {block.notes}</p>}
    </li>)}</ol>}
  </article>;
}

export default function CoachActionPreview({ pending, busy, onReview, onApply, onDismiss }) {
  if (!pending) return null;
  const { preview, reviewed, error } = pending;
  const explanations = [...(preview.reasons || []), ...(preview.consequences || []), ...(preview.warnings || [])].map(previewExplanation).filter(Boolean);
  return <section className="coachActionPreview" aria-label="Cambio propuesto" aria-live="polite">
    <h3>{reviewed ? "Revisa el cambio en tu plan" : "Cambio propuesto"}</h3>
    {!reviewed ? <button type="button" disabled={busy} onClick={onReview}>REVISAR CAMBIO</button> : <>
      <div className="coachPreviewComparison">
        <div><h4>Antes</h4>{previewSessions(preview.before).map((session, index) => <SessionState key={index} session={session} />)}</div>
        <div><h4>Después</h4>{previewSessions(preview.after).map((session, index) => <SessionState key={index} session={session} />)}</div>
      </div>
      {explanations.length > 0 && <ul>{[...new Set(explanations)].map((message) => <li key={message}>{message}</li>)}</ul>}
      <p>El plan todavía no ha cambiado. Aplicar confirma exactamente este cambio.</p>
      {error && <p role="alert">{error}</p>}
      {!error && <button type="button" disabled={busy} onClick={onApply}>{busy ? "Aplicando…" : "APLICAR"}</button>}
    </>}
    <button type="button" disabled={busy} onClick={onDismiss}>Descartar propuesta</button>
  </section>;
}

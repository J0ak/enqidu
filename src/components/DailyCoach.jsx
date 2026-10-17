import { recoveryTrendCopy } from "../dailyCoach/recoveryCopy.js";
import React, { useEffect, useState } from "react";
import { requestEnqiduTool } from "../services/enqiduToolsService";
import { decisionLabel, healthLabel, familyLabel, completionLabel, reasonLabel } from "../dailyCoach/presentation.js";
import { healthCalendarUtcBounds } from "../health/healthEvidence.js";
import "./DailyCoach.css";

const planStatus = { planned: "Previsto", confirmed: "Confirmado", adaptable: "Adaptable", probable: "Probable", modified: "Modificado", completed: "Completado", skipped: "No realizado", cancelled: "Cancelado", rescheduled: "Reprogramado", recommended: "Recomendado" };
const proposalSummary = (p) => p?.tool === "preview_adapt_duration" ? `Propuesta: ${p.arguments.duration_minutes} min el ${p.arguments.source_date}.` : p ? "Propuesta: revisar la adaptación de la sesión enlazada." : null;
const lifecycle = { none: "Sin propuesta", proposed: "Propuesta pendiente de revisión", previewed: "Preview generado", applied: "Aplicación confirmada" };
function MeasuredHealth({ health }) {
  const fields = [["sleep", "duration_seconds", "Sueño", "h", 3600], ["hrv", "last_night_avg_ms", "HRV", "ms", 1],
    ["stress", "average", "Estrés", "/100", 1], ["heart_rate", "resting", "Pulso en reposo", "ppm", 1], ["body_battery", "current", "Body Battery", "/100", 1]];
  return <dl className="dailyMetrics">{fields.map(([family, field, label, unit, divisor]) => {
    const value = health.evidence[family]?.[field];
    return health.current_families.includes(family) && Number.isFinite(value)
      ? <div key={family}><dt>{label}</dt><dd>{Math.round(value / divisor * 10) / 10} {unit}</dd></div> : null;
  })}</dl>;
}

export default function DailyCoach({ userId, revision = 0, busy, onReview }) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: userId ? "loading" : "missing", data: null });
    if (userId) requestEnqiduTool({ tool: "get_daily_coach_operating_brief", arguments: {} }).then((result) => {
      if (active) setState(result.ok ? { status: "available", data: result.data, warnings: result.warnings } : { status: "error", data: null });
    }).catch(() => { if (active) setState({ status: "error", data: null }); });
    // Refresh on foreground return and calendar rollover without polling a service.
    const refresh = () => { if (document.visibilityState === "visible") setReload((n) => n + 1); };
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; document.removeEventListener("visibilitychange", refresh); };
  }, [userId, revision, reload]);
  const b = state.data;
  useEffect(() => {
    if (!b) return;
    const next = Date.parse(healthCalendarUtcBounds(b.date, b.timezone).end_utc);
    const timer = setTimeout(() => setReload((n) => n + 1), Math.max(1000, next - Date.now() + 100));
    return () => clearTimeout(timer);
  }, [b]);
  return <section className="dailyCoach" aria-label="Tu día con ENQIDU" aria-busy={state.status === "loading"}>
    <header><h2>HOY</h2>{b && <span>{b.date} · {b.timezone}</span>}</header>
    {state.status === "loading" && <p role="status">Preparando tu resumen diario…</p>}
    {state.status === "missing" && <p>Conecta tu sesión para consultar tu día.</p>}
    {state.status === "error" && <p role="status">No se ha podido consultar el resumen. <button onClick={() => setReload((n) => n + 1)}>Reintentar</button></p>}
    {b && <>
      <div className="dailyReadiness"><strong>Readiness {b.readiness_score === null ? "sin evidencia suficiente" : `${b.readiness_score}/100`}</strong><span>{healthLabel[b.health_today.state]}</span></div>
      {b.health_today.missing_families.length > 0 && <p>Falta evidencia actual de {b.health_today.missing_families.map((name) => familyLabel[name]).join(", ")}.</p>}
      {b.health_today.evidence.issues?.length > 0 && <p>Algunas fuentes no se han podido consultar; el resumen es parcial.</p>}
      {b.health_today.state === "stale" && <p>Fechas de evidencia: {b.health_today.evidence.evidence_dates.join(", ")}.</p>}
      <MeasuredHealth health={b.health_today} />
      <h3>Entreno previsto</h3>
      {b.morning.today_plan.sessions.length ? b.morning.today_plan.sessions.map((session) => <article key={session.id}>
        <strong>{planStatus[session.status] || "Estado por revisar"} · {session.session_type === "rest" ? "Descanso planificado" : session.title}</strong>
        <p>{session.objective}</p><p>{session.planned_duration_min != null ? `${session.planned_duration_min} min` : "Duración no indicada"}{session.planned_intensity ? ` · ${session.planned_intensity}` : ""}</p>
      </article>) : <p>No hay una sesión guardada para hoy.</p>}
      <h3>Decisión del Coach · {decisionLabel[b.decision]}</h3><p>{b.morning.explanation}</p>
      <details><summary>¿Por qué?</summary><ul>{b.morning.reasons.map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}{b.morning.readiness_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p>Estas señales no establecen una causa médica.</p></details>
      {b.morning.review_action && <button disabled={busy} onClick={() => onReview({ type: "review_morning_proposal", ...b.morning.review_action })}>Revisar propuesta de hoy</button>}
      <details><summary>Ayer · {completionLabel[b.yesterday.status]}</summary>
        {b.yesterday.comparisons.map((item, index) => <p key={index}>{item.planned_title ? `${item.planned_title}: ` : ""}{item.planned_rest ? "Descanso planificado. " : ""}{completionLabel[item.status]}{item.duration_delta ? ` · ${item.duration_delta.executed_seconds / 60} min registrados` : ""}</p>)}
        {b.morning.yesterday_execution.sessions.map((session) => <p key={session.id}>Registrado: {session.title}{session.duration_seconds != null ? ` · ${session.duration_seconds / 60} min` : ""}</p>)}
      </details>
      <details><summary>Tendencia · {recoveryTrendCopy(b.trend).title}</summary><p>{recoveryTrendCopy(b.trend).explanation}</p><details><summary>Cómo calculamos la tendencia</summary><p>{b.trend.explanation}</p></details>
        <div className="dailyTrend" role="table" aria-label="Últimos siete días">{b.trend.points.map((point) => <div role="row" key={point.date}><span role="cell">{point.date.slice(5)}</span><strong role="cell">{point.readiness_score ?? "—"}</strong><span role="cell">{healthLabel[point.health_state]}</span></div>)}</div>
      </details>
      <details><summary>Después de entrenar</summary>
        {b.recent_training.sessions.slice(0, 5).filter((s) => !b.post_workout.some((a) => a.executed_session.id === s.id)).map((s) => <article key={s.id}><h3>{s.title}</h3><p>{s.local_date} · {s.duration_seconds == null ? "Duración no disponible" : `${s.duration_seconds / 60} min registrados`}</p><p>Sin enlace canónico al plan. Diferencia y evaluación del plan no disponibles.</p></article>)}{b.post_workout.length ? b.post_workout.map((item) => <article key={item.planned_session.id}>
        <h3>{item.executed_session.title}</h3><p>Previsto: {item.planned_session.title}</p>
        <p>Ejecutado: {item.executed_session.duration_seconds == null ? "duración no disponible" : `${item.executed_session.duration_seconds / 60} min`}</p>
        <p>{completionLabel[item.planned_vs_executed?.status || "unknown"]}</p>
        {item.duration_delta && <p>Diferencia respecto al rango previsto: {item.duration_delta.seconds / 60} min.</p>}
        {item.user_feedback?.rpe != null && <p>Esfuerzo confirmado: {item.user_feedback.rpe}/10.</p>}
        {item.assessment.facts.map((fact, index) => <p key={index}>{fact.reason}</p>)}
        {!item.user_feedback && <p>No hay feedback confirmado.</p>}
        {["reduce", "recovery_bias"].includes(item.adaptation_proposal.action) && !item.adaptation_proposal.reasons.includes("user_reported_discomfort") && item.adaptation_proposal.affected_future_sessions.length === 1 && <button disabled={busy} onClick={() => onReview({ type: "review_closed_loop_proposal", session_id: item.executed_session.id })}>Revisar propuesta de esta sesión</button>}
      </article>) : <p>No hay una evaluación enlazada disponible. Una actividad sin enlace no demuestra ejecución del plan.</p>}</details>
      <details><summary>Historial reciente</summary>
        {(b.history.status === "unavailable" || state.warnings?.includes("daily_coach_history_not_recorded")) && <p>El historial no está disponible o no se ha podido registrar esta consulta.</p>}
        {b.history.status === "available" && !b.history.entries.length && <p>Todavía no hay decisiones anteriores registradas.</p>}
        {b.history.entries.map((entry, index) => <article key={index}><strong>{entry.date} · {new Intl.DateTimeFormat("es-ES", { timeZone: b.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(entry.occurred_at))} · {decisionLabel[entry.decision]}</strong><ul>{entry.reasons.map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul>{entry.proposal && <p>{proposalSummary(entry.proposal)}</p>}<p>{lifecycle[entry.proposal_status]}{entry.preview_expired ? " · El preview ha caducado; no consta aplicación" : ""}</p></article>)}
        {b.history.has_more && <p>Se muestra una parte del historial reciente.</p>}
      </details><button className="dailyRefresh" disabled={busy} onClick={() => setReload((n) => n + 1)}>Actualizar resumen</button>
    </>}
  </section>;
}

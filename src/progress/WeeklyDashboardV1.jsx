import React from "react";
import "./WeeklyDashboardV1.css";
import { modalityLabel, durationLabel } from "./presentation.js";
export { modalityLabel, durationLabel } from "./presentation.js";
export function WeeklyActivityLead({ dashboard: d }) {
  return (
    <div className="weeklyActivityLead" aria-label="Actividad real">
      <strong>
        {d.activity.sessions} actividades · {durationLabel(d.activity.seconds)}
      </strong>
      <p>
        {d.activity.active_days} días activos · {d.activity.confirmed_rest_days}{" "}
        descansos confirmados
      </p>
      <small>
        Tiempo registrado conocido · {d.activity.duration_known}/
        {d.activity.sessions} actividades con duración
      </small>
    </div>
  );
}
export function WeeklyPlanning({ planning: p }) {
  return (
    <div className="weeklyPlanning" aria-label="Planificación secundaria">
      <h4>Planificación</h4>
      <p>
        {p.planned} planes previstos · {p.linked} con ejecución enlazada
      </p>
      <p>
        {p.past_unconfirmed} pasados sin confirmar · {p.upcoming} próximos ·{" "}
        {p.today_unconfirmed} hoy sin confirmar
      </p>
      {p.skipped > 0 && <p>{p.skipped} omitidos explícitamente</p>}
    </div>
  );
}
export default function WeeklyDashboardV1({ dashboard: d }) {
  const maxTime = Math.max(
    1,
    ...d.time_distribution.map((m) => m.seconds || 0),
  );
  return (
    <article
      className="weeklyDashboard"
      aria-label="Informe semanal de entrenamiento"
    >
      <header>
        <span className="weeklyEyebrow">TU SEMANA · DATOS ENQIDU</span>
        <h3>{d.title}</h3>
        <p>
          {d.from} — {d.to} · {d.timezone}
        </p>
        <small>Semana en curso · datos hasta {d.as_of}</small>
      </header>
      <WeeklyActivityLead dashboard={d} />
      <section aria-label="Día a día">
        <h4>Día a día</h4>
        <div className="weeklyDays">
          {d.days.map((day) => (
            <div className="weeklyDay" key={day.date}>
              <h5>
                {new Intl.DateTimeFormat("es-ES", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(`${day.date}T12:00:00Z`))}
              </h5>
              {day.activities.length ? (
                <ul>
                  {day.activities.map((s) => (
                    <li key={s.id}>
                      <strong>{s.title}</strong>
                      <span>
                        {modalityLabel(s.modality)} · {durationLabel(s.seconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {day.future
                    ? "Día próximo · aún no realizado"
                    : day.confirmed_rest
                      ? "Descanso confirmado"
                      : "Sin actividad registrada · descanso sin confirmar"}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section aria-label="Distribución del tiempo">
        <h4>¿Dónde has dedicado tu tiempo?</h4>
        {d.time_distribution.length ? (
          d.time_distribution.map((m) => (
            <div className="weeklyTime" key={m.code}>
              <span>
                {modalityLabel(m.code)} · {durationLabel(m.seconds)}
              </span>
              {m.seconds != null && (
                <meter
                  aria-label={`Tiempo en ${modalityLabel(m.code)}`}
                  min="0"
                  max={maxTime}
                  value={m.seconds}
                />
              )}
              <small>
                {m.sessions} actividades · {m.duration_known} con duración
              </small>
            </div>
          ))
        ) : (
          <p>Aún no hay tiempo registrado.</p>
        )}
      </section>
      <section aria-label="Highlights y progresión">
        <h4>¿Qué está avanzando?</h4>
        {d.highlights.length ? (
          <ul>
            {d.highlights.map((h, i) => (
              <li key={`${h.name}-${i}`}>
                {h.name}: {h.records} mejoras observadas esta semana
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Aún no hay mejoras de marcas verificables dentro de esta semana.
            Esto no significa que estés estancado.
          </p>
        )}
        <p>
          Comparamos el mismo ejercicio, variante y unidad. No estimamos marcas
          ni comparamos una semana parcial con una completa.
        </p>
      </section>
      <section aria-label="Valoración determinista">
        <h4>Tu semana, con perspectiva</h4>
        <p>{d.assessment}</p>
      </section>
      <WeeklyPlanning planning={d.planning} />
      <section className="weeklyQuality" aria-label="Calidad del dato">
        <h4>Qué sabemos de tus datos</h4>
        <p>
          {d.quality.duration_known}/{d.quality.sessions} actividades con
          duración · {d.quality.unknown_modality} sin modalidad registrada.
        </p>
        <p>{d.quality.explanation}</p>
        <small>
          Descanso confirmado requiere un descanso marcado como completado, sin
          actividad registrada ese día. Un descanso futuro planificado no cuenta
          como realizado.
        </small>
      </section>
    </article>
  );
}

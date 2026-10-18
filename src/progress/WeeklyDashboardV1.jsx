import React from "react";
import "./WeeklyDashboardV1.css";
import { modalityLabel, durationLabel, unitLabel } from "./presentation.js";
export { modalityLabel, durationLabel, unitLabel } from "./presentation.js";
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
const planLabel = {
  confirmed_rest: "Descanso confirmado",
  planned_rest: "Descanso previsto · sin confirmación de realización",
  linked: "Ejecución enlazada",
  modified: "Plan modificado · ejecución enlazada",
  skipped: "Omitido explícitamente",
  unknown: "Sin ejecución confirmada",
};
function ActivityEvidence({ activity: s }) {
  return (
    <>
      {s.linked_plan && (
        <p className="weeklyLinkedPlan">
          Plan enlazado: {s.linked_plan.title}
          <small>
            {planLabel[s.linked_plan.status]} · {s.linked_plan.date}
          </small>
          {s.linked_plan.objective && (
            <small>Intención: {s.linked_plan.objective}</small>
          )}
        </p>
      )}
      {s.linked_plan === null && (
        <small>Actividad realizada sin plan enlazado.</small>
      )}
      {s.blocks?.length > 0 && (
        <p>
          Bloques registrados: {s.blocks.map((b) => b.name).join(" · ")}.
          {s.block_count > s.blocks.length &&
            ` Se muestran ${s.blocks.length} de ${s.block_count}.`}
        </p>
      )}
      {s.unidentified_exercises > 0 && (
        <p className="weeklyMissing">
          {s.unidentified_exercises} registros de ejercicios sin identificación
          fiable. No inferimos sus nombres ni su volumen muscular.
        </p>
      )}
      {s.exercises?.slice(0, 3).map((e) => (
        <p className="weeklyExerciseHighlight" key={e.id}>
          <strong>{e.name}</strong>
          <span>
            {e.load !== null
              ? `${e.load} ${unitLabel(e.unit) || "unidad sin registrar"}`
              : e.unit === "bodyweight"
                ? "Peso corporal"
                : "Carga sin dato"}
            {e.reps
              ? ` × ${e.reps.join(" · ")} reps`
              : " · Reps numéricas sin dato"}
          </span>
        </p>
      ))}
      {s.exercises?.length > 0 && (
        <details className="weeklyExerciseDetail">
          <summary>
            Detalle registrado · {s.exercises.length} de {s.exercise_count}{" "}
            ejercicios
          </summary>
          <ul>
            {s.exercises.map((e) => (
              <li key={e.id}>
                <strong>{e.name}</strong>
                <span>
                  {e.load !== null
                    ? `${e.load} ${unitLabel(e.unit) || "unidad sin registrar"}`
                    : "Carga sin dato"}
                  {e.reps
                    ? ` × ${e.reps.join(" · ")} reps`
                    : " · Reps numéricas sin dato"}
                </span>
                {e.unit === "bodyweight" && (
                  <small>Peso corporal explícito</small>
                )}
                {e.variant && <small>Variante registrada: {e.variant}</small>}
                {(e.sets !== null || e.rounds !== null) && (
                  <small>
                    {e.sets !== null ? `${e.sets} series registradas` : ""}
                    {e.rounds !== null
                      ? ` · ${e.rounds} rondas registradas`
                      : ""}
                  </small>
                )}
                {e.notes && <p>Nota de ejecución: {e.notes}</p>}
              </li>
            ))}
          </ul>
          <small>
            Cargas y reps sólo de campos estructurados. Las notas aportan
            contexto; no se convierten en métricas. Se muestran hasta 30 reps
            por registro.
          </small>
        </details>
      )}
      {s.blocks
        ?.filter((b) => b.notes)
        .map((b) => (
          <p key={b.id}>
            Nota de {b.name}: {b.notes}
          </p>
        ))}
    </>
  );
}
function DailyTime({ days }) {
  const value = (day) =>
    "chart_seconds" in day
      ? day.chart_seconds
      : day.future
        ? null
        : day.confirmed_rest
          ? 0
          : day.seconds;
  const max = Math.max(1, ...days.map((day) => value(day) ?? 0));
  return (
    <section aria-label="Distribución diaria del tiempo">
      <h4>¿Cómo has repartido el tiempo esta semana?</h4>
      <div className="weeklyDailyTime">
        {days.map((day) => {
          const seconds = value(day),
            state =
              day.time_state ||
              (day.future
                ? "future"
                : day.confirmed_rest
                  ? "confirmed_rest"
                  : seconds === null
                    ? "unconfirmed"
                    : "observed");
          const label =
            state === "future"
              ? "Próximo · planificación"
              : state === "confirmed_rest"
                ? "0 min · descanso confirmado"
                : state === "unconfirmed"
                  ? "Sin actividad registrada · descanso sin confirmar"
                  : state === "missing_duration"
                    ? "Actividad registrada · duración sin dato"
                    : `${durationLabel(seconds)}${state === "partial" ? " conocidos · duración parcial" : " observados"}`;
          return (
            <div className="weeklyDailyBar" key={day.date} data-state={state}>
              <strong>
                {new Intl.DateTimeFormat("es-ES", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(`${day.date}T12:00:00Z`))}
              </strong>
              <div>
                {seconds !== null ? (
                  <meter
                    aria-label={`Tiempo observado ${day.date}`}
                    min="0"
                    max={max}
                    value={seconds}
                  />
                ) : (
                  <div className="weeklyTimeMissing" aria-hidden="true" />
                )}
                <small>{label}</small>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
              {day.intended_plans?.map((plan) => (
                <p className="weeklyIntention" key={plan.id}>
                  Plan previsto: {plan.title}
                  <small>{planLabel[plan.status]}</small>
                </p>
              ))}
              {day.activities.length ? (
                <ul>
                  {day.activities.map((s) => (
                    <li key={s.id}>
                      <strong>{s.title}</strong>
                      <span>
                        {modalityLabel(s.modality)} · {durationLabel(s.seconds)}
                      </span>
                      <ActivityEvidence activity={s} />
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
      <DailyTime days={d.days} />
      <details className="weeklyModalities">
        <summary>Distribución por modalidad</summary>
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
      </details>
      <section aria-label="Highlights y progresión">
        <h4>¿Qué está avanzando?</h4>
        {d.insights?.some((i) =>
          ["observed_load_record", "observed_reps_record"].includes(i.kind),
        ) ? (
          <ul>
            {d.insights
              .filter((i) =>
                ["observed_load_record", "observed_reps_record"].includes(
                  i.kind,
                ),
              )
              .map((i, index) => (
                <li key={index}>{i.text}</li>
              ))}
          </ul>
        ) : d.highlights.length ? (
          <ul>
            {d.highlights.map((h, i) => (
              <li key={`${h.name}-${i}`}>
                {h.name}: {h.records} mejoras observadas esta semana
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Aún no hay mejoras de marcas verificables esta semana frente a la
            evidencia comparable. Esto no significa que estés estancado.
          </p>
        )}
        <p>
          Comparamos el mismo ejercicio, variante y unidad. No estimamos marcas
          ni comparamos una semana parcial con una completa.
        </p>
      </section>
      <section aria-label="Valoración determinista">
        <h4>Tu semana, con perspectiva</h4>
        {d.insights?.length ? (
          <ul>
            {d.insights
              .filter(
                (i) =>
                  !["observed_load_record", "observed_reps_record"].includes(
                    i.kind,
                  ),
              )
              .map((i, index) => (
                <li key={`${i.kind}-${index}`}>{i.text}</li>
              ))}
          </ul>
        ) : (
          <p>{d.assessment}</p>
        )}
      </section>
      <WeeklyPlanning planning={d.planning} />
      <section className="weeklyQuality" aria-label="Calidad del dato">
        <h4>Qué sabemos de tus datos</h4>
        <p>
          {d.quality.duration_known}/{d.quality.sessions} actividades con
          duración · {d.quality.unknown_modality} sin modalidad registrada.
        </p>
        {d.quality.unidentified_exercises > 0 && (
          <p>
            Parte del detalle de ejercicios no está identificado de forma
            fiable.
          </p>
        )}
        {d.quality.volume && d.quality.volume !== "complete" && (
          <p>
            El volumen muscular es parcial: sólo {d.quality.volume_observations}
            /{d.quality.exercise_count} registros permiten calcular carga ×
            reps. No reconstruimos series ni números desde notas.
          </p>
        )}
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

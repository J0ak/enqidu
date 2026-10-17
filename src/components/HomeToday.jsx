import React, { useState } from "react";
import {
  ArrowUpRight,
  Activity,
  CalendarDays,
  HeartPulse,
  Sparkles,
} from "lucide-react";
import { useHome } from "../home/useHome.js";
import {
  decisionLabel,
  healthLabel,
  completionLabel,
} from "../dailyCoach/presentation.js";
import "./HomeToday.css";

const directions = {
  improving: "En mejora",
  stable: "Estable",
  declining: "En descenso",
  insufficient_data: "Evidencia insuficiente",
};
const minutes = (seconds) =>
  seconds == null
    ? "Duración no disponible"
    : `${Math.round(seconds / 60)} min observados`;
const dateLabel = (date, timezone) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));

export function HomeTodayContent({ state, onNavigate, onPlan, onActivity }) {
  const [openingActivity, setOpeningActivity] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const openActivity = async (item) => {
    if (openingActivity) return;
    setOpeningActivity(true);
    setActivityError(false);
    try {
      await onActivity(item);
    } catch {
      setActivityError(true);
    } finally {
      setOpeningActivity(false);
    }
  };
  const { brief: b, week, status, refresh } = state;
  const today = b?.morning.today_plan.sessions || [];
  const latest = b?.recent_training.sessions[0];
  const progress = week?.progress;
  return (
    <section
      className="homeToday"
      aria-label="Tu cockpit diario"
      aria-busy={status === "loading"}
    >
      <button className="homeProgressLink" onClick={() => onNavigate("progress")}>PROGRESO · Ver evolución ↗</button>
      <header className="homeHeading">
        <div>
          <span className="homeEyebrow">TU COCKPIT DIARIO</span>
          <h2>
            HOY<span className="homeDot">.</span>
          </h2>
          {b && (
            <p>
              {dateLabel(b.date, b.timezone)} · {b.timezone}
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={status === "loading"}
          aria-label="Actualizar Home"
        >
          ↻
        </button>
      </header>
      {status === "loading" && (
        <div className="homeCard" role="status">
          Preparando tu día con los datos disponibles…
        </div>
      )}
      {status === "missing" && (
        <div className="homeCard">
          <h3>Tu día empieza aquí</h3>
          <p>Inicia sesión para ver tu plan y tus datos de salud.</p>
          <button onClick={() => onNavigate("profile")}>Iniciar sesión</button>
        </div>
      )}
      {status === "error" && (
        <div className="homeCard" role="status">
          <h3>No hemos podido cargar tu día</h3>
          <p>
            Los datos no están disponibles. Puedes volver a intentarlo o abrir
            las otras secciones.
          </p>
          <button onClick={refresh}>Reintentar</button>
        </div>
      )}
      {b && (
        <>
          <article className="homeHero" aria-label="Estado de hoy">
            <div className="homeHeroTop">
              <div>
                <span className="homeEyebrow">READINESS</span>
                <p className="homeScore">
                  {b.readiness_score ?? "—"}
                  {b.readiness_score != null && <small>/100</small>}
                </p>
              </div>
              <span className={`homeHealth homeHealth-${b.health_today.state}`}>
                <HeartPulse size={15} />
                {healthLabel[b.health_today.state]}
              </span>
            </div>
            {b.readiness_score == null && (
              <p>Sin evidencia suficiente para calcular readiness.</p>
            )}
            <h3>{decisionLabel[b.decision]}</h3>
            <p>{b.morning.explanation}</p>
            <p className="homeTodayPlan">
              {today.length
                ? today
                    .map((s) =>
                      s.session_type === "rest"
                        ? "Descanso planificado"
                        : s.title,
                    )
                    .join(" · ")
                : "Sin sesión guardada para hoy"}
            </p>
            {b.health_today.state === "stale" && (
              <p>
                Última evidencia:{" "}
                {b.health_today.evidence.evidence_dates.join(", ") ||
                  "fecha no disponible"}
                .
              </p>
            )}
            {b.health_today.evidence.issues?.length > 0 && (
              <p>
                Hay fuentes que no se han podido consultar; la información es
                parcial.
              </p>
            )}
            {b.morning.review_action && (
              <button
                className="homePrimary"
                onClick={() => onNavigate("coach")}
              >
                Ver / revisar propuesta <ArrowUpRight size={17} />
              </button>
            )}
          </article>
          <article className="homeCard" aria-label="Entreno de hoy">
            <div className="homeSectionTitle">
              <h3>Tu entreno</h3>
              <CalendarDays size={18} />
            </div>
            {today.length ? (
              today.map((s) => (
                <div className="homeSession" key={s.id}>
                  <strong>
                    {s.session_type === "rest"
                      ? "Descanso planificado"
                      : s.title}
                  </strong>
                  <p>
                    {s.planned_duration_min == null
                      ? "Duración no indicada"
                      : `${s.planned_duration_min} min previstos`}
                    {s.planned_intensity ? ` · ${s.planned_intensity}` : ""}
                  </p>
                  {s.objective && <p>{s.objective}</p>}
                  <button onClick={() => onPlan(s)}>
                    Ver entrenamiento de hoy <ArrowUpRight size={16} />
                  </button>
                </div>
              ))
            ) : (
              <>
                <strong>No hay una sesión guardada para hoy.</strong>
                <p>Consulta el Coach para decidir el siguiente paso.</p>
              </>
            )}
            <button
              className="homeTextButton"
              onClick={() => onNavigate("activities")}
            >
              Ver plan y calendario
            </button>
          </article>
          <article className="homeCard homeCoach" aria-label="Coach">
            <Sparkles size={22} />
            <div>
              <h3>El siguiente paso, contigo</h3>
              <p>
                Revisa el contexto y las propuestas. Tú confirmas cualquier
                cambio.
              </p>
              <button onClick={() => onNavigate("coach")}>
                Abrir Coach <ArrowUpRight size={16} />
              </button>
            </div>
          </article>
        </>
      )}
      {status !== "missing" && status !== "loading" && (
        <article className="homeCard" aria-label="Progreso semanal">
          <div className="homeSectionTitle">
            <h3>Esta semana</h3>
            <CalendarDays size={18} />
          </div>
          {progress ? (
            <>
              <p>
                {week.from} — {week.to}
              </p>
              {week.weekly_focus && <strong>{week.weekly_focus}</strong>}
              <div className="homeProgressLead">
                <strong>
                  {progress.completed_linked_count}
                  <small> / {progress.planned_count}</small>
                </strong>
                <span>completadas enlazadas</span>
              </div>
              <progress
                aria-label="Progreso semanal"
                value={progress.completed_linked_count}
                max={progress.planned_count || 1}
              />
              <dl className="homeWeekNumbers">
                <div>
                  <dt>Previstas</dt>
                  <dd>{progress.planned_count}</dd>
                </div>
                <div>
                  <dt>Próximas</dt>
                  <dd>{progress.upcoming_count}</dd>
                </div>
                <div>
                  <dt>Pasadas sin confirmar</dt>
                  <dd>{progress.past_unlinked_count}</dd>
                </div>
              </dl>
              {!progress.has_plan && <p>No hay un plan semanal guardado.</p>}
              <p className="homeMuted">
                Sin ejecución confirmada no significa incumplida.
              </p>
            </>
          ) : (
            <p role="status">
              No se pudo consultar el progreso semanal.{" "}
              <button onClick={refresh}>Reintentar semana</button>
            </p>
          )}
          <button onClick={() => onNavigate("activities")}>Abrir Plan</button>
        </article>
      )}
      {b && (
        <>
          <article className="homeCard" aria-label="Recuperación en siete días">
            <div className="homeSectionTitle">
              <h3>Recuperación</h3>
              <HeartPulse size={18} />
            </div>
            <span className="homeEyebrow">ÚLTIMOS 7 DÍAS</span>
            <h4>{directions[b.trend.direction]}</h4>
            <p>{b.trend.explanation}</p>
            <div
              className="homeTrend"
              aria-label="Readiness de los últimos siete días"
            >
              {b.trend.points.map((p) => (
                <div
                  key={p.date}
                  title={`${p.date}: ${healthLabel[p.health_state]}`}
                >
                  <span
                    className={`homeTrendBar homeTrend-${p.health_state}`}
                    style={{ "--score": p.readiness_score ?? 0 }}
                  >
                    <i />
                  </span>
                  <strong>{p.readiness_score ?? "—"}</strong>
                  <small>{p.date.slice(8)}</small>
                  <span className="homeSrOnly">
                    {healthLabel[p.health_state]}
                  </span>
                </div>
              ))}
            </div>
            <p className="homeMuted">
              — Sin puntuación disponible. Las barras tenues indican datos
              incompletos o anteriores.
            </p>
            <button onClick={() => onNavigate("health")}>
              Actualizar salud manualmente <ArrowUpRight size={16} />
            </button>
          </article>
          <article className="homeCard" aria-label="Resumen de ayer">
            <div className="homeSectionTitle">
              <h3>Ayer</h3>
              <Activity size={18} />
            </div>
            <strong>{completionLabel[b.yesterday.status]}</strong>
            {b.yesterday.comparisons.map((c, i) => (
              <div className="homeYesterday" key={i}>
                {c.planned_title && (
                  <p>
                    Planificado:{" "}
                    {c.planned_rest ? "Descanso planificado" : c.planned_title}
                  </p>
                )}
                <p>{completionLabel[c.status]}</p>
                {c.executed_title && <p>Ejecutado: {c.executed_title}</p>}
                {c.executed_id && (
                  <p>
                    {minutes(
                      b.morning.yesterday_execution.sessions.find(
                        (s) => s.id === c.executed_id,
                      )?.duration_seconds ?? c.duration_delta?.executed_seconds,
                    )}
                  </p>
                )}
                {c.executed_id && (
                  <button
                    onClick={() =>
                      openActivity({
                        id: c.executed_id,
                        title: c.executed_title,
                        local_date: c.executed_date,
                        duration_seconds:
                          c.duration_delta?.executed_seconds ?? null,
                      })
                    }
                  >
                    Ver actividad <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
            ))}
            {b.morning.yesterday_execution.sessions
              .filter(
                (s) =>
                  !b.yesterday.comparisons.some((c) => c.executed_id === s.id),
              )
              .map((s) => (
                <div className="homeYesterday" key={s.id}>
                  <p>Ejecutado: {s.title}</p>
                  <p>{minutes(s.duration_seconds)}</p>
                  <button onClick={() => openActivity(s)}>
                    Ver actividad <ArrowUpRight size={16} />
                  </button>
                </div>
              ))}
            {!b.morning.yesterday_execution.sessions.length && (
              <p>No hay actividades registradas para ayer.</p>
            )}
            {b.yesterday.has_more && (
              <p>El resumen no incluye todas las sesiones de ayer.</p>
            )}
          </article>
        </>
      )}
      {openingActivity && <p role="status">Abriendo actividad…</p>}
      {activityError && (
        <p role="alert">No se pudo abrir la actividad. Vuelve a intentarlo.</p>
      )}
      <nav className="homeQuickActions" aria-label="Acciones rápidas">
        <button onClick={() => onNavigate("health")}>
          <HeartPulse size={18} />
          Actualizar salud manualmente
        </button>
        {latest && (
          <button onClick={() => openActivity(latest)}>
            <Activity size={18} />
            Ver última actividad
          </button>
        )}
        {!b && <button onClick={() => onNavigate("coach")}>Abrir Coach</button>}
      </nav>
    </section>
  );
}
export default function HomeToday({ userId, ...actions }) {
  const state = useHome(userId);
  return <HomeTodayContent state={state} {...actions} />;
}

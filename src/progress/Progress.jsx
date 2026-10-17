import React, { useEffect, useState } from "react";
import { requestEnqiduTool } from "../services/enqiduToolsService";
import "./Progress.css";
const labels = {
  functional_strength: "Fuerza",
  hybrid_training: "Híbrido",
  trail_running: "Trail",
  running: "Running",
  yoga_pilates: "Yoga / Pilates",
  cycling: "Ciclismo",
  swimming: "Natación",
  unknown: "Modalidad no registrada",
};
const unitLabel = (unit) =>
  ({
    kg_each: "kg por implemento",
    kg_total: "kg totales",
    "kg total": "kg totales",
    kg_external_discs: "kg en discos",
    bodyweight: "peso corporal",
  })[unit] ||
  unit ||
  "";
const directions = {
  improving: "↑ Mejorando",
  stable: "→ Estable",
  declining: "↓ En descenso",
  insufficient_data: "Datos insuficientes",
};
const fmt = (n, suffix = "") =>
  n == null
    ? "Sin dato"
    : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n)}${suffix}`;
function Metric({ label, value, note }) {
  return (
    <div className="progressMetric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function Exercise({ item: e }) {
  return (
    <article className="progressExercise">
      <header>
        <div>
          <h3>{e.name}</h3>
          <small>
            {e.variant || "Variante registrada"} · {e.exposures} exposiciones
          </small>
        </div>
        <span className={`progressDirection ${e.trend}`}>
          {directions[e.trend]}
        </span>
      </header>
      <div className="progressMetrics">
        <Metric
          label="Mejor carga observada"
          value={
            e.unit === "bodyweight"
              ? "Peso corporal"
              : fmt(e.best_load, ` ${unitLabel(e.unit)}`)
          }
        />
        <Metric
          label="Máx. reps a esa carga"
          value={fmt(e.best_reps_at_load)}
        />
        <Metric label="Máx. reps por serie" value={fmt(e.best_reps)} />
      </div>
      <p className="progressSequence" aria-label="Repeticiones observadas">
        {e.points.slice(-6).map((p, i) => (
          <React.Fragment key={p.exercise_id}>
            {i > 0 && " → "}
            <span
              title={`${p.date} · ${fmt(p.load, e.unit ? " " + unitLabel(e.unit) : "")}`}
            >
              {fmt(p.max_reps)}
              <small>
                {fmt(p.load, e.unit ? " " + unitLabel(e.unit) : "")}
              </small>
            </span>
          </React.Fragment>
        ))}
      </p>
      <small>
        Últimas observaciones; las flechas muestran el orden, no una mejora.
        Tendencia: misma carga y variante, dos sesiones por mitad del periodo.
      </small>
      {e.records?.length > 0 && (
        <p className="progressDirection improving">
          {e.record_count} mejoras observadas del periodo:{" "}
          {e.records
            .slice(-2)
            .map(
              (r) =>
                `${r.kind === "load" ? "carga" : "reps a misma carga"} ${r.previous} → ${r.value} (${r.date})`,
            )
            .join(" · ")}
        </p>
      )}
      <details>
        <summary>Volumen y evidencia</summary>
        <p>
          Volumen conocido:{" "}
          {fmt(e.known_volume, ` ${unitLabel(e.unit)} × reps`)} ·{" "}
          {e.volume_known}/{e.observations} registros calculables.
        </p>
        <p>
          Mejor volumen conocido de sesión: {fmt(e.best_session_volume)}. Puede
          ser parcial; no equivale al volumen total.
        </p>
        <p>
          Última práctica: {e.last_practice}. Marcas observadas dentro del
          periodo, no récords de toda la vida.
        </p>
        {e.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        <ul>
          {e.points.slice(-12).map((p) => (
            <li key={p.exercise_id}>
              {p.date} · {fmt(p.load, e.unit ? ` ${unitLabel(e.unit)}` : "")} ·{" "}
              {fmt(p.max_reps, " reps")} · volumen {fmt(p.volume)}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
export function ProgressContent({
  state,
  period,
  setPeriod,
  filter,
  setFilter,
  refresh,
  page = 0,
  setPage = () => {},
  onSection = () => {},
}) {
  const [section, setSection] = useState("Resumen"),
    [count, setCount] = useState(12);
  const data = state.data;
  return (
    <section
      className="progressPage"
      aria-label="Progreso y rendimiento"
      aria-busy={state.status === "loading"}
    >
      <header className="progressHeading">
        <span>PROGRESS & PERFORMANCE</span>
        <h2>
          Tu progreso<span>.</span>
        </h2>
        <p>Tu entrenamiento, con evidencia.</p>
      </header>
      <div className="progressFilters">
        <label>
          Periodo
          <select
            aria-label="Periodo"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setCount(12);
            }}
          >
            <option value="week">Esta semana</option>
            <option value="4">4 semanas completas</option>
            <option value="12">12 semanas completas</option>
            <option value="all">Todo hasta hoy</option>
          </select>
        </label>
        <label>
          Modalidad
          <select
            aria-label="Modalidad"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {[
              ...new Set([
                "functional_strength",
                "hybrid_training",
                "trail_running",
                "running",
                "yoga_pilates",
                ...(data?.modalities || []),
                ...(filter === "all" ? [] : [filter]),
              ]),
            ].map((code) => (
              <option key={code} value={code}>
                {labels[code] || code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button onClick={refresh} disabled={state.status === "loading"}>
        Actualizar progreso
      </button>
      {state.status === "loading" && (
        <p role="status">Cargando tu histórico canónico…</p>
      )}
      {state.status === "error" && (
        <p role="alert">
          No se pudo consultar tu progreso. Vuelve a intentarlo.
        </p>
      )}
      {state.status === "signed_out" && (
        <p>Inicia sesión para ver tu progreso.</p>
      )}
      {data && (
        <>
          <p className="progressScope">
            {data.from || "Sin histórico"} → {data.to} · {data.timezone}
          </p>
          {data.status === "partial" && (
            <p role="status" className="progressNotice">
              Datos parciales: «Sin dato» no es cero. Mostramos sólo lo
              conocido.
            </p>
          )}
          {data.status === "empty" && (
            <p role="status">
              Todavía no hay actividad en este periodo y modalidad.
            </p>
          )}
          {data.status === "insufficient_data" && (
            <p role="status">Aún no hay suficiente histórico para comparar.</p>
          )}
          <nav className="progressTabs" aria-label="Secciones de progreso">
            {[
              "Resumen",
              "Fuerza",
              "Skills",
              "Resistencia",
              "Consistencia",
              "Plan vs ejecución",
            ].map((s) => (
              <button
                key={s}
                aria-pressed={section === s}
                onClick={() => {
                  setSection(s);
                  onSection(s);
                }}
              >
                {s}
              </button>
            ))}
          </nav>
          {section === "Resumen" && (
            <>
              <div className="progressMetrics">
                <Metric
                  label="Sesiones realizadas"
                  value={data.summary.sessions}
                  note={directions[data.session_trend]}
                />
                <Metric
                  label="Minutos conocidos"
                  value={fmt(
                    data.summary.seconds === null
                      ? null
                      : data.summary.seconds / 60,
                  )}
                  note={`${data.summary.duration_known}/${data.summary.sessions} con duración · ${directions[data.minutes_trend]}`}
                />
                <Metric
                  label="Planificadas · todas"
                  value={data.planning.total}
                />
                <Metric
                  label="Adherencia enlazada"
                  value={fmt(
                    data.planning.adherence === null
                      ? null
                      : data.planning.adherence * 100,
                    "%",
                  )}
                  note="Sólo enlaces persistidos"
                />
              </div>
              <h3>¿Cómo repartes tu entrenamiento?</h3>
              {data.summary.modalities.map((m) => (
                <div className="progressDistribution" key={m.code}>
                  <span>{labels[m.code] || m.code}</span>
                  <meter
                    min="0"
                    max={data.summary.sessions || 1}
                    value={m.sessions}
                  />
                  <b>{m.sessions}</b>
                </div>
              ))}
              <h3>¿Qué está cambiando?</h3>
              <p>
                {fmt(data.observed_records)} mejoras de marcas observadas dentro
                del periodo.
              </p>
              {data.highlights?.map((h, i) => (
                <p
                  key={`${h.name}-${i}`}
                  className="progressDirection improving"
                >
                  ↑ {h.name} · {h.records} mejoras observadas
                </p>
              ))}
              <p>
                {data.improving_count} ejercicios con tendencia comparable de
                reps en mejora. {data.stable_count} estables.
              </p>
              <p>
                {period === "week" ? "Esta semana está en curso. Mostramos actividad real hasta hoy; no comparamos una semana parcial con una completa." : "Comparamos semanas completas de igual duración. Sin histórico comparable, la tendencia queda sin determinar."}
              </p>
            </>
          )}
          {(section === "Fuerza" || section === "Skills") && (
            <>
              <h3>
                {section === "Skills"
                  ? "Tu práctica, variante por variante"
                  : "Tus marcas observadas"}
              </h3>
              <p>
                Sin equivalencias automáticas ni estimación de 1RM. Las unidades
                se mantienen separadas.
              </p>
              {data.strength
                .filter((e) => section !== "Skills" || e.skill)
                .slice(0, count)
                .map((e) => (
                  <Exercise key={e.key} item={e} />
                ))}
              {!data.strength.some((e) => section !== "Skills" || e.skill) && (
                <p>
                  Datos insuficientes: no hay ejercicios estructurados para esta
                  selección.
                </p>
              )}
              <p>
                Página {page + 1} · {data.exercise_count} variantes
                registradas.{" "}
              </p>
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </button>{" "}
              <button
                disabled={(page + 1) * 12 >= data.exercise_count}
                onClick={() => setPage(page + 1)}
              >
                Más ejercicios
              </button>
            </>
          )}
          {section === "Resistencia" && (
            <>
              <h3>Volumen de resistencia observado</h3>
              {!data.cardio.length && (
                <p>
                  Datos insuficientes: no hay sesiones con modalidad de
                  resistencia identificada.
                </p>
              )}
              {data.cardio.map((c) => (
                <article className="progressExercise" key={c.code}>
                  <h3>{labels[c.code] || c.code}</h3>
                  <div className="progressMetrics">
                    <Metric label="Sesiones" value={c.sessions} />
                    <Metric
                      label="Distancia conocida"
                      value={fmt(
                        c.distance === null ? null : c.distance / 1000,
                        " km",
                      )}
                      note={`${c.distance_known}/${c.sessions} con distancia`}
                    />
                    <Metric
                      label="Minutos conocidos"
                      value={fmt(c.seconds === null ? null : c.seconds / 60)}
                    />
                    <Metric
                      label="Desnivel conocido"
                      value={fmt(c.elevation, " m")}
                    />
                    <Metric
                      label="Ritmo observado"
                      value={fmt(
                        c.pace_seconds_km === null
                          ? null
                          : c.pace_seconds_km / 60,
                        " min/km",
                      )}
                      note={`${c.pace_sessions} sesiones comparables en unidades; no ajustado por terreno`}
                    />
                  </div>
                  {c.weeks.map((w) => (
                    <p key={w.from}>
                      {w.from}:{" "}
                      {fmt(
                        w.distance === null ? null : w.distance / 1000,
                        " km",
                      )}
                      {w.partial ? " · parcial" : ""}
                    </p>
                  ))}
                </article>
              ))}
            </>
          )}
          {section === "Consistencia" && (
            <>
              <h3>{data.active_weeks} semanas activas de las últimas 12</h3>
              <p>
                {directions[data.consistency_trend]} · últimas 4 semanas
                completas frente a las 4 anteriores.
              </p>
              <p>
                Ventana fija de 12 semanas; la semana actual es parcial. Incluye
                recovery y yoga con su modalidad.
              </p>
              <div className="progressWeeks">
                {data.weeks.map((w) => (
                  <article key={w.from}>
                    <span>
                      {w.from}
                      {w.partial ? " · parcial" : ""}
                    </span>
                    <meter
                      min="0"
                      max={Math.max(1, ...data.weeks.map((x) => x.sessions))}
                      value={w.sessions}
                    />
                    <b>
                      {w.sessions} sesiones ·{" "}
                      {fmt(w.seconds === null ? null : w.seconds / 60, " min")}
                    </b>
                    <small>
                      {w.modalities
                        .map(
                          (m) => `${labels[m.code] || m.code}: ${m.sessions}`,
                        )
                        .join(" · ") || "Sin sesiones registradas"}
                    </small>
                  </article>
                ))}
              </div>
            </>
          )}
          {section === "Plan vs ejecución" && (
            <>
              <h3>¿Está enlazado tu entrenamiento?</h3>
              <p>
                Todos los planes del periodo, independientemente del filtro de
                modalidad. Una fecha compartida nunca demuestra cumplimiento.
              </p>
              <div className="progressMetrics">
                <Metric label="Planificadas" value={data.planning.total} />
                <Metric
                  label="Ejecutadas enlazadas"
                  value={data.planning.linked + data.planning.modified}
                />
                <Metric
                  label="Enlazadas con plan modificado"
                  value={data.planning.modified}
                />
                <Metric
                  label="Omitidas explícitamente"
                  value={data.planning.skipped}
                />
                <Metric label="Sin confirmar" value={data.planning.unknown} />
              </div>
              <p>
                «Modificado» refleja el estado persistido del plan, no una
                inferencia sobre técnica o ejecución.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
export default function Progress({ userId }) {
  const [page, setPage] = useState(0),
    [skillsOnly, setSkillsOnly] = useState(false);
  const [period, setPeriod] = useState("4"),
    [filter, setFilter] = useState("all"),
    [revision, setRevision] = useState(0),
    [state, setState] = useState({ status: "loading" });
  const scope = `${userId}:${period}:${filter}:${revision}:${page}:${skillsOnly}`;
  useEffect(() => {
    let active = true;
    setState({ status: userId ? "loading" : "signed_out", scope });
    if (userId)
      requestEnqiduTool({
        tool: "get_progress_performance_v1",
        arguments: {
          period,
          modality: filter,
          exercise_page: page,
          skills_only: skillsOnly,
        },
      })
        .then((r) => {
          if (active)
            setState({
              status: r.ok ? "available" : "error",
              data: r.ok ? r.data : null,
              scope,
            });
        })
        .catch(() => {
          if (active) setState({ status: "error", scope });
        });
    return () => {
      active = false;
    };
  }, [scope]);
  return (
    <ProgressContent
      onSection={(s) => {
        setPage(0);
        setSkillsOnly(s === "Skills");
      }}
      state={state.scope === scope ? state : { status: "loading" }}
      page={page}
      setPage={setPage}
      period={period}
      setPeriod={(v) => {
        setPage(0);
        setPeriod(v);
      }}
      filter={filter}
      setFilter={(v) => {
        setPage(0);
        setFilter(v);
      }}
      refresh={() => setRevision((n) => n + 1)}
    />
  );
}

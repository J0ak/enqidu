import React, { useEffect, useRef, useState } from "react";
import { authorizationId, decideConsent, officialRedirect } from "./consent.js";
import "./OAuthConsent.css";

export default function OAuthConsent({
  db,
  search = window.location.search,
  redirect = (url) => window.location.assign(url),
}) {
  const id = authorizationId(search);
  const [state, setState] = useState({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        if (!id || !db) throw Error();
        const auth = await db.auth.getUser();
        if (!auth.data?.user?.id || auth.error) {
          if (alive) setState({ status: "login" });
          return;
        }
        const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
        if (error || !data) throw Error();
        if (!alive) return;
        if (data.redirect_url) {
          redirect(officialRedirect(data));
          return;
        }
        if (!data.client?.name || typeof data.scope !== "string") throw Error();
        setState({ status: "ready", details: data, userId: auth.data.user.id });
      } catch {
        if (alive) setState({ status: "error" });
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [db, id, revision]);
  async function login(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await db.auth.signInWithPassword({
        email: form.get("email"),
        password: form.get("password"),
      });
      if (error) throw Error();
      setRevision((value) => value + 1);
    } catch {
      setState({ status: "login", error: true });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function decide(decision) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      redirect(await decideConsent(db, id, decision, state.userId));
    } catch {
      setState({ status: "error" });
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="oauth-consent">
      <section aria-labelledby="consent-title">
        <p className="oauth-brand">ENQIDU</p>
        <h1 id="consent-title">Autorizar acceso</h1>
        {state.status === "loading" && (
          <p role="status">Comprobando solicitud…</p>
        )}
        {state.status === "error" && (
          <p role="alert">
            No se puede verificar esta solicitud. Vuelve al cliente e inicia la
            conexión de nuevo.
          </p>
        )}
        {state.status === "login" && (
          <form onSubmit={login}>
            <p>Inicia sesión en ENQIDU para revisar la solicitud.</p>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {state.error && (
              <p role="alert">
                No se ha podido iniciar sesión. Revisa tus datos.
              </p>
            )}
            <button disabled={busy} type="submit">
              Iniciar sesión
            </button>
          </form>
        )}
        {state.status === "ready" && (
          <>
            <p>
              Permitir que{" "}
              <strong>{state.details.client.name.slice(0, 200)}</strong>{" "}
              consulte tus datos deportivos de ENQIDU.
            </p>
            <p>
              Podrá consultar entrenamientos, progreso, planes y datos de salud
              disponibles, y preparar vistas previas. No podrá guardar cambios
              mediante ENQIDU MCP.
            </p>
            <p>
              Permisos de identidad solicitados:{" "}
              <span>{state.details.scope || "Sin permisos adicionales"}</span>
            </p>
            <p className="oauth-destination">
              Destino registrado: {state.details.redirect_uri}
            </p>
            <div className="oauth-actions">
              <button disabled={busy} onClick={() => decide("approve")}>
                Aprobar
              </button>
              <button
                className="oauth-deny"
                disabled={busy}
                onClick={() => decide("deny")}
              >
                Denegar
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

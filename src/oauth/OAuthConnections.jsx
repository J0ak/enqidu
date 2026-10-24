import React, { useEffect, useState } from "react";
import { consentApi } from "./consent.js";
import "./OAuthConsent.css";
export default function OAuthConnections({ db }) {
  const [connections, setConnections] = useState(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setConnections(
        (await consentApi(db, "/api/oauth/connections")).connections,
      );
    } catch {
      setError(true);
    }
  };
  useEffect(() => {
    load();
  }, [db]);
  async function revoke(id) {
    setBusy(true);
    try {
      await consentApi(db, "/api/oauth/revoke", { grant_id: id });
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="oauth-consent">
      <section>
        <p className="oauth-brand">ENQIDU</p>
        <h1>Conexiones</h1>
        <p>Revocar acceso desconecta ChatGPT de tus datos deportivos.</p>
        {error && (
          <p role="alert">
            Inicia sesión en ENQIDU y vuelve a intentar cargar tus conexiones.
          </p>
        )}
        {!connections && !error && <p role="status">Cargando…</p>}
        {connections?.length === 0 && <p>No tienes conexiones activas.</p>}
        {connections?.map((c) => (
          <article key={c.id}>
            <h2>ChatGPT</h2>
            <p>{c.scopes.join(", ")}</p>
            <button disabled={busy} onClick={() => revoke(c.id)}>
              Revocar acceso
            </button>
          </article>
        ))}
        <p>
          <a href="/">Volver a ENQIDU</a>
        </p>
      </section>
    </main>
  );
}

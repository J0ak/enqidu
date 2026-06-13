import { useState } from "react";
import {
  ENRICHMENT_SESSION_ID_20260606,
  enrichmentPayload20260606,
  aiUsagePayload20260606,
} from "@/data/demo/enrichmentPayload20260606";
import { persistConversationEnrichment } from "@/services/conversationEnrichmentService";

export default function ConversationEnrichmentDemo() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await persistConversationEnrichment({
        sessionId: ENRICHMENT_SESSION_ID_20260606,
        payload: enrichmentPayload20260606,
        aiUsage: aiUsagePayload20260606,
      });

      setResult(response);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="adminDemo">
      <div className="adminDemoInner">
        <header>
          <p className="adminEyebrow">ENQIDU · Admin demo</p>
          <h1>Conversational enrichment pilot</h1>
          <p>
            Enriquece la sesion FIT de fuerza del 06/06 con bloques,
            ejercicios, notas conversacionales y coste estimado IA.
          </p>
        </header>

        <section className="adminPanel">
          <p>Session ID</p>
          <code>{ENRICHMENT_SESSION_ID_20260606}</code>

          <button onClick={handleRun} disabled={loading}>
            {loading ? "Persistiendo..." : "Persistir enriquecimiento"}
          </button>
        </section>

        {result ? (
          <section className="adminPanel adminPanelOk">
            <h2>Resultado</h2>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </section>
        ) : null}

        {error ? (
          <section className="adminPanel adminPanelError">
            <h2>Error</h2>
            <pre>{JSON.stringify(error, null, 2)}</pre>
          </section>
        ) : null}

        <section className="adminPanel">
          <h2>Payload resumido</h2>
          <pre className="adminPayload">
            {JSON.stringify(enrichmentPayload20260606, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}

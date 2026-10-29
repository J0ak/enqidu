import React from "react";
import { createRoot } from "react-dom/client";
import OAuthConsent from "../src/oauth/OAuthConsent.jsx";
const host = document.createElement("div");
document.body.replaceChildren(host);
const root = createRoot(host);
window.renderConsent = (scenario = "ready") => {
  window.consentCalls = [];
  window.consentRedirect = null;
  let loggedIn = scenario !== "login";
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: loggedIn ? { id: "athlete-a" } : null },
      }),
      getSession: async () => ({
        data: {
          session: loggedIn ? { access_token: "browser-only-fixture" } : null,
        },
      }),
      signInWithPassword: async () => {
        loggedIn = true;
        return { error: null };
      },
    },
  };
  const fetcher = async (path, options) => {
    const body = JSON.parse(options.body);
    window.consentCalls.push([path, body]);
    if (scenario === "error") return new Response("", { status: 400 });
    const callback =
      scenario === "claude"
        ? "https://claude.ai/api/mcp/auth_callback"
        : "https://chatgpt.com/connector_platform_oauth_redirect";
    return path.endsWith("details")
      ? Response.json({
          client: {
            name:
              scenario === "claude"
                ? "Claude"
                : "ChatGPT <script>NO_EJECUTAR</script>",
          },
          scope: "enqidu.read enqidu.preview offline_access",
          redirect_uri: callback,
        })
      : Response.json({
          redirect_url: `${callback}?${body.decision === "approve" ? "code=opaque" : "error=access_denied"}&iss=https%3A%2F%2Fenqidu.example`,
        });
  };
  root.render(
    <OAuthConsent
      key={scenario}
      db={db}
      fetcher={fetcher}
      search={
        scenario === "missing"
          ? ""
          : "?request_id=enq_mcp_req_" +
            "a".repeat(43) +
            "&redirect_uri=https://evil.example"
      }
      redirect={(url) => {
        window.consentRedirect = url;
      }}
    />,
  );
};
window.renderConsent();
window.renderConnections = async () => {
  const { default: OAuthConnections } = await import(
    "../src/oauth/OAuthConnections.jsx"
  );
  root.render(
    <OAuthConnections
      db={{
        auth: {
          getSession: async () => ({
            data: { session: { access_token: "browser-only-fixture" } },
          }),
        },
      }}
    />,
  );
};

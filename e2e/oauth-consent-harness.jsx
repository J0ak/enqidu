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
      signInWithPassword: async () => {
        loggedIn = true;
        return { error: null };
      },
      oauth: {
        getAuthorizationDetails: async (id) => {
          window.consentCalls.push(["details", id]);
          return scenario === "error"
            ? { error: {} }
            : scenario === "previous"
              ? { data: { redirect_url: "https://client.example/previous" } }
              : {
                  data: {
                    client: { name: "Entrenador <script>NO_EJECUTAR</script>" },
                    scope: "openid email",
                    redirect_uri: "https://client.example/callback",
                    user: { id: "athlete-a" },
                  },
                };
        },
        approveAuthorization: async (id, options) => {
          window.consentCalls.push(["approve", id, options]);
          return {
            data: {
              redirect_url: "https://client.example/callback?code=official",
            },
          };
        },
        denyAuthorization: async (id, options) => {
          window.consentCalls.push(["deny", id, options]);
          return {
            data: {
              redirect_url:
                "https://client.example/callback?error=access_denied",
            },
          };
        },
      },
    },
  };
  root.render(
    <OAuthConsent
      key={scenario}
      db={db}
      search={
        scenario === "missing"
          ? ""
          : "?authorization_id=request-104&redirect_uri=https://evil.example"
      }
      redirect={(url) => {
        window.consentRedirect = url;
      }}
    />,
  );
};
window.renderConsent();

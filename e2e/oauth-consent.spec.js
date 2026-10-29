import { test, expect } from "@playwright/test";

test("OAuth consent: 390px, explicit read/preview scope, API-only approve/deny redirect and login continuation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/oauth/consent");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.evaluate(() => import("/e2e/oauth-consent-harness.jsx"));
  await expect(page.getByText(/Permitir que/)).toBeVisible();
  await expect(page.getByText(/No podrá guardar cambios/)).toBeVisible();
  await expect(
    page.getByText("Permisos solicitados:", { exact: false }),
  ).toContainText("enqidu.read enqidu.preview offline_access");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/oauth-consent-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.consentRedirect))
    .toBe(
      "https://chatgpt.com/connector_platform_oauth_redirect?code=opaque&iss=https%3A%2F%2Fenqidu.example",
    );
  expect(await page.evaluate(() => window.consentCalls.at(-1))).toEqual([
    "/api/oauth/decision",
    {
      authorization_request_id: "enq_mcp_req_" + "a".repeat(43),
      decision: "approve",
    },
  ]);
  await page.evaluate(() => window.renderConsent("deny"));
  await page.getByRole("button", { name: "Denegar", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.consentRedirect))
    .toBe(
      "https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied&iss=https%3A%2F%2Fenqidu.example",
    );
  await page.evaluate(() => window.renderConsent("login"));
  await page.getByLabel("Email", { exact: true }).fill("athlete@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("fixture-only");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Aprobar", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.renderConsent("claude"));
  await expect(page.getByText(/Permitir que/)).toContainText("Claude");
  await expect(page.getByText(/Destino registrado/)).toContainText(
    "https://claude.ai/api/mcp/auth_callback",
  );
  await page.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.consentRedirect))
    .toBe(
      "https://claude.ai/api/mcp/auth_callback?code=opaque&iss=https%3A%2F%2Fenqidu.example",
    );
  for (const scenario of ["missing", "error"]) {
    await page.evaluate((s) => window.renderConsent(s), scenario);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  }
});

test("OAuth connections: first-party revoke from mobile UI removes the connection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let revoked = false;
  const grant_id = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/oauth/connections", (route) =>
    route.fulfill({
      json: {
        connections: revoked
          ? []
          : [
              {
                id: grant_id,
                client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
                scopes: ["enqidu.read", "enqidu.preview"],
              },
            ],
      },
    }),
  );
  await page.route("**/api/oauth/revoke", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ grant_id });
    expect(route.request().headers().authorization).toBe(
      "Bearer browser-only-fixture",
    );
    revoked = true;
    await route.fulfill({ json: { revoked: true } });
  });
  await page.goto("/oauth/consent");
  await page.evaluate(() => import("/e2e/oauth-consent-harness.jsx"));
  await page.evaluate(() => window.renderConnections());
  await expect(
    page.getByRole("heading", { name: "Conexiones", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Claude", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revocar acceso" }).click();
  await expect(page.getByText("No tienes conexiones activas.")).toBeVisible();
  expect(revoked).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

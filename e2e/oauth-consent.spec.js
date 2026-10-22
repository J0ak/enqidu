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
    page.getByText("Permisos de identidad solicitados:", { exact: false }),
  ).toContainText("openid email");
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
    .toBe("https://client.example/callback?code=official");
  expect(await page.evaluate(() => window.consentCalls.at(-1))).toEqual([
    "approve",
    "request-104",
    { skipBrowserRedirect: true },
  ]);
  await page.evaluate(() => window.renderConsent("deny"));
  await page.getByRole("button", { name: "Denegar", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.consentRedirect))
    .toBe("https://client.example/callback?error=access_denied");
  await page.evaluate(() => window.renderConsent("login"));
  await page.getByLabel("Email", { exact: true }).fill("athlete@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("fixture-only");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Aprobar", exact: true }),
  ).toBeVisible();
  for (const scenario of ["missing", "error"]) {
    await page.evaluate((s) => window.renderConsent(s), scenario);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  }
  await page.evaluate(() => window.renderConsent("previous"));
  await expect
    .poll(() => page.evaluate(() => window.consentRedirect))
    .toBe("https://client.example/previous");
});

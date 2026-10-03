import { test, expect } from "@playwright/test";

test("Local Language lab exposes canonical benchmark inputs without touching cloud LLM APIs", async ({ page }) => {
  let openAiCalls = 0;
  const browserErrors = [];
  page.on("request", (request) => {
    if (/api\.openai\.com/i.test(request.url())) openAiCalls += 1;
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console.error: ${message.text()}`);
  });

  await page.goto("/labs/local-language-v0/index.html");

  await expect(page.getByRole("heading", { name: "ENQIDU Local Language Layer V0" })).toBeVisible();
  await expect(page.locator("#dataset")).toHaveText("222 casos · core 136 · challenge 86 · ES + EN");
  await expect(page.locator("#model option")).toHaveCount(5);
  await expect(page.locator("#caseCount")).toHaveValue("60");
  await expect(page.getByRole("button", { name: "Descargar resultado JSON" })).toBeDisabled();
  await expect(page.locator("#webgpu")).not.toHaveText("comprobando…");

  expect(openAiCalls).toBe(0);
  expect(browserErrors).toEqual([]);
});

import { test, expect } from "@playwright/test";

test("flujo inicial: carga real sin demo visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Del plano al cómputo, sin perder el criterio." })).toBeVisible();
  await expect(page.locator(".demo-box")).toBeHidden();
  await expect(page.locator(".awaiting p")).toBeVisible();
  await expect.poll(async () => page.locator(".awaiting p").evaluate((element) => getComputedStyle(element, "::after").content)).toBe('"Elegí un archivo para empezar."');
  await expect(page.getByRole("button", { name: "Interpretar plano →" })).toBeDisabled();
});

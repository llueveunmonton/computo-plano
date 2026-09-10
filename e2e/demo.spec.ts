import { test, expect } from "@playwright/test";

test("flujo inicial: carga real sin demo visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Del plano al cómputo, sin perder el criterio." })).toBeVisible();
  await expect(page.locator(".demo-box")).toBeHidden();
  await expect(page.locator(".awaiting p")).toBeVisible();
  await expect.poll(async () => page.locator(".awaiting p").evaluate((element) => getComputedStyle(element, "::after").content)).toBe('"Elegí un archivo para empezar."');
  await expect(page.getByRole("button", { name: "Interpretar plano →" })).toBeDisabled();
});

test("el aviso demo no comprime ni desborda el texto", async ({ page }) => {
  await page.goto("/");
  await page.locator(".demo-box button").evaluate((button) => (button as HTMLButtonElement).click());
  const bannerText = page.locator(".banner > span");
  await expect(bannerText).toContainText("EJEMPLO DEMO");
  await expect.poll(async () => bannerText.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(100);
});

test("mantiene la revisión avanzada cerrada hasta solicitarla", async ({ page }) => {
  await page.goto("/");
  await page.locator(".demo-box button").evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole("button", { name: "Revisar muros y rendimientos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Superficies de piso" })).toBeHidden();
  await page.getByRole("button", { name: "Revisar muros y rendimientos" }).click();
  await expect(page.getByRole("heading", { name: "Superficies de piso" })).toBeVisible();
});

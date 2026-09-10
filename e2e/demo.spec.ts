import { test, expect } from "@playwright/test";

test("flujo demo: revisar, recalcular, persistir y exportar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Del plano al cómputo, sin perder el criterio." })).toBeVisible();
  await expect(page.locator(".demo-box")).toHaveAttribute("draggable", "true");
  await page.locator(".demo-box").dragTo(page.locator(".dropzone"));
  await expect(page.getByText("plano-demo-public-domain.png")).toBeVisible();
  await page.getByRole("button", { name: /Abrir ejemplo demo/ }).click();
  await expect(page.getByText("EJEMPLO DEMO", { exact: true }).first()).toBeVisible();
  await expect(page.locator('input[value="Estar-comedor"]')).toBeVisible();

  await page.getByLabel("Desperdicio pisos").fill("0");
  await page.getByRole("button", { name: /Calcular materiales/ }).click();
  await expect(page.getByText("Cómputo recalculado y guardado localmente.")).toBeVisible();
  await expect(page.getByText("Cerámico 45×45 cm")).toBeVisible();
  await expect(page.getByText("15", { exact: true })).toBeVisible();

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar CSV/ }).click();
  expect((await csvDownload).suggestedFilename()).toContain("computo.csv");

  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar respaldo/ }).click();
  expect((await backupDownload).suggestedFilename()).toContain("respaldo.json");
});

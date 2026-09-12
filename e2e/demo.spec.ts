import { test, expect } from "@playwright/test";

test("flujo inicial: alcance de beta y carga guiada", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Beta de prueba: por ahora analizamos únicamente planos de baños.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Empezá por una imagen que podamos leer." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver ejemplo completo →" })).toBeVisible();
  await expect(page.getByText("Funciona mejor con")).toBeVisible();
});

test("el ejemplo de baño funciona hasta el cómputo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ver ejemplo completo →" }).click();
  await expect(page.getByText("EJEMPLO COMPLETO", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "El cómputo ya tiene una dirección." })).toBeVisible();
  await expect(page.getByText("Las decisiones pueden cambiar estas cantidades.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar con datos →" }).click();
  await expect(page.getByRole("heading", { name: "Completemos lo que el plano no muestra." })).toBeVisible();
  await page.getByRole("button", { name: "Ver cómputo →" }).click({ force: true });
  await expect(page.getByRole("heading", { name: "Materiales con historia." })).toBeVisible();
  await expect(page.getByText("Instalación sanitaria")).toBeVisible();
  await expect(page.getByText("¿Por qué?", { exact: true }).first()).toBeVisible();
});

test("permite editar un supuesto y volver a materiales", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ver ejemplo completo →" }).click();
  await page.getByRole("button", { name: "Continuar con datos →" }).click();
  const height = page.getByRole("spinbutton").first();
  await height.fill("2.60");
  await page.getByRole("button", { name: "Ver cómputo →" }).click({ force: true });
  await expect(page.getByText("Resultado preliminar")).toBeVisible();
});

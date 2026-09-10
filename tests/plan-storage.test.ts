import { describe, expect, it } from "vitest";
import { projectPath } from "@/lib/plan-storage";

describe("rutas de almacenamiento", () => {
  it("acepta IDs UUID y rechaza segmentos de ruta", () => {
    expect(projectPath("00000000-0000-4000-8000-000000000000")).toContain("00000000-0000-4000-8000-000000000000.json");
    expect(() => projectPath("../../outside")).toThrow("INVALID_PROJECT_ID");
  });
});

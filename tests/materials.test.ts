import { describe, expect, it } from "vitest";
import { calculateMaterials, demoInterpretation, type PlanInterpretation } from "@/lib/plan";

describe("motor de cómputo independiente", () => {
  it("calcula pisos, mampostería y pintura con resultados conocidos", () => {
    const result = calculateMaterials(demoInterpretation, new Date("2026-01-01T00:00:00Z"));
    expect(result.totals.floorAreaM2).toBe(29);
    expect(result.lines.find((line) => line.id === "floor")?.quantity).toBe(17);
    expect(result.totals.masonryAreaM2).toBe(18.91);
    expect(result.lines.find((line) => line.id === "brick")?.quantity).toBe(334);
    expect(result.totals.paintAreaM2).toBe(39.71);
    expect(result.lines.find((line) => line.id === "paint")?.quantity).toBe(8.74);
  });

  it("descuenta cada abertura una vez y respeta caras de pintura", () => {
    const input: PlanInterpretation = structuredClone(demoInterpretation);
    input.walls = [{ ...input.walls[0], openings: [{ ...input.walls[0].openings[0], quantity: 2 }], paintLeft: true, paintRight: false }];
    const result = calculateMaterials(input);
    expect(result.totals.masonryAreaM2).toBe(9.22);
    expect(result.totals.paintAreaM2).toBe(9.22);
  });

  it("mantiene pendientes los faltantes y no los convierte en cero", () => {
    const input: PlanInterpretation = structuredClone(demoInterpretation);
    input.rooms[1].widthM = null;
    input.walls[1].lengthM = null;
    input.settings.paintCoverageM2PerL = null;
    const result = calculateMaterials(input);
    expect(result.totals.floorAreaM2).toBeNull();
    expect(result.lines.find((line) => line.id === "floor")?.quantity).toBeNull();
    expect(result.lines.find((line) => line.id === "floor")?.status).toBe("pendiente");
    expect(result.lines.find((line) => line.id === "brick")?.status).toBe("parcial");
    expect(result.lines.find((line) => line.id === "paint")?.quantity).toBeNull();
    expect(result.warnings.some((warning) => warning.includes("Faltan dimensiones"))).toBe(true);
  });

  it("permite recalcular al cambiar un supuesto", () => {
    const first = calculateMaterials(demoInterpretation);
    const input: PlanInterpretation = structuredClone(demoInterpretation);
    input.settings.floorWastePercent = 0;
    const second = calculateMaterials(input);
    expect(first.lines.find((line) => line.id === "floor")?.quantity).toBe(17);
    expect(second.lines.find((line) => line.id === "floor")?.quantity).toBe(15);
  });
});

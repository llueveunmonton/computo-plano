import { describe, expect, it } from "vitest";
import { calculateMaterials, demoInterpretation, type PlanInterpretation } from "@/lib/plan";
import { interpretationSchema } from "@/lib/plan-schema";

describe("motor de cómputo independiente", () => {
  it("calcula pisos, mampostería y pintura con resultados conocidos", () => {
    const result = calculateMaterials(demoInterpretation, new Date("2026-01-01T00:00:00Z"));
    expect(result.totals.floorAreaM2).toBe(29);
    expect(result.lines.find((line) => line.id === "floor")?.quantity).toBe(17);
    expect(result.totals.masonryAreaM2).toBe(18.91);
    expect(result.lines.find((line) => line.id === "brick")?.quantity).toBe(334);
    expect(result.totals.paintAreaM2).toBe(37.82);
    expect(result.lines.find((line) => line.id === "paint")?.quantity).toBe(8.32);
  });

  it("descuenta aberturas de mampostería y de cada cara pintada", () => {
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

  it("no calcula cantidades con rendimientos inválidos", () => {
    const input: PlanInterpretation = structuredClone(demoInterpretation);
    input.settings.floorCoverageM2PerBox = 0;
    const result = calculateMaterials(input);
    const floor = result.lines.find((line) => line.id === "floor");
    expect(floor?.quantity).toBeNull();
    expect(floor?.status).toBe("pendiente");
  });

  it("mantiene parciales las geometrías con aberturas imposibles", () => {
    const input: PlanInterpretation = structuredClone(demoInterpretation);
    input.walls[0].openings[0].widthM = 10;
    input.walls[0].openings[0].heightM = 10;
    const result = calculateMaterials(input);
    expect(result.totals.masonryAreaM2).toBe(7.8);
    expect(result.totals.paintAreaM2).toBe(15.6);
    expect(result.lines.find((line) => line.id === "brick")?.status).toBe("parcial");
    expect(result.lines.find((line) => line.id === "paint")?.status).toBe("parcial");
    expect(result.warnings.some((warning) => warning.includes("aberturas inválidas"))).toBe(true);
  });

  it("rechaza valores físicos nulos o negativos en la interpretación", () => {
    const input: PlanInterpretation = structuredClone(demoInterpretation);
    input.settings.floorCoverageM2PerBox = 0;
    expect(() => interpretationSchema.parse(input)).toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { demoInterpretation } from "@/lib/plan";
import { geminiJsonSchema } from "@/lib/plan-schema";
import { extractPlanWithVision, visionConfigurationError, visionIsConfigured } from "@/lib/vision-extraction";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const requestInput = { bytes: Buffer.from("fake-image"), mimeType: "image/png", fileName: "mono.png", selectedPage: null };

describe("contrato del proveedor de visión", () => {
  it("acepta una interpretación JSON válida del proveedor", async () => {
    vi.stubEnv("OPENAI_API_KEY", "'sk-test'");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(demoInterpretation) }), { status: 200 })));

    const result = await extractPlanWithVision(requestInput);

    expect(visionIsConfigured()).toBe(true);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].name).toBe("Monoambiente");
  });

  it("tolera JSON envuelto en un bloque Markdown", async () => {
    vi.stubEnv("OPENAI_API_KEY", "'sk-test'");
    const fenced = "```json\n" + JSON.stringify(demoInterpretation) + "\n```";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: fenced }), { status: 200 })));

    const result = await extractPlanWithVision(requestInput);

    expect(result.rooms[0].name).toBe("Monoambiente");
  });

  it("propaga el rechazo de autenticación para mostrar un diagnóstico útil", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-invalid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));

    await expect(extractPlanWithVision(requestInput)).rejects.toThrow("VISION_PROVIDER_401");
  });

  it("detecta un token JWT configurado por error como OPENAI_API_KEY", () => {
    vi.stubEnv("OPENAI_API_KEY", "eyJ2IjoidjIiLCJjIjoiZXJyb3IifQ");

    expect(visionIsConfigured()).toBe(false);
    expect(visionConfigurationError()).toContain("token JWT");
  });

  it("extrae una interpretación usando Gemini con JSON estructurado", async () => {
    vi.stubEnv("VISION_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "AIza-test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(demoInterpretation) }] } }] }), { status: 200 })));

    const result = await extractPlanWithVision(requestInput);

    expect(visionIsConfigured()).toBe(true);
    expect(result.rooms[0].name).toBe("Monoambiente");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent");
    expect((geminiJsonSchema.properties.walls.items as any).properties.openings.items.properties.type.type).toBe("STRING");
  });
});

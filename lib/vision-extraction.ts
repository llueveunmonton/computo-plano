import "server-only";
import { geminiJsonSchema, interpretationSchema, visionJsonSchema } from "./plan-schema";
import type { PlanInterpretation } from "./plan";

const SYSTEM_INSTRUCTIONS = `Sos un perito en lectura de planos de baños. Esta beta analiza únicamente un baño por plano. Analizá solamente lo que se ve o está explícitamente acotado. Priorizá cotas legibles y unidades explícitas. Nunca calibres una foto redimensionada usando la escala impresa ni midas por píxeles con perspectiva. Las posiciones son evidencia visual, no mediciones. Usá null si falta un dato. Para cada dato incluí estado detectado, confirmado, supuesto o pendiente. No inventes alturas, materiales, recorridos ni estructura. Devolvé un ambiente de baño, muros únicos, aberturas, artefactos sanitarios, puntos eléctricos, recorridos sólo si están dibujados y evidencia breve. Si la imagen no parece un baño, marcá no_baño y dejá una pregunta concreta. Si la imagen no es utilizable por desenfoque, orientación o perspectiva, indicá no_utilizable y dejá preguntas concretas.`;
const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

type VisionInput = { bytes: Buffer; mimeType: string; fileName: string; selectedPage: number | null; knownDimensionM?: number | null };

function environmentValue(value: string | undefined) {
  return value?.trim().replace(/^("|')|("|')$/g, "") || null;
}

function provider() {
  return (environmentValue(process.env.VISION_PROVIDER) || "openai").toLowerCase();
}

function pageNote(input: VisionInput) {
  const reference = input.knownDimensionM ? ` El usuario informa una medida conocida de ${input.knownDimensionM} m; usala sólo como referencia declarada y dejá la cota como dato a confirmar.` : " Si no hay una medida conocida, dejá la geometría pendiente.";
  return input.mimeType === "application/pdf"
    ? `El archivo es PDF. Concentrate en la página seleccionada ${input.selectedPage ?? 1}; si no podés inspeccionarla, informalo en preguntas y no inventes datos.${reference}`
    : `La imagen puede haber sido rotada o recortada; evaluá orientación y perspectiva antes de extraer.${reference}`;
}

function parseInterpretation(text: string | null) {
  if (!text) throw new Error("VISION_EMPTY_RESPONSE");
  try {
    const parsed = interpretationSchema.parse(JSON.parse(text));
    return {
      ...parsed,
      settings: {
        ...parsed.settings,
        wallTileCoverageM2PerBox: parsed.settings.wallTileCoverageM2PerBox ?? 2,
        wallTileWastePercent: parsed.settings.wallTileWastePercent ?? 10,
        adhesiveKgPerM2: parsed.settings.adhesiveKgPerM2 ?? 4,
        groutKgPerM2: parsed.settings.groutKgPerM2 ?? 0.5,
        waterproofingKgPerM2: parsed.settings.waterproofingKgPerM2 ?? 1.5,
        sanitaryTemplateM: parsed.settings.sanitaryTemplateM ?? 18,
        electricalTemplateM: parsed.settings.electricalTemplateM ?? 12,
        sanitaryWastePercent: parsed.settings.sanitaryWastePercent ?? 10,
        electricalWastePercent: parsed.settings.electricalWastePercent ?? 10,
        installationMode: parsed.settings.installationMode ?? "plantilla",
      },
    };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("VISION_INVALID_JSON");
    throw error;
  }
}

function extractOpenAIText(response: any): string | null {
  if (typeof response?.output_text === "string") return response.output_text;
  const chunks = response?.output?.flatMap((item: any) => item?.content ?? []) ?? [];
  const text = chunks.map((chunk: any) => chunk?.text).filter((value: unknown): value is string => typeof value === "string").join("\n");
  return text || null;
}

function extractGeminiText(response: any): string | null {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part: any) => part?.text).filter((value: unknown): value is string => typeof value === "string").join("\n");
  return text || null;
}

async function requestJson(endpoint: string, body: unknown, headers: HeadersInit, timeoutMs = 90_000) {
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`VISION_PROVIDER_${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json();
}

async function extractWithOpenAI(input: VisionInput, apiKey: string): Promise<PlanInterpretation> {
  const model = environmentValue(process.env.VISION_MODEL) || "gpt-4.1-mini";
  const endpoint = environmentValue(process.env.VISION_API_URL) || DEFAULT_OPENAI_API_URL;
  const dataUrl = `data:${input.mimeType};base64,${input.bytes.toString("base64")}`;
  const media = input.mimeType === "application/pdf"
    ? { type: "input_file", filename: input.fileName, file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl, detail: "high" };
  const payload = await requestJson(endpoint, {
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: `${SYSTEM_INSTRUCTIONS}\n\n${pageNote(input)}` }, media] }],
    temperature: 0,
    text: { format: { type: "json_schema", name: "plan_interpretation", strict: true, schema: visionJsonSchema } },
  }, { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" });
  return parseInterpretation(extractOpenAIText(payload));
}

async function extractWithGemini(input: VisionInput, apiKey: string): Promise<PlanInterpretation> {
  const model = environmentValue(process.env.GEMINI_MODEL) || "gemini-3.6-flash";
  const baseUrl = environmentValue(process.env.GEMINI_API_URL) || DEFAULT_GEMINI_API_URL;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = await requestJson(endpoint, {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: pageNote(input) }, { inlineData: { mimeType: input.mimeType, data: input.bytes.toString("base64") } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: geminiJsonSchema },
  }, { "Content-Type": "application/json" }, 180_000);
  return parseInterpretation(extractGeminiText(payload));
}

export function visionIsConfigured() {
  return visionConfigurationError() === null;
}

export function visionConfigurationError() {
  const activeProvider = provider();
  if (activeProvider === "gemini") return environmentValue(process.env.GEMINI_API_KEY) ? null : "Falta configurar GEMINI_API_KEY en Vercel.";
  if (activeProvider !== "openai") return `Proveedor de visión no soportado: ${activeProvider}. Usá openai o gemini.`;
  const apiKey = environmentValue(process.env.OPENAI_API_KEY);
  if (!apiKey) return "Falta configurar OPENAI_API_KEY en Vercel.";
  const endpoint = environmentValue(process.env.VISION_API_URL) || DEFAULT_OPENAI_API_URL;
  if (endpoint === DEFAULT_OPENAI_API_URL && !/^sk-[A-Za-z0-9_-]+$/.test(apiKey)) return "OPENAI_API_KEY no parece una clave OpenAI válida. En Vercel reemplazá el token JWT por una clave que empiece con sk-.";
  return null;
}

export async function extractPlanWithVision(input: VisionInput): Promise<PlanInterpretation> {
  const configurationError = visionConfigurationError();
  if (configurationError) {
    if (configurationError.includes("OPENAI_API_KEY")) throw new Error(configurationError.includes("no parece") ? "VISION_API_KEY_INVALID_FORMAT" : "VISION_API_KEY_MISSING");
    if (configurationError.includes("GEMINI_API_KEY")) throw new Error("VISION_GEMINI_API_KEY_MISSING");
    throw new Error("VISION_PROVIDER_UNSUPPORTED");
  }
  if (provider() === "gemini") return extractWithGemini(input, environmentValue(process.env.GEMINI_API_KEY) as string);
  return extractWithOpenAI(input, environmentValue(process.env.OPENAI_API_KEY) as string);
}

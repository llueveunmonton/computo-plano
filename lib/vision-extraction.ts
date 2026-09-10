import "server-only";
import { interpretationSchema, visionJsonSchema } from "./plan-schema";
import type { PlanInterpretation } from "./plan";

const SYSTEM_INSTRUCTIONS = `Sos un perito en lectura de planos arquitectónicos de viviendas simples de una planta. Analizá solamente lo que se ve o está explícitamente acotado. Priorizá cotas legibles y unidades explícitas. Nunca calibres una foto redimensionada usando la escala impresa ni midas por píxeles con perspectiva. Las posiciones son evidencia visual, no mediciones. Usá null si falta un dato. Para cada dato incluí estado detectado, confirmado, supuesto o pendiente. No inventes alturas, materiales ni estructura. Devolvé ambientes, muros únicos, aberturas, cotas y evidencia breve. Si la imagen no es utilizable por desenfoque, orientación o perspectiva, indicá no_utilizable y dejá preguntas concretas.`;
const DEFAULT_VISION_API_URL = "https://api.openai.com/v1/responses";

function environmentValue(value: string | undefined) {
  return value?.trim().replace(/^("|')|("|')$/g, "") || null;
}

function extractText(response: any): string | null {
  if (typeof response?.output_text === "string") return response.output_text;
  const chunks = response?.output?.flatMap((item: any) => item?.content ?? []) ?? [];
  const text = chunks.map((chunk: any) => chunk?.text).filter((value: unknown): value is string => typeof value === "string").join("\n");
  return text || null;
}

export function visionIsConfigured() {
  return visionConfigurationError() === null;
}

export function visionConfigurationError() {
  const apiKey = environmentValue(process.env.OPENAI_API_KEY);
  if (!apiKey) return "Falta configurar OPENAI_API_KEY en Vercel.";
  const endpoint = environmentValue(process.env.VISION_API_URL) || DEFAULT_VISION_API_URL;
  if (endpoint === DEFAULT_VISION_API_URL && !/^sk-[A-Za-z0-9_-]+$/.test(apiKey)) return "OPENAI_API_KEY no parece una clave OpenAI válida. En Vercel reemplazá el token JWT por una clave que empiece con sk-.";
  return null;
}

export async function extractPlanWithVision(input: { bytes: Buffer; mimeType: string; fileName: string; selectedPage: number | null }): Promise<PlanInterpretation> {
  const apiKey = environmentValue(process.env.OPENAI_API_KEY);
  const configurationError = visionConfigurationError();
  if (!apiKey) throw new Error("VISION_API_KEY_MISSING");
  if (configurationError) throw new Error("VISION_API_KEY_INVALID_FORMAT");
  const model = environmentValue(process.env.VISION_MODEL) || "gpt-4.1-mini";
  const endpoint = environmentValue(process.env.VISION_API_URL) || DEFAULT_VISION_API_URL;
  const dataUrl = `data:${input.mimeType};base64,${input.bytes.toString("base64")}`;
  const isPdf = input.mimeType === "application/pdf";
  const media = isPdf
    ? { type: "input_file", filename: input.fileName, file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl, detail: "high" };
  const pageNote = isPdf ? `El archivo es PDF. Concentrate en la página seleccionada ${input.selectedPage ?? 1}; si no podés inspeccionarla, informalo en preguntas y no inventes datos.` : "La imagen puede haber sido rotada o recortada; evaluá orientación y perspectiva antes de extraer.";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: `${SYSTEM_INSTRUCTIONS}\n\n${pageNote}` }, media] }],
      temperature: 0,
      text: { format: { type: "json_schema", name: "plan_interpretation", strict: true, schema: visionJsonSchema } },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`VISION_PROVIDER_${response.status}: ${detail.slice(0, 300)}`);
  }
  const payload = await response.json();
  const text = extractText(payload);
  if (!text) throw new Error("VISION_EMPTY_RESPONSE");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("VISION_INVALID_JSON");
  }
  return interpretationSchema.parse(json);
}

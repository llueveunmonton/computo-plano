import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { extractPlanWithVision, visionIsConfigured } from "@/lib/vision-extraction";
import { listProjects, saveProject, uploadPath } from "@/lib/plan-storage";
import { rateLimited } from "@/lib/request-rate-limit";
import type { PlanProject } from "@/lib/plan";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const accepted = new Set(["image/jpeg", "image/png", "application/pdf"]);

function extractionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "VISION_API_KEY_MISSING") return "Falta configurar OPENAI_API_KEY en Vercel. No se puede analizar un archivo nuevo hasta configurarla.";
  if (message.startsWith("VISION_PROVIDER_401") || message.startsWith("VISION_PROVIDER_403")) return "OPENAI_API_KEY fue rechazada por el proveedor. En Vercel pegala sin comillas ni espacios y verificá que tenga acceso al modelo configurado.";
  if (message.startsWith("VISION_PROVIDER_429")) return "El proveedor rechazó la solicitud por límite o saldo insuficiente. Revisá la cuota de la cuenta de IA.";
  if (message === "VISION_INVALID_JSON") return "El proveedor devolvió una respuesta que no cumple el formato esperado.";
  if (message === "VISION_EMPTY_RESPONSE") return "La API no devolvió una interpretación utilizable.";
  return "No se pudo interpretar el plano. Revisá legibilidad, orientación y perspectiva, y probá otra imagen.";
}

export async function GET() {
  return NextResponse.json({ projects: await listProjects(), visionConfigured: visionIsConfigured() });
}

export async function POST(request: Request) {
  if (rateLimited(request)) return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto y reintentá." }, { status: 429 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Seleccioná un JPG, PNG o PDF." }, { status: 400 });
  if (!accepted.has(file.type)) return NextResponse.json({ error: "Formato no admitido. Usá JPG, PNG o PDF." }, { status: 415 });
  if (file.size === 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "El archivo debe pesar entre 1 byte y 15 MB." }, { status: 413 });
  if (!visionIsConfigured()) return NextResponse.json({ error: "Falta configurar OPENAI_API_KEY en el servidor. No se puede analizar un archivo nuevo hasta configurarla." }, { status: 503 });
  const selectedPageRaw = form.get("selectedPage");
  const selectedPage = file.type === "application/pdf" ? Math.max(1, Number(selectedPageRaw || 1)) : null;
  if (file.type === "application/pdf" && (selectedPage === null || !Number.isInteger(selectedPage) || selectedPage > 100)) return NextResponse.json({ error: "Indicá una página PDF válida entre 1 y 100." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const storedName = `${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  try {
    const interpretation = await extractPlanWithVision({ bytes, mimeType: file.type, fileName: file.name, selectedPage });
    const project: PlanProject = { id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), name: file.name.replace(/\.[^.]+$/, ""), originalFileName: file.name, fileType: file.type, filePath: `data/material-plans/uploads/${storedName}`, selectedPage, isDemo: false, extractionMode: "vision", interpretation, calculation: null };
    await (await import("node:fs/promises")).writeFile(uploadPath(storedName), bytes);
    await saveProject(project);
    return NextResponse.json({ project });
  } catch (error) {
    console.error("plan extraction failed", error);
    return NextResponse.json({ error: extractionErrorMessage(error) }, { status: 502 });
  }
}

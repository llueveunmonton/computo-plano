import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bathroomDemoInterpretation, calculateMaterials, type PlanProject } from "@/lib/plan";
import { saveProject } from "@/lib/plan-storage";
import { rateLimited } from "@/lib/request-rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (rateLimited(request)) return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto y reintentá." }, { status: 429 });
  const now = new Date().toISOString();
  const project: PlanProject = { id: randomUUID(), createdAt: now, updatedAt: now, name: "Baño demo · lectura completa", originalFileName: "monoambiente-demo.svg", fileType: "image/svg+xml", filePath: "public/demo/monoambiente-demo.svg", selectedPage: null, isDemo: true, extractionMode: "demo", interpretation: structuredClone(bathroomDemoInterpretation), calculation: calculateMaterials(bathroomDemoInterpretation, new Date(now)) };
  await saveProject(project);
  return NextResponse.json({ project });
}

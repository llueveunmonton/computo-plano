import { NextResponse } from "next/server";
import { calculateMaterials, type PlanProject } from "@/lib/plan";
import { interpretationSchema } from "@/lib/plan-schema";
import { getProject, saveProject } from "@/lib/plan-storage";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const storedProject = await getProject(id);
  try {
    const body = await request.json();
    const requestProject = body?.project && typeof body.project === "object" && body.project.id === id ? body.project as PlanProject : null;
    const project = storedProject ?? requestProject;
    if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    const interpretation = interpretationSchema.parse(body.interpretation);
    const calculation = calculateMaterials(interpretation);
    const updated = { ...project, interpretation, calculation, updatedAt: new Date().toISOString() };
    await saveProject(updated);
    return NextResponse.json({ project: updated });
  } catch {
    return NextResponse.json({ error: "No se pudo calcular: revisá los datos pendientes." }, { status: 400 });
  }
}

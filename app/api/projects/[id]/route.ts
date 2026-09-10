import { NextResponse } from "next/server";
import { interpretationSchema } from "@/lib/plan-schema";
import { getProject, saveProject } from "@/lib/plan-storage";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  return project ? NextResponse.json({ project }) : NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  try {
    const body = await request.json();
    const interpretation = interpretationSchema.parse(body.interpretation);
    const updated = { ...project, interpretation, calculation: null, updatedAt: new Date().toISOString() };
    await saveProject(updated);
    return NextResponse.json({ project: updated });
  } catch {
    return NextResponse.json({ error: "La interpretación editada no es válida." }, { status: 400 });
  }
}

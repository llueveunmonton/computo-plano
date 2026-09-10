import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlanProject } from "./plan";

// El filesystem del proyecto es escribible en desarrollo/local. En Vercel sólo
// /tmp permite escrituras, con duración limitada a la vida de la instancia.
const root = process.env.VERCEL ? path.join("/tmp", "material-plans") : path.join(process.cwd(), "data", "material-plans");
const uploads = path.join(root, "uploads");
const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function ensurePlanStorage() {
  await mkdir(uploads, { recursive: true });
}

export function uploadPath(fileName: string) {
  return path.join(uploads, fileName);
}

export function projectPath(id: string) {
  if (!projectIdPattern.test(id)) throw new Error("INVALID_PROJECT_ID");
  return path.join(root, `${id}.json`);
}

export async function saveProject(project: PlanProject) {
  await ensurePlanStorage();
  const destination = projectPath(project.id);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(project, null, 2), "utf8");
  await rename(temporary, destination);
  return project;
}

export async function getProject(id: string) {
  try {
    return JSON.parse(await readFile(projectPath(id), "utf8")) as PlanProject;
  } catch {
    return null;
  }
}

export async function listProjects() {
  await ensurePlanStorage();
  const files = (await readdir(root)).filter((file) => file.endsWith(".json"));
  const projects = (await Promise.all(files.map(async (file) => {
    try {
      return JSON.parse(await readFile(path.join(root, file), "utf8")) as PlanProject;
    } catch {
      return null;
    }
  }))).filter((project): project is PlanProject => project !== null);
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

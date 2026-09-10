import { z } from "zod";

const nullableNumber = z.number().finite().positive().nullable();
const status = z.enum(["detectado", "confirmado", "supuesto", "pendiente"]);

export const evidenceSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  description: z.string().min(1).max(500),
  region: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable().optional(),
});

export const openingSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["puerta", "ventana", "otro"]),
  widthM: nullableNumber,
  heightM: nullableNumber,
  quantity: z.number().int().positive().max(100),
  state: status,
  evidenceId: z.string().nullable(),
});

export const roomSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  widthM: nullableNumber,
  lengthM: nullableNumber,
  areaM2: nullableNumber,
  state: status,
  evidenceId: z.string().nullable(),
});

export const wallSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  lengthM: nullableNumber,
  heightM: nullableNumber,
  thicknessM: nullableNumber,
  paintLeft: z.boolean(),
  paintRight: z.boolean(),
  state: status,
  evidenceId: z.string().nullable(),
  openings: z.array(openingSchema).max(100),
});

export const interpretationSchema = z.object({
  orientation: z.enum(["válida", "incierta", "no_utilizable"]),
  perspective: z.enum(["corregida", "plana", "incierta"]),
  rooms: z.array(roomSchema).max(100),
  walls: z.array(wallSchema).max(500),
  evidence: z.array(evidenceSchema).max(500),
  unknowns: z.array(z.string().max(500)).max(100),
  questions: z.array(z.string().max(500)).max(100),
  settings: z.object({
    wallHeightM: nullableNumber,
    floorMaterial: z.string().min(1).max(120),
    floorCoverageM2PerBox: nullableNumber,
    floorWastePercent: z.number().finite().min(0).max(100),
    brickMaterial: z.string().min(1).max(120),
    bricksPerM2: nullableNumber,
    brickWastePercent: z.number().finite().min(0).max(100),
    paintMaterial: z.string().min(1).max(120),
    paintCoverageM2PerL: nullableNumber,
    paintCoats: nullableNumber,
    paintWastePercent: z.number().finite().min(0).max(100),
  }),
});

export type ValidatedInterpretation = z.infer<typeof interpretationSchema>;

export const visionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["orientation", "perspective", "rooms", "walls", "evidence", "unknowns", "questions", "settings"],
  properties: {
    orientation: { type: "string", enum: ["válida", "incierta", "no_utilizable"] },
    perspective: { type: "string", enum: ["corregida", "plana", "incierta"] },
    rooms: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "name", "widthM", "lengthM", "areaM2", "state", "evidenceId"], properties: { id: { type: "string" }, name: { type: "string" }, widthM: { type: ["number", "null"] }, lengthM: { type: ["number", "null"] }, areaM2: { type: ["number", "null"] }, state: { type: "string", enum: ["detectado", "confirmado", "supuesto", "pendiente"] }, evidenceId: { type: ["string", "null"] } } } },
    walls: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "lengthM", "heightM", "thicknessM", "paintLeft", "paintRight", "state", "evidenceId", "openings"], properties: { id: { type: "string" }, label: { type: "string" }, lengthM: { type: ["number", "null"] }, heightM: { type: ["number", "null"] }, thicknessM: { type: ["number", "null"] }, paintLeft: { type: "boolean" }, paintRight: { type: "boolean" }, state: { type: "string", enum: ["detectado", "confirmado", "supuesto", "pendiente"] }, evidenceId: { type: ["string", "null"] }, openings: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type", "widthM", "heightM", "quantity", "state", "evidenceId"], properties: { id: { type: "string" }, type: { type: "string", enum: ["puerta", "ventana", "otro"] }, widthM: { type: ["number", "null"] }, heightM: { type: ["number", "null"] }, quantity: { type: "integer" }, state: { type: "string", enum: ["detectado", "confirmado", "supuesto", "pendiente"] }, evidenceId: { type: ["string", "null"] } } } } } } },
    evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "description", "region"], properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, region: { type: ["object", "null"], additionalProperties: false, required: ["x", "y", "width", "height"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } } } } },
    unknowns: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    settings: { type: "object", additionalProperties: false, required: ["wallHeightM", "floorMaterial", "floorCoverageM2PerBox", "floorWastePercent", "brickMaterial", "bricksPerM2", "brickWastePercent", "paintMaterial", "paintCoverageM2PerL", "paintCoats", "paintWastePercent"], properties: { wallHeightM: { type: ["number", "null"] }, floorMaterial: { type: "string" }, floorCoverageM2PerBox: { type: ["number", "null"] }, floorWastePercent: { type: "number" }, brickMaterial: { type: "string" }, bricksPerM2: { type: ["number", "null"] }, brickWastePercent: { type: "number" }, paintMaterial: { type: "string" }, paintCoverageM2PerL: { type: ["number", "null"] }, paintCoats: { type: ["number", "null"] }, paintWastePercent: { type: "number" } } },
  },
} as const;

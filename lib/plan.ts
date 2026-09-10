export type DataStatus = "detectado" | "confirmado" | "supuesto" | "pendiente";

export type Evidence = {
  id: string;
  label: string;
  description: string;
  region?: { x: number; y: number; width: number; height: number } | null;
};

export type Opening = {
  id: string;
  type: "puerta" | "ventana" | "otro";
  widthM: number | null;
  heightM: number | null;
  quantity: number;
  state: DataStatus;
  evidenceId: string | null;
};

export type Room = {
  id: string;
  name: string;
  widthM: number | null;
  lengthM: number | null;
  areaM2: number | null;
  state: DataStatus;
  evidenceId: string | null;
};

export type Wall = {
  id: string;
  label: string;
  lengthM: number | null;
  heightM: number | null;
  thicknessM: number | null;
  paintLeft: boolean;
  paintRight: boolean;
  state: DataStatus;
  evidenceId: string | null;
  openings: Opening[];
};

export type MaterialSettings = {
  wallHeightM: number | null;
  floorMaterial: string;
  floorCoverageM2PerBox: number | null;
  floorWastePercent: number;
  brickMaterial: string;
  bricksPerM2: number | null;
  brickWastePercent: number;
  paintMaterial: string;
  paintCoverageM2PerL: number | null;
  paintCoats: number | null;
  paintWastePercent: number;
};

export type PlanInterpretation = {
  orientation: "válida" | "incierta" | "no_utilizable";
  perspective: "corregida" | "plana" | "incierta";
  rooms: Room[];
  walls: Wall[];
  evidence: Evidence[];
  unknowns: string[];
  questions: string[];
  settings: MaterialSettings;
};

export type PlanProject = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  originalFileName: string;
  fileType: string;
  filePath: string;
  selectedPage: number | null;
  isDemo: boolean;
  extractionMode: "vision" | "demo";
  interpretation: PlanInterpretation;
  calculation: CalculationResult | null;
};

export type CalculationLine = {
  id: string;
  material: string;
  quantity: number | null;
  unit: "m²" | "cajas" | "unidades" | "litros";
  formula: string;
  sourceIds: string[];
  assumptions: string[];
  status: "completo" | "parcial" | "pendiente";
};

export type CalculationResult = {
  calculatedAt: string;
  lines: CalculationLine[];
  totals: { floorAreaM2: number | null; masonryAreaM2: number | null; paintAreaM2: number | null };
  warnings: string[];
};

const round = (value: number) => Math.round(value * 100) / 100;

function openingArea(opening: Opening) {
  if (opening.widthM === null || opening.heightM === null) return null;
  return opening.widthM * opening.heightM * opening.quantity;
}

export function calculateMaterials(input: PlanInterpretation, now = new Date()): CalculationResult {
  const warnings = [...input.unknowns];
  const floorAreas = input.rooms.map((room) => {
    if (room.areaM2 !== null) return room.areaM2;
    if (room.widthM !== null && room.lengthM !== null) return room.widthM * room.lengthM;
    return null;
  });
  const floorAreaM2 = floorAreas.every((value) => value !== null) ? round(floorAreas.reduce((sum, value) => sum + (value ?? 0), 0)) : null;
  if (floorAreaM2 === null) warnings.push("Faltan dimensiones de uno o más ambientes para cerrar pisos/cerámicos.");

  const brickWalls = input.walls.filter((wall) => wall.lengthM !== null && (wall.heightM ?? input.settings.wallHeightM) !== null);
  const masonryParts = brickWalls.map((wall) => {
    const height = wall.heightM ?? input.settings.wallHeightM;
    if (wall.lengthM === null || height === null) return null;
    const openings = wall.openings.map(openingArea);
    if (openings.some((value) => value === null)) return null;
    return wall.lengthM * height - openings.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  });
  const masonryIncomplete = brickWalls.length !== input.walls.length;
  const masonryAreaM2 = masonryParts.length ? round(masonryParts.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  if (masonryIncomplete || masonryParts.some((value) => value === null)) warnings.push("Hay muros o aberturas sin dimensiones: mampostería parcial.");

  const paintParts = input.walls.flatMap((wall) => {
    const height = wall.heightM ?? input.settings.wallHeightM;
    const selectedFaces = Number(wall.paintLeft) + Number(wall.paintRight);
    if (!selectedFaces || wall.lengthM === null || height === null) return [];
    const openings = wall.openings.map(openingArea);
    if (openings.some((value) => value === null)) return [null];
    return [wall.lengthM * height * selectedFaces - openings.reduce<number>((sum, value) => sum + (value ?? 0), 0)];
  });
  const paintAreaM2 = paintParts.length && paintParts.every((value) => value !== null)
    ? round(paintParts.reduce<number>((sum, value) => sum + (value ?? 0), 0))
    : paintParts.length ? round(paintParts.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  if (paintParts.some((value) => value === null)) warnings.push("Hay aberturas sin dimensiones en caras seleccionadas: pintura parcial.");

  const floorQuantity = floorAreaM2 !== null && input.settings.floorCoverageM2PerBox !== null
    ? Math.ceil((floorAreaM2 * (1 + input.settings.floorWastePercent / 100)) / input.settings.floorCoverageM2PerBox)
    : null;
  const brickQuantity = masonryAreaM2 !== null && input.settings.bricksPerM2 !== null
    ? Math.ceil(masonryAreaM2 * input.settings.bricksPerM2 * (1 + input.settings.brickWastePercent / 100))
    : null;
  const paintQuantity = paintAreaM2 !== null && input.settings.paintCoverageM2PerL !== null && input.settings.paintCoats !== null
    ? round((paintAreaM2 * input.settings.paintCoats * (1 + input.settings.paintWastePercent / 100)) / input.settings.paintCoverageM2PerL)
    : null;

  return {
    calculatedAt: now.toISOString(),
    totals: { floorAreaM2, masonryAreaM2, paintAreaM2 },
    warnings: [...new Set(warnings)],
    lines: [
      {
        id: "floor",
        material: input.settings.floorMaterial,
        quantity: floorQuantity,
        unit: "cajas",
        formula: "ceil(área de pisos × (1 + desperdicio) ÷ rendimiento por caja)",
        sourceIds: input.rooms.map((room) => room.id),
        assumptions: [`Desperdicio editable: ${input.settings.floorWastePercent}%`, `Rendimiento: ${input.settings.floorCoverageM2PerBox ?? "pendiente"} m²/caja`],
        status: floorQuantity === null ? "pendiente" : floorAreaM2 === null ? "parcial" : "completo",
      },
      {
        id: "brick",
        material: input.settings.brickMaterial,
        quantity: brickQuantity,
        unit: "unidades",
        formula: "ceil(Σ(muro × altura − aberturas) × ladrillos/m² × (1 + desperdicio))",
        sourceIds: input.walls.map((wall) => wall.id),
        assumptions: [`Muros contados una sola vez`, `Desperdicio editable: ${input.settings.brickWastePercent}%`, `Aberturas descontadas cuando tienen ancho y alto`],
        status: brickQuantity === null ? "pendiente" : masonryIncomplete || masonryParts.some((value) => value === null) ? "parcial" : "completo",
      },
      {
        id: "paint",
        material: input.settings.paintMaterial,
        quantity: paintQuantity,
        unit: "litros",
        formula: "área de caras seleccionadas − aberturas × manos × (1 + desperdicio) ÷ rendimiento",
        sourceIds: input.walls.filter((wall) => wall.paintLeft || wall.paintRight).map((wall) => wall.id),
        assumptions: [`Caras seleccionadas: izquierda/derecha por muro`, `Manos: ${input.settings.paintCoats ?? "pendiente"}`, `Desperdicio editable: ${input.settings.paintWastePercent}%`],
        status: paintQuantity === null ? "pendiente" : paintParts.some((value) => value === null) ? "parcial" : "completo",
      },
    ],
  };
}

export const demoInterpretation: PlanInterpretation = {
  orientation: "válida",
  perspective: "plana",
  rooms: [
    { id: "room-estar", name: "Estar-comedor", widthM: 4, lengthM: 5, areaM2: null, state: "confirmado", evidenceId: "ev-cota-1" },
    { id: "room-dorm", name: "Dormitorio", widthM: 3, lengthM: 3, areaM2: null, state: "confirmado", evidenceId: "ev-cota-2" },
  ],
  walls: [
    { id: "wall-exterior-1", label: "Muro exterior norte", lengthM: 5, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: true, state: "detectado", evidenceId: "ev-muro-1", openings: [{ id: "door-1", type: "puerta", widthM: 0.9, heightM: 2.1, quantity: 1, state: "confirmado", evidenceId: "ev-puerta" }] },
    { id: "wall-interior-1", label: "Tabique dormitorio", lengthM: 3, heightM: null, thicknessM: 0.12, paintLeft: true, paintRight: true, state: "detectado", evidenceId: "ev-muro-2", openings: [] },
  ],
  evidence: [
    { id: "ev-cota-1", label: "Cota 5,00 m", description: "Cota explícita leída junto al estar.", region: { x: 0.13, y: 0.27, width: 0.34, height: 0.06 } },
    { id: "ev-cota-2", label: "Cota 3,00 m", description: "Cota explícita leída junto al dormitorio.", region: { x: 0.58, y: 0.55, width: 0.22, height: 0.06 } },
    { id: "ev-muro-1", label: "Muro recto", description: "Trazo continuo, posición propuesta; no usado como medición por píxel.", region: { x: 0.1, y: 0.19, width: 0.78, height: 0.04 } },
    { id: "ev-muro-2", label: "Tabique", description: "Muro interior identificado por continuidad del trazo.", region: { x: 0.5, y: 0.2, width: 0.03, height: 0.58 } },
    { id: "ev-puerta", label: "Abertura 0,90 × 2,10 m", description: "Símbolo de puerta y medida legible.", region: { x: 0.43, y: 0.17, width: 0.09, height: 0.1 } },
  ],
  unknowns: ["La altura de muro no aparece explícita en el plano; el ejemplo usa 2,60 m como supuesto editable."],
  questions: ["Confirmá altura terminada de muros."],
  settings: {
    wallHeightM: 2.6,
    floorMaterial: "Cerámico 45×45 cm",
    floorCoverageM2PerBox: 1.98,
    floorWastePercent: 10,
    brickMaterial: "Ladrillo cerámico hueco 18×18×33",
    bricksPerM2: 16.5,
    brickWastePercent: 7,
    paintMaterial: "Pintura látex interior",
    paintCoverageM2PerL: 10,
    paintCoats: 2,
    paintWastePercent: 10,
  },
};

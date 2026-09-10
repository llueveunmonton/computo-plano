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

const isPositive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;

function openingArea(opening: Opening) {
  if (!isPositive(opening.widthM) || !isPositive(opening.heightM) || !Number.isInteger(opening.quantity) || opening.quantity <= 0) return null;
  return opening.widthM * opening.heightM * opening.quantity;
}

export function calculateMaterials(input: PlanInterpretation, now = new Date()): CalculationResult {
  const warnings = [...input.unknowns];
  const floorAreas = input.rooms.map((room) => {
    if (isPositive(room.widthM) && isPositive(room.lengthM)) return room.widthM * room.lengthM;
    if (isPositive(room.areaM2)) return room.areaM2;
    return null;
  });
  const floorAreaM2 = floorAreas.every((value) => value !== null) ? round(floorAreas.reduce((sum, value) => sum + (value ?? 0), 0)) : null;
  if (floorAreaM2 === null) warnings.push("Faltan dimensiones de uno o más ambientes para cerrar pisos/cerámicos.");

  const invalidOpeningWalls = new Set<string>();
  const brickWalls = input.walls.filter((wall) => isPositive(wall.lengthM) && isPositive(wall.heightM ?? input.settings.wallHeightM));
  const masonryParts = brickWalls.map((wall) => {
    const height = wall.heightM ?? input.settings.wallHeightM;
    if (!isPositive(wall.lengthM) || !isPositive(height)) return null;
    const openings = wall.openings.map(openingArea);
    const grossArea = wall.lengthM * height;
    const openingTotal = openings.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (openingTotal > grossArea) invalidOpeningWalls.add(wall.id);
    if (openings.some((value) => value === null) || openingTotal > grossArea) {
      return null;
    }
    return grossArea - openingTotal;
  });
  const masonryIncomplete = brickWalls.length !== input.walls.length;
  const masonryAreaM2 = masonryParts.length ? round(masonryParts.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  if (masonryIncomplete || masonryParts.some((value) => value === null)) warnings.push("Hay muros o aberturas sin dimensiones: mampostería parcial.");
  if (invalidOpeningWalls.size) warnings.push("Hay aberturas inválidas o mayores que el muro: mampostería y pintura parciales.");
  if (input.rooms.length === 1 && isPositive(input.rooms[0].widthM) && isPositive(input.rooms[0].lengthM)) {
    const expectedPerimeter = 2 * (input.rooms[0].widthM + input.rooms[0].lengthM);
    const measuredPerimeter = input.walls.reduce((sum, wall) => sum + (isPositive(wall.lengthM) ? wall.lengthM : 0), 0);
    if (Math.abs(measuredPerimeter - expectedPerimeter) > 0.05) warnings.push("La suma de longitudes de muros no coincide con el perímetro del ambiente; revisá muros faltantes o duplicados.");
  }

  const paintParts = input.walls.flatMap((wall) => {
    const height = wall.heightM ?? input.settings.wallHeightM;
    const selectedFaces = Number(wall.paintLeft) + Number(wall.paintRight);
    if (!selectedFaces || !isPositive(wall.lengthM) || !isPositive(height)) return [];
    const openings = wall.openings.map(openingArea);
    const grossArea = wall.lengthM * height;
    const openingTotal = openings.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (openingTotal > grossArea) invalidOpeningWalls.add(wall.id);
    if (openings.some((value) => value === null) || openingTotal > grossArea) {
      return [null];
    }
    return [(grossArea - openingTotal) * selectedFaces];
  });
  const paintAreaM2 = paintParts.length && paintParts.every((value) => value !== null)
    ? round(paintParts.reduce<number>((sum, value) => sum + (value ?? 0), 0))
    : paintParts.length ? round(paintParts.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  if (paintParts.some((value) => value === null)) warnings.push("Hay aberturas sin dimensiones en caras seleccionadas: pintura parcial.");

  const floorQuantity = floorAreaM2 !== null && isPositive(input.settings.floorCoverageM2PerBox)
    ? Math.ceil((floorAreaM2 * (1 + input.settings.floorWastePercent / 100)) / input.settings.floorCoverageM2PerBox)
    : null;
  const brickQuantity = masonryAreaM2 !== null && isPositive(input.settings.bricksPerM2)
    ? Math.ceil(masonryAreaM2 * input.settings.bricksPerM2 * (1 + input.settings.brickWastePercent / 100))
    : null;
  const paintQuantity = paintAreaM2 !== null && isPositive(input.settings.paintCoverageM2PerL) && isPositive(input.settings.paintCoats)
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
  rooms: [{ id: "room-mono", name: "Monoambiente", widthM: 4, lengthM: 5, areaM2: null, state: "confirmado", evidenceId: "ev-room" }],
  walls: [
    { id: "wall-norte", label: "Muro norte", lengthM: 5, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "ev-wall-norte", openings: [{ id: "door-1", type: "puerta", widthM: 0.9, heightM: 2.1, quantity: 1, state: "confirmado", evidenceId: "ev-puerta" }] },
    { id: "wall-este", label: "Muro este", lengthM: 4, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "ev-wall-este", openings: [{ id: "window-1", type: "ventana", widthM: 1.2, heightM: 1, quantity: 1, state: "confirmado", evidenceId: "ev-ventana" }] },
    { id: "wall-sur", label: "Muro sur", lengthM: 5, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "ev-wall-sur", openings: [] },
    { id: "wall-oeste", label: "Muro oeste", lengthM: 4, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "ev-wall-oeste", openings: [] },
  ],
  evidence: [
    { id: "ev-room", label: "Ambiente único", description: "Un recinto rectangular rotulado como monoambiente.", region: { x: 0.14, y: 0.16, width: 0.72, height: 0.65 } },
    { id: "ev-cota-largo", label: "Cota 5,00 m", description: "Cota explícita del lado largo.", region: { x: 0.38, y: 0.88, width: 0.24, height: 0.06 } },
    { id: "ev-cota-ancho", label: "Cota 4,00 m", description: "Cota explícita del lado corto.", region: { x: 0.04, y: 0.43, width: 0.08, height: 0.16 } },
    { id: "ev-wall-norte", label: "Muro norte", description: "Límite superior del recinto.", region: { x: 0.14, y: 0.16, width: 0.72, height: 0.02 } },
    { id: "ev-wall-este", label: "Muro este", description: "Límite derecho del recinto.", region: { x: 0.85, y: 0.16, width: 0.02, height: 0.65 } },
    { id: "ev-wall-sur", label: "Muro sur", description: "Límite inferior del recinto.", region: { x: 0.14, y: 0.79, width: 0.72, height: 0.02 } },
    { id: "ev-wall-oeste", label: "Muro oeste", description: "Límite izquierdo del recinto.", region: { x: 0.14, y: 0.16, width: 0.02, height: 0.65 } },
    { id: "ev-puerta", label: "Puerta 0,90 × 2,10 m", description: "Abertura rotulada en el muro norte.", region: { x: 0.33, y: 0.14, width: 0.1, height: 0.08 } },
    { id: "ev-ventana", label: "Ventana 1,20 × 1,00 m", description: "Abertura rotulada en el muro este.", region: { x: 0.84, y: 0.34, width: 0.08, height: 0.18 } },
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

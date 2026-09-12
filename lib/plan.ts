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

export type FixtureType =
  | "inodoro"
  | "lavatorio"
  | "bidet"
  | "ducha"
  | "bañera"
  | "canilla_lavatorio"
  | "mezcladora_ducha"
  | "duchador"
  | "extractor"
  | "luminaria"
  | "tomacorriente"
  | "interruptor"
  | "rejilla";

export type Fixture = {
  id: string;
  type: FixtureType;
  label: string;
  quantity: number;
  state: DataStatus;
  evidenceId: string | null;
};

export type InstallationRun = {
  id: string;
  kind: "agua_fria" | "agua_caliente" | "desague" | "iluminacion" | "toma" | "tierra" | "corrugado";
  lengthM: number | null;
  quantity: number;
  diameter?: string | null;
  state: DataStatus;
  evidenceId: string | null;
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
  wallTileCoverageM2PerBox?: number | null;
  wallTileWastePercent?: number | null;
  adhesiveKgPerM2?: number | null;
  groutKgPerM2?: number | null;
  waterproofingKgPerM2?: number | null;
  sanitaryTemplateM?: number | null;
  electricalTemplateM?: number | null;
  sanitaryWastePercent?: number | null;
  electricalWastePercent?: number | null;
  installationMode?: "plantilla" | "manual" | "plano_sanitario" | "plano_electrico";
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
  fixtures?: Fixture[];
  installationRuns?: InstallationRun[];
  bathroomStatus?: "probable" | "incierto" | "no_baño";
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
  unit: "m²" | "cajas" | "unidades" | "litros" | "kg" | "m";
  formula: string;
  sourceIds: string[];
  assumptions: string[];
  status: "completo" | "parcial" | "pendiente";
  category: "terminaciones" | "sanitaria" | "electrica" | "artefactos";
  confidence: DataStatus;
  sourceLabel: string;
  wastePercent: number | null;
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

  const legacyLines: CalculationLine[] = [
    {
      id: "floor",
      material: input.settings.floorMaterial,
      quantity: floorQuantity,
      unit: "cajas",
      formula: "ceil(área de pisos × (1 + desperdicio) ÷ rendimiento por caja)",
      sourceIds: input.rooms.map((room) => room.id),
      assumptions: [`Desperdicio editable: ${input.settings.floorWastePercent}%`, `Rendimiento: ${input.settings.floorCoverageM2PerBox ?? "pendiente"} m²/caja`],
      status: floorQuantity === null ? "pendiente" : floorAreaM2 === null ? "parcial" : "completo",
      category: "terminaciones",
      confidence: input.rooms.every((room) => room.state === "confirmado") ? "confirmado" : "detectado",
      sourceLabel: "Cotas y fórmula",
      wastePercent: input.settings.floorWastePercent,
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
      category: "terminaciones",
      confidence: masonryIncomplete ? "pendiente" : "detectado",
      sourceLabel: "Muros detectados y fórmula",
      wastePercent: input.settings.brickWastePercent,
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
      category: "terminaciones",
      confidence: paintParts.some((value) => value === null) ? "pendiente" : "detectado",
      sourceLabel: "Muros, aberturas y fórmula",
      wastePercent: input.settings.paintWastePercent,
    },
  ];

  // El contrato anterior sigue sirviendo para proyectos guardados. Los planos
  // nuevos de baño agregan sus recorridos y artefactos y reciben un cómputo
  // específico sin mezclar interpretación con matemática.
  const isBathroom = Boolean(input.bathroomStatus === "probable" || input.fixtures?.length || input.installationRuns?.length);
  if (!isBathroom) {
    return { calculatedAt: now.toISOString(), totals: { floorAreaM2, masonryAreaM2, paintAreaM2 }, warnings: [...new Set(warnings)], lines: legacyLines };
  }

  const settings = input.settings;
  const wallTileWaste = settings.wallTileWastePercent ?? settings.brickWastePercent;
  const wallTileCoverage = settings.wallTileCoverageM2PerBox ?? null;
  const wallTileQuantity = masonryAreaM2 !== null && isPositive(wallTileCoverage)
    ? Math.ceil((masonryAreaM2 * (1 + wallTileWaste / 100)) / wallTileCoverage)
    : null;
  const adhesiveQuantity = masonryAreaM2 !== null && isPositive(settings.adhesiveKgPerM2 ?? null)
    ? round(masonryAreaM2 * (settings.adhesiveKgPerM2 ?? 0) * (1 + wallTileWaste / 100))
    : null;
  const groutQuantity = masonryAreaM2 !== null && isPositive(settings.groutKgPerM2 ?? null)
    ? round(masonryAreaM2 * (settings.groutKgPerM2 ?? 0) * (1 + wallTileWaste / 100))
    : null;
  const waterproofingQuantity = floorAreaM2 !== null && isPositive(settings.waterproofingKgPerM2 ?? null)
    ? round(floorAreaM2 * (settings.waterproofingKgPerM2 ?? 0) * 1.1)
    : null;
  const runs = input.installationRuns ?? [];
  const runTotal = (kind: InstallationRun["kind"]) => {
    const matching = runs.filter((run) => run.kind === kind);
    if (!matching.length) return { quantity: 0, complete: true, ids: [] as string[] };
    const complete = matching.every((run) => isPositive(run.lengthM));
    return { quantity: matching.reduce((sum, run) => sum + (run.lengthM ?? 0) * run.quantity, 0), complete, ids: matching.map((run) => run.id) };
  };
  const sanitaryTemplate = settings.installationMode === "plantilla" ? settings.sanitaryTemplateM ?? null : null;
  const electricalTemplate = settings.installationMode === "plantilla" ? settings.electricalTemplateM ?? null : null;
  const manualSanitary = settings.installationMode !== "plantilla" && settings.sanitaryTemplateM !== null && settings.sanitaryTemplateM !== undefined;
  const manualElectrical = settings.installationMode !== "plantilla" && settings.electricalTemplateM !== null && settings.electricalTemplateM !== undefined;
  const sanitaryLength = runTotal("agua_fria");
  const hotLength = runTotal("agua_caliente");
  const drainLength = runTotal("desague");
  const lightLength = runTotal("iluminacion");
  const outletLength = runTotal("toma");
  const groundLength = runTotal("tierra");
  const conduitLength = runTotal("corrugado");
  const estimatedSanitary = sanitaryLength.quantity + hotLength.quantity + drainLength.quantity === 0 && sanitaryTemplate !== null;
  const estimatedElectrical = lightLength.quantity + outletLength.quantity + groundLength.quantity === 0 && electricalTemplate !== null;
  const sanitaryBase = estimatedSanitary ? sanitaryTemplate : manualSanitary ? settings.sanitaryTemplateM ?? null : sanitaryLength.quantity + hotLength.quantity + drainLength.quantity;
  const electricalBase = estimatedElectrical ? electricalTemplate : manualElectrical ? settings.electricalTemplateM ?? null : lightLength.quantity + outletLength.quantity + groundLength.quantity;
  const corrugatedBase = conduitLength.quantity || electricalBase;
  if (estimatedSanitary || estimatedElectrical) warnings.push("Los recorridos sin plano se calcularon con una plantilla estándar: requieren validación.");
  if (runs.some((run) => !isPositive(run.lengthM) && !["plantilla", "plano_sanitario", "plano_electrico"].includes(settings.installationMode ?? "plantilla"))) warnings.push("Hay recorridos manuales sin longitud: instalación parcial.");
  const fixtureLines: CalculationLine[] = (input.fixtures ?? []).map((fixture) => ({
    id: `fixture-${fixture.id}`,
    material: fixture.label,
    quantity: fixture.quantity,
    unit: "unidades",
    formula: "cantidad confirmada o detectada en el plano",
    sourceIds: fixture.evidenceId ? [fixture.evidenceId] : [fixture.id],
    assumptions: [fixture.state === "supuesto" || fixture.state === "pendiente" ? "Requiere confirmación" : "Elemento del plano"],
    status: fixture.state === "pendiente" ? "pendiente" : "completo",
    category: "artefactos",
    confidence: fixture.state,
    sourceLabel: fixture.evidenceId ? "Plano / evidencia" : "Carga manual",
    wastePercent: null,
  }));
  const bathroomLines: CalculationLine[] = [
    legacyLines[0],
    { id: "wall-tile", material: "Revestimiento cerámico de paredes", quantity: wallTileQuantity, unit: "cajas", formula: "ceil(paredes netas × (1 + desperdicio) ÷ m² por caja)", sourceIds: input.walls.map((wall) => wall.id), assumptions: [`Paredes netas: ${masonryAreaM2 ?? "pendiente"} m²`, `Desperdicio: ${wallTileWaste}%`, `Rendimiento: ${wallTileCoverage ?? "pendiente"} m²/caja`], status: wallTileQuantity === null ? "pendiente" : "completo", category: "terminaciones", confidence: masonryAreaM2 === null ? "pendiente" : "detectado", sourceLabel: "Muros, aberturas y fórmula", wastePercent: wallTileWaste },
    { id: "adhesive", material: "Adhesivo para cerámicos", quantity: adhesiveQuantity, unit: "kg", formula: "paredes netas × consumo por m² × (1 + desperdicio)", sourceIds: input.walls.map((wall) => wall.id), assumptions: [`Consumo: ${settings.adhesiveKgPerM2 ?? "pendiente"} kg/m²`], status: adhesiveQuantity === null ? "pendiente" : "completo", category: "terminaciones", confidence: adhesiveQuantity === null ? "pendiente" : "supuesto", sourceLabel: "Ficha editable y fórmula", wastePercent: wallTileWaste },
    { id: "grout", material: "Pastina", quantity: groutQuantity, unit: "kg", formula: "paredes netas × consumo por m² × (1 + desperdicio)", sourceIds: input.walls.map((wall) => wall.id), assumptions: [`Consumo: ${settings.groutKgPerM2 ?? "pendiente"} kg/m²`], status: groutQuantity === null ? "pendiente" : "completo", category: "terminaciones", confidence: groutQuantity === null ? "pendiente" : "supuesto", sourceLabel: "Ficha editable y fórmula", wastePercent: wallTileWaste },
    { id: "waterproofing", material: "Impermeabilizante de piso", quantity: waterproofingQuantity, unit: "kg", formula: "piso neto × consumo × (1 + 10%)", sourceIds: input.rooms.map((room) => room.id), assumptions: [`Consumo: ${settings.waterproofingKgPerM2 ?? "pendiente"} kg/m²`], status: waterproofingQuantity === null ? "pendiente" : "completo", category: "terminaciones", confidence: waterproofingQuantity === null ? "pendiente" : "supuesto", sourceLabel: "Área de piso y fórmula", wastePercent: 10 },
    { id: "cold-water", material: "Caño de agua fría", quantity: sanitaryBase ? round((estimatedSanitary || manualSanitary ? sanitaryBase / 3 : sanitaryLength.quantity) * (1 + (settings.sanitaryWastePercent ?? 10) / 100)) : null, unit: "m", formula: "recorrido de agua fría + reserva", sourceIds: sanitaryLength.ids, assumptions: [estimatedSanitary ? "Plantilla estándar" : manualSanitary ? "Carga manual" : "Recorrido del plano", `Reserva: ${settings.sanitaryWastePercent ?? 10}%`], status: sanitaryBase ? "completo" : "pendiente", category: "sanitaria", confidence: estimatedSanitary ? "supuesto" : manualSanitary ? "confirmado" : sanitaryLength.complete ? "detectado" : "pendiente", sourceLabel: estimatedSanitary ? "Plantilla editable" : manualSanitary ? "Carga manual" : "Plano sanitario / carga", wastePercent: settings.sanitaryWastePercent ?? 10 },
    { id: "hot-water", material: "Caño de agua caliente", quantity: sanitaryBase ? round((estimatedSanitary || manualSanitary ? sanitaryBase / 3 : hotLength.quantity) * (1 + (settings.sanitaryWastePercent ?? 10) / 100)) : null, unit: "m", formula: "recorrido de agua caliente + reserva", sourceIds: hotLength.ids, assumptions: [estimatedSanitary ? "Plantilla estándar" : manualSanitary ? "Carga manual" : "Recorrido del plano"], status: sanitaryBase ? "completo" : "pendiente", category: "sanitaria", confidence: estimatedSanitary ? "supuesto" : manualSanitary ? "confirmado" : hotLength.complete ? "detectado" : "pendiente", sourceLabel: estimatedSanitary ? "Plantilla editable" : manualSanitary ? "Carga manual" : "Plano sanitario / carga", wastePercent: settings.sanitaryWastePercent ?? 10 },
    { id: "drain", material: "Caño de desagüe", quantity: sanitaryBase ? round((estimatedSanitary || manualSanitary ? sanitaryBase / 3 : drainLength.quantity) * (1 + (settings.sanitaryWastePercent ?? 10) / 100)) : null, unit: "m", formula: "recorrido de desagüe + reserva", sourceIds: drainLength.ids, assumptions: [estimatedSanitary ? "Plantilla estándar" : manualSanitary ? "Carga manual" : "Recorrido del plano"], status: sanitaryBase ? "completo" : "pendiente", category: "sanitaria", confidence: estimatedSanitary ? "supuesto" : manualSanitary ? "confirmado" : drainLength.complete ? "detectado" : "pendiente", sourceLabel: estimatedSanitary ? "Plantilla editable" : manualSanitary ? "Carga manual" : "Plano sanitario / carga", wastePercent: settings.sanitaryWastePercent ?? 10 },
    { id: "electrical-cable", material: "Cable eléctrico (conductores)", quantity: electricalBase ? round(electricalBase * 3 * (1 + (settings.electricalWastePercent ?? 10) / 100)) : null, unit: "m", formula: "suma de recorridos × conductores + reserva", sourceIds: [...lightLength.ids, ...outletLength.ids, ...groundLength.ids], assumptions: [estimatedElectrical ? "Plantilla estándar" : "Recorrido del plano", "3 conductores base"], status: electricalBase ? "completo" : "pendiente", category: "electrica", confidence: estimatedElectrical ? "supuesto" : lightLength.complete && outletLength.complete && groundLength.complete ? "detectado" : "pendiente", sourceLabel: estimatedElectrical ? "Plantilla editable" : "Plano eléctrico / carga", wastePercent: settings.electricalWastePercent ?? 10 },
    { id: "corrugated", material: "Caño corrugado", quantity: corrugatedBase ? round(corrugatedBase * 1.1) : null, unit: "m", formula: "recorridos eléctricos + reserva", sourceIds: conduitLength.ids, assumptions: [estimatedElectrical ? "Plantilla estándar" : "Recorrido del plano"], status: corrugatedBase ? "completo" : "pendiente", category: "electrica", confidence: estimatedElectrical ? "supuesto" : conduitLength.complete ? "detectado" : "pendiente", sourceLabel: estimatedElectrical ? "Plantilla editable" : "Plano eléctrico / carga", wastePercent: 10 },
    { id: "sanitary-fittings", material: "Codos, tees y uniones sanitarias", quantity: input.fixtures?.length ? Math.ceil(input.fixtures.length * 1.5) : null, unit: "unidades", formula: "plantilla: 1,5 conexiones por artefacto", sourceIds: (input.fixtures ?? []).map((fixture) => fixture.id), assumptions: ["Reserva orientativa para conexiones", "Confirmar diámetros en obra"], status: input.fixtures?.length ? "parcial" : "pendiente", category: "sanitaria", confidence: "supuesto", sourceLabel: "Plantilla de conexiones", wastePercent: null },
    { id: "sanitary-valves", material: "Llaves de paso y flexibles", quantity: input.fixtures?.length ? input.fixtures.filter((fixture) => ["inodoro", "lavatorio", "ducha", "bidet", "bañera"].includes(fixture.type)).length * 2 : null, unit: "unidades", formula: "2 piezas por artefacto con alimentación", sourceIds: (input.fixtures ?? []).map((fixture) => fixture.id), assumptions: ["Incluye una llave y un flexible por punto"], status: input.fixtures?.length ? "parcial" : "pendiente", category: "sanitaria", confidence: "supuesto", sourceLabel: "Artefactos detectados", wastePercent: null },
    { id: "drain-accessories", material: "Sifones, rejillas y selladores", quantity: input.fixtures?.length ? input.fixtures.filter((fixture) => ["lavatorio", "rejilla", "ducha", "bañera"].includes(fixture.type)).length : null, unit: "unidades", formula: "suma de puntos de desagüe", sourceIds: (input.fixtures ?? []).map((fixture) => fixture.id), assumptions: ["Verificar modelo y medida"], status: input.fixtures?.length ? "parcial" : "pendiente", category: "sanitaria", confidence: "supuesto", sourceLabel: "Artefactos detectados", wastePercent: null },
    { id: "electrical-points", material: "Cajas, interruptores y tomas", quantity: (input.fixtures ?? []).filter((fixture) => ["interruptor", "tomacorriente"].includes(fixture.type)).reduce((sum, fixture) => sum + fixture.quantity, 0) || null, unit: "unidades", formula: "suma de puntos eléctricos detectados", sourceIds: (input.fixtures ?? []).filter((fixture) => ["interruptor", "tomacorriente"].includes(fixture.type)).map((fixture) => fixture.id), assumptions: ["Confirmar cantidad y ubicación"], status: "parcial", category: "electrica", confidence: "detectado", sourceLabel: "Plano / revisión", wastePercent: null },
    { id: "electrical-accessories", material: "Luminaria y puesta a tierra", quantity: (input.fixtures ?? []).filter((fixture) => ["luminaria", "extractor"].includes(fixture.type)).reduce((sum, fixture) => sum + fixture.quantity, 0) || null, unit: "unidades", formula: "suma de luminarias y extractores", sourceIds: (input.fixtures ?? []).filter((fixture) => ["luminaria", "extractor"].includes(fixture.type)).map((fixture) => fixture.id), assumptions: ["La conexión final requiere revisión profesional"], status: "parcial", category: "electrica", confidence: "detectado", sourceLabel: "Plano / revisión", wastePercent: null },
  ];
  return { calculatedAt: now.toISOString(), totals: { floorAreaM2, masonryAreaM2, paintAreaM2 }, warnings: [...new Set(warnings)], lines: [...bathroomLines, ...fixtureLines, legacyLines[2]] };
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

export const bathroomDemoInterpretation: PlanInterpretation = {
  bathroomStatus: "probable",
  orientation: "válida",
  perspective: "plana",
  rooms: [{ id: "bathroom-room", name: "Baño principal", widthM: 2.4, lengthM: 2.2, areaM2: null, state: "confirmado", evidenceId: "bathroom-room" }],
  walls: [
    { id: "bathroom-north", label: "Muro norte", lengthM: 2.4, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "bathroom-north", openings: [] },
    { id: "bathroom-east", label: "Muro este", lengthM: 2.2, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "bathroom-east", openings: [{ id: "bathroom-window", type: "ventana", widthM: 0.8, heightM: 0.6, quantity: 1, state: "confirmado", evidenceId: "bathroom-window" }] },
    { id: "bathroom-south", label: "Muro sur", lengthM: 2.4, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "bathroom-south", openings: [{ id: "bathroom-door", type: "puerta", widthM: 0.8, heightM: 2.1, quantity: 1, state: "confirmado", evidenceId: "bathroom-door" }] },
    { id: "bathroom-west", label: "Muro oeste", lengthM: 2.2, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "confirmado", evidenceId: "bathroom-west", openings: [] },
  ],
  fixtures: [
    { id: "fixture-toilet", type: "inodoro", label: "Inodoro", quantity: 1, state: "confirmado", evidenceId: "fixture-toilet" },
    { id: "fixture-sink", type: "lavatorio", label: "Lavatorio", quantity: 1, state: "confirmado", evidenceId: "fixture-sink" },
    { id: "fixture-shower", type: "ducha", label: "Ducha", quantity: 1, state: "detectado", evidenceId: "fixture-shower" },
    { id: "fixture-sink-tap", type: "canilla_lavatorio", label: "Canilla de lavatorio", quantity: 1, state: "supuesto", evidenceId: null },
    { id: "fixture-shower-mixer", type: "mezcladora_ducha", label: "Mezcladora de ducha", quantity: 1, state: "supuesto", evidenceId: null },
    { id: "fixture-shower-head", type: "duchador", label: "Duchador", quantity: 1, state: "supuesto", evidenceId: null },
    { id: "fixture-light", type: "luminaria", label: "Luminaria", quantity: 1, state: "detectado", evidenceId: "fixture-light" },
    { id: "fixture-outlet", type: "tomacorriente", label: "Tomacorriente", quantity: 1, state: "pendiente", evidenceId: null },
    { id: "fixture-grating", type: "rejilla", label: "Rejilla de piso", quantity: 1, state: "supuesto", evidenceId: null },
  ],
  installationRuns: [],
  evidence: [
    { id: "bathroom-room", label: "Baño rectangular", description: "Ambiente único de 2,40 × 2,20 m.", region: { x: 0.15, y: 0.14, width: 0.7, height: 0.72 } },
    { id: "bathroom-north", label: "Muro norte", description: "Límite superior del baño.", region: { x: 0.15, y: 0.14, width: 0.7, height: 0.025 } },
    { id: "bathroom-east", label: "Muro este", description: "Límite derecho y ventana.", region: { x: 0.825, y: 0.14, width: 0.025, height: 0.72 } },
    { id: "bathroom-south", label: "Muro sur", description: "Límite inferior y puerta de acceso.", region: { x: 0.15, y: 0.835, width: 0.7, height: 0.025 } },
    { id: "bathroom-west", label: "Muro oeste", description: "Límite izquierdo del baño.", region: { x: 0.15, y: 0.14, width: 0.025, height: 0.72 } },
    { id: "bathroom-door", label: "Puerta 0,80 × 2,10 m", description: "Abertura de acceso visible.", region: { x: 0.38, y: 0.81, width: 0.13, height: 0.1 } },
    { id: "bathroom-window", label: "Ventana 0,80 × 0,60 m", description: "Ventana exterior visible.", region: { x: 0.8, y: 0.35, width: 0.08, height: 0.16 } },
    { id: "fixture-toilet", label: "Inodoro", description: "Artefacto sanitario junto al muro oeste.", region: { x: 0.25, y: 0.32, width: 0.17, height: 0.2 } },
    { id: "fixture-sink", label: "Lavatorio", description: "Lavatorio contra el muro norte.", region: { x: 0.52, y: 0.23, width: 0.16, height: 0.14 } },
    { id: "fixture-shower", label: "Ducha", description: "Área de ducha en el ángulo este.", region: { x: 0.62, y: 0.54, width: 0.18, height: 0.22 } },
  ],
  unknowns: ["Los recorridos de agua, desagüe y electricidad no aparecen completos; se usará una plantilla editable."],
  questions: ["Confirmá la altura terminada de paredes.", "¿El revestimiento llega hasta el cielorraso?", "¿Existe un plano sanitario o eléctrico para reemplazar la plantilla?"],
  settings: {
    wallHeightM: 2.4,
    floorMaterial: "Cerámico de piso 45 × 45 cm",
    floorCoverageM2PerBox: 1.98,
    floorWastePercent: 10,
    brickMaterial: "Revestimiento cerámico de paredes",
    bricksPerM2: 1,
    brickWastePercent: 10,
    paintMaterial: "Pintura antihumedad para cielorraso",
    paintCoverageM2PerL: 10,
    paintCoats: 2,
    paintWastePercent: 10,
    wallTileCoverageM2PerBox: 2,
    wallTileWastePercent: 10,
    adhesiveKgPerM2: 4,
    groutKgPerM2: 0.5,
    waterproofingKgPerM2: 1.5,
    sanitaryTemplateM: 18,
    electricalTemplateM: 12,
    sanitaryWastePercent: 10,
    electricalWastePercent: 10,
    installationMode: "plantilla",
  },
};

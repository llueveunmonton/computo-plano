"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode, RefObject } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  calculateMaterials,
  type CalculationResult,
  type Fixture,
  type PlanInterpretation,
  type PlanProject,
  type Room,
  type Wall,
} from "@/lib/plan";

type Stage = "upload" | "review" | "complete" | "materials";
type Message = { kind: "error" | "success" | "info"; text: string };

const statusLabel: Record<string, string> = {
  detectado: "Detectado",
  confirmado: "Confirmado",
  supuesto: "Estimado",
  pendiente: "Falta completar",
};
const statusClass: Record<string, string> = {
  detectado: "status-detected",
  confirmado: "status-confirmed",
  supuesto: "status-assumed",
  pendiente: "status-pending",
};
const samplePlan = "/demo/monoambiente-demo.svg";

function decimal(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function prepareImage(
  file: File,
  rotation: number,
  cropInset: number,
  contrast: boolean,
) {
  if (!file.type.startsWith("image/") || (!rotation && !cropInset && !contrast)) {
    return file;
  }
  const source = await createImageBitmap(file);
  const cropX = source.width * cropInset;
  const cropY = source.height * cropInset;
  const width = source.width - cropX * 2;
  const height = source.height - cropY * 2;
  const canvas = document.createElement("canvas");
  canvas.width = rotation % 180 ? height : width;
  canvas.height = rotation % 180 ? width : height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  if (contrast) context.filter = "contrast(1.28) brightness(1.04)";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    source,
    cropX,
    cropY,
    width,
    height,
    -width / 2,
    -height / 2,
    width,
    height,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(
      resolve,
      file.type === "image/png" ? "image/png" : "image/jpeg",
      0.92,
    ),
  );
  return blob ? new File([blob], file.name, { type: blob.type }) : file;
}

export default function Home() {
  const [project, setProject] = useState<PlanProject | null>(null);
  const [projects, setProjects] = useState<PlanProject[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [cropInset, setCropInset] = useState(0);
  const [contrast, setContrast] = useState(false);
  const [knownDimension, setKnownDimension] = useState("");
  const [knownUnit, setKnownUnit] = useState("m");
  const [dropActive, setDropActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [feedback, setFeedback] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const analysisSteps = [
    "Revisando legibilidad",
    "Buscando cotas y escala",
    "Identificando muros y aberturas",
    "Buscando artefactos sanitarios",
    "Buscando puntos eléctricos",
    "Preparando el cómputo",
  ];

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setProjects(data.projects ?? []))
      .catch(() => undefined);
  }, []);

  function setSelectedFile(next: File) {
    if (!["image/jpeg", "image/png", "application/pdf"].includes(next.type)) {
      setMessage({
        kind: "error",
        text: "Elegí un archivo JPG, PNG o PDF para continuar.",
      });
      return;
    }
    if (next.size > 15 * 1024 * 1024) {
      setMessage({
        kind: "error",
        text: "El archivo supera los 15 MB. Probá exportar sólo la página del baño.",
      });
      return;
    }
    setProject(null);
    setStage("upload");
    setFile(next);
    setRotation(0);
    setCropInset(0);
    setContrast(false);
    setMessage(null);
    setPreviewUrl(
      next.type === "application/pdf" ? null : URL.createObjectURL(next),
    );
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (next) setSelectedFile(next);
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropActive(false);
    const next = event.dataTransfer.files?.[0];
    if (next) setSelectedFile(next);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage({ kind: "info", text: "Estamos haciendo una primera lectura del baño." });
    const progress = window.setInterval(
      () => setAnalysisStep((value) => Math.min(value + 1, analysisSteps.length - 1)),
      850,
    );
    try {
      const prepared = await prepareImage(file, rotation, cropInset, contrast);
      const form = new FormData();
      form.append("file", prepared);
      if (file.type === "application/pdf") {
        form.append("selectedPage", String(selectedPage));
      }
      if (knownDimension) {
        form.append("knownDimensionM", String(Number(knownDimension) * (knownUnit === "cm" ? 0.01 : 1)));
      }
      const response = await fetch("/api/projects", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos leer el plano.");
      const next = data.project as PlanProject;
      setProject(next);
      setProjects((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setStage("review");
      setMessage({
        kind: next.interpretation.bathroomStatus === "no_baño" ? "info" : "success",
        text: next.interpretation.bathroomStatus === "no_baño"
          ? "Este plano no parece corresponder a un baño. Podés continuar como prueba o cargar otro archivo."
          : "Primera lectura lista. Ahora revisá las medidas y los elementos dudosos.",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "No pudimos leer el plano.",
      });
    } finally {
      window.clearInterval(progress);
      setAnalysisStep(0);
      setBusy(false);
    }
  }

  async function openDemo() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/projects/demo", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const next = data.project as PlanProject;
      setProject(next);
      setProjects((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setPreviewUrl(samplePlan);
      setStage("review");
      setMessage({
        kind: "info",
        text: "EJEMPLO COMPLETO · Baño de prueba con datos conocidos. No se analizó un archivo nuevo.",
      });
    } catch {
      setMessage({ kind: "error", text: "No pudimos abrir el ejemplo completo." });
    } finally {
      setBusy(false);
    }
  }

  function updateInterpretation(updater: (draft: PlanInterpretation) => void) {
    if (!project) return;
    const interpretation = clone(project.interpretation);
    updater(interpretation);
    const next = {
      ...project,
      interpretation,
      calculation: null,
      updatedAt: new Date().toISOString(),
    };
    setProject(next);
    setProjects((current) => current.map((item) => (item.id === next.id ? next : item)));
  }

  function updateRoom(index: number, field: keyof Room, value: string) {
    updateInterpretation((draft) => {
      (draft.rooms[index] as any)[field] =
        value === ""
          ? null
          : field === "name" || field === "state" || field === "evidenceId"
            ? value
            : Number(value);
    });
  }

  function updateWall(index: number, field: keyof Wall, value: string | boolean) {
    updateInterpretation((draft) => {
      (draft.walls[index] as any)[field] =
        typeof value === "boolean"
          ? value
          : value === ""
            ? null
            : ["label", "state", "evidenceId"].includes(field)
              ? value
              : Number(value);
    });
  }

  function updateFixture(index: number, field: keyof Fixture, value: string) {
    updateInterpretation((draft) => {
      const fixture = draft.fixtures?.[index];
      if (!fixture) return;
      (fixture as any)[field] =
        field === "label" || field === "type" || field === "state" || field === "evidenceId"
          ? value
          : Number(value);
    });
  }

  function updateSetting(field: keyof PlanInterpretation["settings"], value: string) {
    updateInterpretation((draft) => {
      (draft.settings as any)[field] =
        value === ""
          ? null
          : field === "installationMode" || field.endsWith("Material")
            ? value
            : Number(value);
    });
  }

  function confirmEverything() {
    updateInterpretation((draft) => {
      draft.rooms.forEach((item) => (item.state = "confirmado"));
      draft.walls.forEach((item) => {
        item.state = "confirmado";
        item.openings.forEach((opening) => (opening.state = "confirmado"));
      });
      draft.fixtures?.forEach((item) => (item.state = "confirmado"));
      draft.questions = [];
    });
    setMessage({ kind: "success", text: "Marcamos como confirmados los elementos visibles." });
  }

  function addFixture() {
    updateInterpretation((draft) => {
      draft.fixtures = [
        ...(draft.fixtures ?? []),
        {
          id: `fixture-${Date.now()}`,
          type: "rejilla",
          label: "Nuevo elemento",
          quantity: 1,
          state: "pendiente",
          evidenceId: null,
        },
      ];
    });
    setMessage({ kind: "info", text: "Agregamos un elemento editable al final de la lista." });
  }

  function addFeedback(value: string) {
    if (!project) return;
    const next = [...new Set([...feedback, value])];
    setFeedback(next);
    localStorage.setItem(`plan-feedback-${project.id}`, JSON.stringify(next));
    setMessage({ kind: "success", text: "Gracias. Guardamos esta corrección como dato de evaluación." });
  }

  async function calculate() {
    if (!project) return;
    setBusy(true);
    setMessage({ kind: "info", text: "Ordenando materiales con las medidas confirmadas." });
    try {
      const response = await fetch(`/api/projects/${project.id}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, interpretation: project.interpretation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const next = data.project as PlanProject;
      setProject(next);
      setProjects((current) => current.map((item) => (item.id === next.id ? next : item)));
      setStage("materials");
      setMessage({ kind: "success", text: "Cómputo listo. Cada cantidad conserva su fórmula y origen." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "No pudimos calcular los materiales." });
    } finally {
      setBusy(false);
    }
  }

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    if (!project) return;
    download(
      `${project.name.replace(/\s+/g, "-")}-respaldo.json`,
      JSON.stringify(project, null, 2),
      "application/json",
    );
  }

  function exportCsv() {
    if (!project?.calculation) return;
    const rows = [
      ["Categoría", "Material", "Cantidad", "Unidad", "Fórmula", "Desperdicio", "Origen", "Confianza", "Estado"],
      ...project.calculation.lines.map((line) => [
        line.category,
        line.material,
        line.quantity === null ? "pendiente" : String(line.quantity).replace(".", ","),
        line.unit,
        line.formula,
        line.wastePercent === null ? "—" : `${line.wastePercent}%`,
        line.sourceLabel,
        statusLabel[line.confidence],
        line.status,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    download(`${project.name.replace(/\s+/g, "-")}-computo.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
  }

  const calculationPreview = useMemo(
    () => (project ? calculateMaterials(project.interpretation) : null),
    [project],
  );
  const pendingCount = project
    ? project.interpretation.questions.length + project.interpretation.unknowns.length
    : 0;

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="Plano Baño inicio">
          <span className="brand-mark">PB</span>
          <span>
            <b>PLANO<span>/</span>BAÑO</b>
            <small>Lectura asistida para decisiones reales</small>
          </span>
        </Link>
        <div className="header-note">
          Beta experimental · sólo baños
          <button className="text-button" onClick={exportJson} disabled={!project}>Descargar JSON</button>
        </div>
      </header>

      <section className="beta-banner">
        <span className="beta-icon">01</span>
        <p>
          <strong>Beta de prueba: por ahora analizamos únicamente planos de baños.</strong><br />
          Subí un plano claro, revisá nuestra interpretación y completá los datos que falten.
        </p>
        <span className="beta-close">MVP</span>
      </section>

      <section className="hero">
        <div>
          <p className="eyebrow">UNA PRIMERA LECTURA, NO UNA PROMESA MÁGICA</p>
          <h1>Del plano del baño<br /><i>a una lista de materiales.</i></h1>
          <p className="hero-copy">Subí el plano. Nosotros hacemos una primera lectura. Vos confirmás lo importante y la app transforma esa información en un cómputo ordenado.</p>
        </div>
        <div className="hero-aside">
          <span>LA REGLA DE ORO</span>
          <strong>Primero evidencia.<br />Después cálculo.</strong>
          <p>El resultado es preliminar y siempre necesita verificación profesional.</p>
        </div>
      </section>

      <Workflow stage={stage} hasProject={Boolean(project)} />
      {message && <div className={`message message-${message.kind}`}><b>{message.kind === "error" ? "!" : message.kind === "success" ? "✓" : "i"}</b><span>{message.text}</span></div>}

      {!project && (busy ? <AnalysisCard analysisStep={analysisStep} analysisSteps={analysisSteps} /> : <Landing onDemo={openDemo} busy={busy} file={file} dropActive={dropActive} setDropActive={setDropActive} setSelectedFile={setSelectedFile} selectFile={selectFile} fileInput={fileInput} upload={upload} rotation={rotation} setRotation={setRotation} cropInset={cropInset} setCropInset={setCropInset} contrast={contrast} setContrast={setContrast} selectedPage={selectedPage} setSelectedPage={setSelectedPage} knownDimension={knownDimension} setKnownDimension={setKnownDimension} knownUnit={knownUnit} setKnownUnit={setKnownUnit} />)}
      {project && stage === "review" && calculationPreview && <CalculationPreview calculation={calculationPreview} />}
      {project && <ProjectFlow project={project} previewUrl={previewUrl} stage={stage} setStage={setStage} busy={busy} analysisStep={analysisStep} analysisSteps={analysisSteps} selectedEvidence={selectedEvidence} setSelectedEvidence={setSelectedEvidence} pendingCount={pendingCount} updateRoom={updateRoom} updateWall={updateWall} updateFixture={updateFixture} updateSetting={updateSetting} updateInterpretation={updateInterpretation} confirmEverything={confirmEverything} addFixture={addFixture} addFeedback={addFeedback} showDetails={showDetails} setShowDetails={setShowDetails} calculate={calculate} calculationPreview={calculationPreview} exportCsv={exportCsv} />}

      {projects.length > 0 && <section className="recent"><div><p className="eyebrow">ARCHIVO LOCAL</p><h2>Proyectos recientes</h2></div><div className="recent-list">{projects.slice(0, 4).map((item) => <button className={`recent-item ${project?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => { setProject(item); setPreviewUrl(item.isDemo ? samplePlan : null); setStage(item.calculation ? "materials" : "review"); }}>{item.isDemo ? "DEMO" : "PLANO"}<span><strong>{item.name}</strong><small>{dateLabel(item.updatedAt)}</small></span><b>→</b></button>)}</div></section>}
      <section className="trust-footer"><strong>El cómputo orienta; no reemplaza tu criterio.</strong><span>No calcula estructura, precios ni aprobación reglamentaria. Verificá antes de comprar o ejecutar.</span></section>
    </main>
  );
}

function Workflow({ stage, hasProject }: { stage: Stage; hasProject: boolean }) {
  const current = stage === "upload" ? 1 : stage === "review" ? 2 : stage === "complete" ? 3 : 4;
  const steps = [[1, "Plano", "Subir"], [2, "Lectura", "Revisar"], [3, "Confirmación", "Completar"], [4, "Materiales", "Ver cómputo"]] as const;
  return <nav className="workflow" aria-label="Progreso del proyecto">{steps.map(([number, title, detail], index) => <div className="workflow-part" key={title}><div className={`workflow-step ${current >= number && hasProject ? "active" : number === 1 && !hasProject ? "active" : ""}`}><span>{String(number).padStart(2, "0")}</span><strong>{title}</strong><small>{detail}</small></div>{index < 3 && <i />}</div>)}</nav>;
}

function Landing({ onDemo, busy, file, dropActive, setDropActive, setSelectedFile, selectFile, fileInput, upload, rotation, setRotation, cropInset, setCropInset, contrast, setContrast, selectedPage, setSelectedPage, knownDimension, setKnownDimension, knownUnit, setKnownUnit }: { onDemo: () => void; busy: boolean; file: File | null; dropActive: boolean; setDropActive: (value: boolean) => void; setSelectedFile: (file: File) => void; selectFile: (event: ChangeEvent<HTMLInputElement>) => void; fileInput: RefObject<HTMLInputElement | null>; upload: () => void; rotation: number; setRotation: (value: number) => void; cropInset: number; setCropInset: (value: number) => void; contrast: boolean; setContrast: (value: boolean) => void; selectedPage: number; setSelectedPage: (value: number) => void; knownDimension: string; setKnownDimension: (value: string) => void; knownUnit: string; setKnownUnit: (value: string) => void }) {
  return <section className="landing"><div className="landing-main"><div className="section-intro"><p className="eyebrow">PASO 1 · SUBIR PLANO</p><h2>Empezá por una imagen que podamos leer.</h2><p>Un baño por plano, visto desde arriba, con cotas y aberturas visibles. JPG, PNG o PDF de hasta 15 MB.</p></div><div className={`dropzone ${dropActive ? "drop-active" : ""} ${file ? "has-file" : ""}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={(event) => { event.preventDefault(); setDropActive(false); const next = event.dataTransfer.files?.[0]; if (next) setSelectedFile(next); }}><input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" onChange={selectFile} hidden />{file ? <><span className="file-badge">{file.type === "application/pdf" ? "PDF" : "IMG"}</span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · listo para revisar antes de enviar</small></> : <><span className="upload-mark">+</span><strong>Soltá el plano acá</strong><small>o elegí un archivo de tu equipo</small></>}</div><label className="known-measure"><span>Si no hay cota visible, indicá una medida conocida</span><small>La usamos como referencia para leer el dibujo; no reemplaza la revisión.</small><div><input type="number" min="0.01" step="0.01" value={knownDimension} onChange={(event) => setKnownDimension(event.target.value)} placeholder="2,40" /><select value={knownUnit} onChange={(event) => setKnownUnit(event.target.value)}><option value="m">m</option><option value="cm">cm</option></select></div></label>{file && <UploadPreparation file={file} upload={upload} busy={busy} rotation={rotation} setRotation={setRotation} cropInset={cropInset} setCropInset={setCropInset} contrast={contrast} setContrast={setContrast} selectedPage={selectedPage} setSelectedPage={setSelectedPage} />}</div><aside className="landing-side"><div className="demo-card"><p className="eyebrow">PROBAR SIN API KEY</p><h3>Ver un baño completo</h3><p>Un ejemplo conocido, con artefactos, aberturas, medidas y un cómputo verificable. No simula analizar un archivo nuevo.</p><button className="secondary-button" onClick={onDemo} disabled={busy}>Ver ejemplo completo →</button></div><InfoBlocks /><HowToTry /></aside></section>;
}

function UploadPreparation({ file, upload, busy, rotation, setRotation, cropInset, setCropInset, contrast, setContrast, selectedPage, setSelectedPage }: { file: File; upload: () => void; busy: boolean; rotation: number; setRotation: (value: number) => void; cropInset: number; setCropInset: (value: number) => void; contrast: boolean; setContrast: (value: boolean) => void; selectedPage: number; setSelectedPage: (value: number) => void }) {
  return <div className="prepare-card"><strong>Antes de analizar</strong><p>Intentá que se vean las cotas, los nombres de los artefactos y las aberturas.</p>{file.type === "application/pdf" ? <label className="pdf-page">Página a interpretar <input type="number" min="1" max="100" value={selectedPage} onChange={(event) => setSelectedPage(Number(event.target.value))} /></label> : <div className="image-tools"><button type="button" onClick={(event) => { event.stopPropagation(); setRotation((rotation + 90) % 360); }}>Rotar 90°</button><button type="button" onClick={(event) => { event.stopPropagation(); setCropInset(cropInset ? 0 : 0.06); }}>{cropInset ? "Quitar recorte" : "Recortar bordes"}</button><button type="button" onClick={(event) => { event.stopPropagation(); setContrast(!contrast); }}>{contrast ? "Contraste normal" : "Mejorar contraste"}</button></div>}<button className="primary-button" onClick={(event) => { event.stopPropagation(); upload(); }} disabled={busy}>{busy ? "Haciendo primera lectura…" : "Analizar un plano →"}</button></div>;
}

function InfoBlocks() {
  return <div className="info-blocks"><InfoBlock title="Qué vas a obtener" items={["Superficie de piso y revestimiento", "Cerámicos, adhesivo y pastina", "Cables, cañerías y accesorios", "Artefactos, supuestos y faltantes"]} /><InfoBlock title="Qué necesitamos de vos" items={["Un plano legible y, si podés, una escala", "Altura de pared y revestimiento", "Confirmación de instalaciones no visibles"]} /><InfoBlock title="Funciona mejor con" items={["Un solo baño, planta desde arriba", "Geometría ortogonal y cotas legibles", "Muros, aberturas y artefactos visibles"]} /><InfoBlock title="Funciona peor con" items={["Fotos inclinadas, borrosas o sin medidas", "Varios ambientes o croquis a mano", "Recorridos ocultos que no aparecen"]} /><InfoBlock title="Qué todavía no hacemos" items={["Cálculo estructural ni presupuesto", "Verificación reglamentaria", "Detección perfecta de instalaciones ocultas"]} /></div>;
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return <div className="info-block"><h3>{title}</h3>{items.map((item) => <p key={item}><span>+</span>{item}</p>)}</div>;
}

function HowToTry() {
  return <div className="try-guide"><p className="eyebrow">CÓMO PROBAR ESTA BETA</p><ol><li>Elegí un plano de un solo baño con una medida.</li><li>Confirmá medidas y alturas.</li><li>Revisá lo estimado y exportá el cómputo.</li></ol></div>;
}

function CalculationPreview({ calculation }: { calculation: CalculationResult }) {
  const categoryLabels: Record<CalculationResult["lines"][number]["category"], string> = {
    terminaciones: "Terminaciones",
    sanitaria: "Sanitaria",
    electrica: "Eléctrica",
    artefactos: "Artefactos",
  };
  const categories = [...new Set(calculation.lines.map((line) => line.category))];
  const headlineLines = calculation.lines.filter((line) => ["floor", "wall-tile", "cold-water", "electrical-cable"].includes(line.id));
  return <section className="calculation-preview"><div className="preview-intro"><p className="eyebrow">ANTES DE CONFIRMAR · VISTA PREVIA</p><h2>El cómputo ya tiene una dirección.</h2><p>Esto es una primera aproximación con lo que pudimos leer. Mirá si las superficies y las categorías tienen sentido antes de completar los datos faltantes.</p></div><div className="preview-totals"><div><span>Piso neto</span><strong>{decimal(calculation.totals.floorAreaM2)} <small>m²</small></strong></div><div><span>Paredes netas</span><strong>{decimal(calculation.totals.masonryAreaM2)} <small>m²</small></strong></div><div><span>Con categorías</span><strong>{categories.length} <small>de 4</small></strong></div></div><div className="preview-lines">{headlineLines.map((line) => <div key={line.id}><span className={`preview-status ${statusClass[line.confidence]}`} /> <strong>{line.material}</strong><b>{line.quantity === null ? "pendiente" : `${decimal(line.quantity)} ${line.unit}`}</b><small>{line.confidence === "supuesto" ? "estimado por plantilla" : line.sourceLabel.toLowerCase()}</small></div>)}</div><div className="preview-foot"><span>{categories.map((category) => categoryLabels[category]).join(" · ")}</span><strong>Las decisiones pueden cambiar estas cantidades.</strong></div></section>;
}

function ProjectFlow({ project, previewUrl, stage, setStage, busy, analysisStep, analysisSteps, selectedEvidence, setSelectedEvidence, pendingCount, updateRoom, updateWall, updateFixture, updateSetting, updateInterpretation, confirmEverything, addFixture, addFeedback, showDetails, setShowDetails, calculate, calculationPreview, exportCsv }: any) {
  if (busy && !project.calculation) return <AnalysisCard analysisStep={analysisStep} analysisSteps={analysisSteps} />;
  return <><section className="review-layout"><PlanCanvas project={project} previewUrl={previewUrl} selectedEvidence={selectedEvidence} setSelectedEvidence={setSelectedEvidence} /><ReviewPanel project={project} pendingCount={pendingCount} setStage={setStage} confirmEverything={confirmEverything} /></section><section id="review-detail" className="detail-section"><div className="detail-top"><div><p className="eyebrow">{stage === "materials" ? "PASO 4 · CÓMPUTO" : stage === "complete" ? "PASO 3 · CONFIRMACIÓN" : "PASO 2 · REVISIÓN"}</p><h2>{stage === "materials" ? "Una lista para revisar." : stage === "complete" ? "Completemos lo que el plano no muestra." : "Confirmá la lectura, no redibujes el baño."}</h2><p>Revisá especialmente medidas, aberturas y recorridos de instalaciones: son los datos que más impactan en el resultado.</p></div><div className="stage-actions"><button className={stage === "review" ? "active" : ""} onClick={() => setStage("review")}>Lectura</button><button className={stage === "complete" ? "active" : ""} onClick={() => setStage("complete")}>Completar datos</button><button className={stage === "materials" ? "active" : ""} onClick={() => setStage("materials")} disabled={!project.calculation}>Materiales</button></div></div>{stage === "materials" ? <MaterialsView project={project} calculationPreview={calculationPreview} exportCsv={exportCsv} /> : <><ReviewEditor project={project} stage={stage} updateRoom={updateRoom} updateWall={updateWall} updateFixture={updateFixture} updateSetting={updateSetting} updateInterpretation={updateInterpretation} showDetails={showDetails} setShowDetails={setShowDetails} addFixture={addFixture} addFeedback={addFeedback} /><div className="calculate-bar"><div><strong>{stage === "review" ? "¿La lectura está encaminada?" : "¿Datos completos?"}</strong><small>El cálculo usa sólo valores válidos y deja visibles las estimaciones.</small></div><button className="primary-button" onClick={stage === "review" ? () => setStage("complete") : calculate} disabled={busy}>{stage === "review" ? "Completar datos →" : busy ? "Calculando…" : "Ver cómputo →"}</button></div></>}</section></>;
}

function AnalysisCard({ analysisStep, analysisSteps }: { analysisStep: number; analysisSteps: string[] }) {
  return <section className="analysis-card"><p className="eyebrow">PASO 2 · LECTURA</p><h2>Estamos leyendo el baño.</h2><p>Buscamos señales concretas para que después sólo tengas que confirmar lo importante.</p><div className="analysis-list">{analysisSteps.map((item, index) => <div className={index < analysisStep ? "done" : index === analysisStep ? "current" : ""} key={item}><span>{index < analysisStep ? "✓" : String(index + 1).padStart(2, "0")}</span>{item}{index === analysisStep && <i />}</div>)}</div></section>;
}

function PlanCanvas({ project, previewUrl, selectedEvidence, setSelectedEvidence }: any) {
  const interpretation = project.interpretation as PlanInterpretation;
  return <section className="canvas-panel"><div className="canvas-head"><div><p className="eyebrow">PLANO + EVIDENCIA</p><h2>{project.name}</h2></div><span className={`read-badge ${project.isDemo ? "demo" : ""}`}>{project.isDemo ? "EJEMPLO COMPLETO" : "LECTURA REAL"}</span></div><div className="plan-canvas">{previewUrl ? <div className="plan-image"><Image src={previewUrl} alt="Plano del baño" fill unoptimized />{interpretation.evidence.map((evidence: any) => evidence.region && <button key={evidence.id} className={`evidence-pin ${selectedEvidence === evidence.id ? "selected" : ""}`} style={{ left: `${evidence.region.x * 100}%`, top: `${evidence.region.y * 100}%`, width: `${evidence.region.width * 100}%`, height: `${evidence.region.height * 100}%` }} onClick={() => setSelectedEvidence(evidence.id)} aria-label={`Ver evidencia: ${evidence.label}`} />)}</div> : <div className="pdf-placeholder"><span>PDF</span><strong>La página fue enviada para lectura</strong><small>La vista visual se habilita con una imagen JPG o PNG.</small></div>}</div><div className="canvas-legend"><span><i className="legend-orange" /> Cota o evidencia</span><span><i className="legend-blue" /> Elemento leído</span><span><i className="legend-amber" /> Requiere revisión</span></div></section>;
}

function ReviewPanel({ project, pendingCount, setStage, confirmEverything }: any) {
  const interpretation = project.interpretation as PlanInterpretation;
  const doubtful = [...interpretation.questions, ...interpretation.unknowns];
  return <aside className="review-sidebar"><div className="sidebar-head"><div><p className="eyebrow">REVISIÓN GUIADA</p><h2>Lo que encontramos</h2></div><span className="pending-count">{pendingCount} para mirar</span></div><div className="confidence-card"><span className="confidence-dot" /><div><strong>Primera lectura lista</strong><small>{dateLabel(project.updatedAt)} · {interpretation.rooms.length} ambiente · {interpretation.walls.length} muros</small></div></div>{doubtful.length > 0 && <div className="doubt-card"><div><strong>Tu criterio importa acá</strong><b>{doubtful.length}</b></div>{doubtful.slice(0, 3).map((item) => <p key={item}>? {item}</p>)}<button className="text-button" onClick={() => document.getElementById("review-detail")?.scrollIntoView({ behavior: "smooth" })}>Revisar sólo lo dudoso →</button></div>}<div className="found-list">{(interpretation.fixtures ?? []).slice(0, 5).map((fixture) => <div className="found-row" key={fixture.id}><span className={`state-dot ${statusClass[fixture.state]}`} /><div><strong>{fixture.label}</strong><small>{statusLabel[fixture.state]} · {fixture.quantity} unidad{fixture.quantity === 1 ? "" : "es"}</small></div></div>)}</div><div className="sidebar-actions"><button className="secondary-button" onClick={confirmEverything}>Confirmar todo lo correcto</button><button className="primary-button" onClick={() => setStage("complete")}>Continuar con datos →</button></div></aside>;
}

function ReviewEditor({ project, stage, updateRoom, updateWall, updateFixture, updateSetting, updateInterpretation, showDetails, setShowDetails, addFixture, addFeedback }: any) {
  const interpretation = project.interpretation as PlanInterpretation;
  return <div className="editor-area">{stage === "complete" && <div className="questions-grid"><Question title="Altura de paredes" text="La necesitamos para calcular revestimiento, pintura e impermeabilización." control={<NumberControl value={interpretation.settings.wallHeightM} unit="m" onChange={(value) => updateSetting("wallHeightM", value)} />} /><Question title="Altura de revestimiento" text="Elegí hasta dónde se colocará cerámico en las paredes." control={<ChoiceButtons value={interpretation.settings.wallHeightM} options={[["Toda la pared", "2.4"], ["Hasta 2,10 m", "2.1"], ["Hasta 1,20 m", "1.2"]]} onChange={(value) => updateSetting("wallHeightM", value)} />} /><Question title="Instalaciones" text="El plano no muestra recorridos completos. Elegí una forma honesta de estimarlos." control={<ChoiceButtons value={interpretation.settings.installationMode} options={[["Plantilla estándar", "plantilla"], ["Cargar recorridos", "manual"], ["Tengo plano sanitario", "plano_sanitario"], ["Tengo plano eléctrico", "plano_electrico"]]} onChange={(value) => updateSetting("installationMode", value)} wide />} /></div>}{stage === "complete" && interpretation.settings.installationMode === "plantilla" && <div className="estimate-callout"><strong>Resultado estimado según recorrido estándar.</strong><span>Podés cambiar la plantilla o cargar recorridos manuales. Requiere validación antes de comprar.</span></div>}<div className="editor-grid"><Measures interpretation={interpretation} updateRoom={updateRoom} /><Fixtures interpretation={interpretation} updateFixture={updateFixture} addFixture={addFixture} /></div><div className="detail-toggle"><button onClick={() => setShowDetails(!showDetails)}>{showDetails ? "Ocultar detalles de muros y rendimientos" : "Revisar detalles de muros y rendimientos →"}</button></div>{showDetails && <AdvancedDetails interpretation={interpretation} updateWall={updateWall} updateSetting={updateSetting} updateInterpretation={updateInterpretation} />}{stage === "complete" && <Feedback addFeedback={addFeedback} />}</div>;
}

function Question({ title, text, control }: { title: string; text: string; control: ReactNode }) { return <article className="question-card"><div><h3>{title}</h3><p>{text}</p></div>{control}</article>; }
function NumberControl({ value, unit, onChange }: { value: number | null; unit: string; onChange: (value: string) => void }) { return <label className="big-number"><input type="number" step="0.01" value={value ?? ""} placeholder="pendiente" onChange={(event) => onChange(event.target.value)} /><b>{unit}</b></label>; }
function ChoiceButtons({ value, options, onChange, wide = false }: { value: unknown; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; wide?: boolean }) { return <div className={`choice-row ${wide ? "choices-wide" : ""}`}>{options.map(([label, option]) => <button key={option} className={value === (option.match(/^\d/) ? Number(option) : option) ? "selected" : ""} onClick={() => onChange(option)}>{label}</button>)}</div>; }

function Measures({ interpretation, updateRoom }: any) { return <section className="editor-card"><div className="card-heading"><div><p className="eyebrow">MEDIDAS</p><h3>Lo que impacta en el área</h3></div><span className="origin-note">Cotas → fórmula</span></div>{interpretation.rooms.map((room: Room, index: number) => <div className="measure-row" key={room.id}><span className="row-number">01</span><label><small>Ambiente</small><input value={room.name} onChange={(event) => updateRoom(index, "name", event.target.value)} /></label><label><small>Ancho <b>m</b></small><input type="number" step="0.01" value={room.widthM ?? ""} placeholder="pendiente" onChange={(event) => updateRoom(index, "widthM", event.target.value)} /></label><label><small>Largo <b>m</b></small><input type="number" step="0.01" value={room.lengthM ?? ""} placeholder="pendiente" onChange={(event) => updateRoom(index, "lengthM", event.target.value)} /></label><span className={`state-tag ${statusClass[room.state]}`}>{statusLabel[room.state]}</span></div>)}<div className="wall-summary"><strong>{interpretation.walls.length} muros detectados</strong><span>Las aberturas se descuentan cuando tienen ancho y alto.</span></div></section>; }
function Fixtures({ interpretation, updateFixture, addFixture }: any) { return <section className="editor-card"><div className="card-heading"><div><p className="eyebrow">ARTEFACTOS</p><h3>Elementos del baño</h3></div><button className="small-button" onClick={addFixture}>+ Agregar elemento</button></div><div className="fixture-grid">{(interpretation.fixtures ?? []).map((fixture: Fixture, index: number) => <div className="fixture-row" key={fixture.id}><span className="fixture-symbol">{fixture.type === "inodoro" ? "WC" : fixture.type === "lavatorio" ? "LV" : fixture.type === "ducha" ? "DU" : "·"}</span><input value={fixture.label} onChange={(event) => updateFixture(index, "label", event.target.value)} /><input className="qty" type="number" min="1" value={fixture.quantity} onChange={(event) => updateFixture(index, "quantity", event.target.value)} /><span className={`state-tag ${statusClass[fixture.state]}`}>{statusLabel[fixture.state]}</span></div>)}</div></section>; }

function AdvancedDetails({ interpretation, updateWall, updateSetting, updateInterpretation }: any) { return <div className="advanced-details"><section className="editor-card"><div className="card-heading"><div><p className="eyebrow">MUROS Y ABERTURAS</p><h3>Corregir sólo lo puntual</h3></div><button className="small-button" onClick={() => updateInterpretation((draft: PlanInterpretation) => draft.walls.push({ id: `wall-${Date.now()}`, label: "Nuevo muro", lengthM: null, heightM: null, thicknessM: 0.15, paintLeft: true, paintRight: false, state: "pendiente", evidenceId: null, openings: [] }))}>+ Agregar muro</button></div>{interpretation.walls.map((wall: Wall, index: number) => <div className="wall-edit" key={wall.id}><div className="wall-edit-head"><strong>{wall.label}</strong><span className={`state-tag ${statusClass[wall.state]}`}>{statusLabel[wall.state]}</span></div><div className="wall-inputs"><label>Largo <input type="number" step="0.01" value={wall.lengthM ?? ""} onChange={(event) => updateWall(index, "lengthM", event.target.value)} /><b>m</b></label><label>Alto <input type="number" step="0.01" value={wall.heightM ?? ""} placeholder="global" onChange={(event) => updateWall(index, "heightM", event.target.value)} /><b>m</b></label><label className="check"><input type="checkbox" checked={wall.paintLeft} onChange={(event) => updateWall(index, "paintLeft", event.target.checked)} /> Cara a</label><label className="check"><input type="checkbox" checked={wall.paintRight} onChange={(event) => updateWall(index, "paintRight", event.target.checked)} /> Cara b</label></div>{wall.openings.map((opening) => <div className="opening-edit" key={opening.id}><span>{opening.type}</span><label>ancho <input type="number" step="0.01" value={opening.widthM ?? ""} onChange={(event) => updateInterpretation((draft: PlanInterpretation) => { const target = draft.walls[index].openings.find((item) => item.id === opening.id); if (target) target.widthM = event.target.value === "" ? null : Number(event.target.value); })} /><b>m</b></label><label>alto <input type="number" step="0.01" value={opening.heightM ?? ""} onChange={(event) => updateInterpretation((draft: PlanInterpretation) => { const target = draft.walls[index].openings.find((item) => item.id === opening.id); if (target) target.heightM = event.target.value === "" ? null : Number(event.target.value); })} /><b>m</b></label></div>)}</div>)}</section><Settings interpretation={interpretation} updateSetting={updateSetting} /></div>; }
function Settings({ interpretation, updateSetting }: any) { const fields = [["Desperdicio de piso", "floorWastePercent", "%"], ["Desperdicio de pared", "wallTileWastePercent", "%"], ["Rendimiento piso", "floorCoverageM2PerBox", "m²/caja"], ["Rendimiento pared", "wallTileCoverageM2PerBox", "m²/caja"], ["Adhesivo", "adhesiveKgPerM2", "kg/m²"], ["Pastina", "groutKgPerM2", "kg/m²"], ["Impermeabilizante", "waterproofingKgPerM2", "kg/m²"], ["Recorrido sanitario", "sanitaryTemplateM", "m"], ["Recorrido eléctrico", "electricalTemplateM", "m"]] as const; return <section className="editor-card"><div className="card-heading"><div><p className="eyebrow">SUPUESTOS EDITABLES</p><h3>Rendimientos y reserva</h3></div></div><div className="settings-grid">{fields.map(([label, field, unit]) => <label className="setting" key={field}><span>{label}<em>{field.includes("Template") ? "carga" : "supuesto"}</em></span><div><input type="number" step="0.01" value={(interpretation.settings as any)[field] ?? ""} onChange={(event) => updateSetting(field, event.target.value)} /><b>{unit}</b></div></label>)}</div></section>; }
function Feedback({ addFeedback }: { addFeedback: (value: string) => void }) { const options = [["measure", "La medida está mal"], ["missing", "Faltó un artefacto"], ["false", "Detectó algo que no existe"], ["run", "El recorrido está estimado"], ["unreadable", "El plano no se pudo leer"]]; return <section className="feedback"><div><p className="eyebrow">AYUDANOS A MEJORAR</p><strong>¿Qué corregirías de esta lectura?</strong></div><div>{options.map(([value, label]) => <button key={value} onClick={() => addFeedback(value)}>{label}</button>)}</div></section>; }

function MaterialsView({ project, calculationPreview, exportCsv }: any) { const calculation = project.calculation ?? calculationPreview; if (!calculation) return null; const grouped = ["terminaciones", "sanitaria", "electrica", "artefactos"] as const; return <div className="materials-view"><div className="result-header"><div><p className="eyebrow">RESULTADO PRELIMINAR</p><h3>Materiales con historia.</h3><p>Cada fila dice qué se calculó, con qué fórmula y cuánto conviene revisar.</p></div><div className="export-actions"><button className="secondary-button" onClick={exportCsv}>Descargar CSV</button><button className="small-button" onClick={() => window.print()}>Imprimir</button></div></div><div className="totals"><div><span>PISO NETO</span><strong>{decimal(calculation.totals.floorAreaM2)} <small>m²</small></strong></div><div><span>PAREDES NETAS</span><strong>{decimal(calculation.totals.masonryAreaM2)} <small>m²</small></strong></div><div><span>SUP. PINTURA</span><strong>{decimal(calculation.totals.paintAreaM2)} <small>m²</small></strong></div></div>{grouped.map((category) => { const lines = calculation.lines.filter((line: any) => line.category === category); if (!lines.length) return null; return <section className="material-group" key={category}><div className="group-title"><h3>{category === "terminaciones" ? "Terminaciones" : category === "sanitaria" ? "Instalación sanitaria" : category === "electrica" ? "Instalación eléctrica" : "Artefactos y griferías"}</h3><span>{lines.length} ítems</span></div><div className="material-list">{lines.map((line: any) => <MaterialRow line={line} key={line.id} />)}</div></section>; })}{calculation.warnings.length > 0 && <div className="warnings"><strong>Conviene revisar antes de usar</strong>{calculation.warnings.map((warning: string) => <p key={warning}>→ {warning}</p>)}</div>}<div className="result-disclaimer"><strong>Este cómputo es orientativo.</strong><span>Los recorridos no visibles se estiman mediante plantillas. Verificá medidas, rendimientos y criterio de obra antes de comprar.</span></div></div>; }
function MaterialRow({ line }: { line: any }) { const [why, setWhy] = useState(false); return <article className="material-row"><div className="material-name"><strong>{line.material}</strong><small>{line.sourceLabel}</small></div><div className="material-quantity">{line.quantity === null ? <b className="pending-value">pendiente</b> : <><strong>{decimal(line.quantity)}</strong><small>{line.unit}</small></>}</div><div className="material-formula"><span>FÓRMULA</span><p>{line.formula}</p>{why && <div className="why-box"><strong>¿Por qué da esta cantidad?</strong><br />{line.assumptions.join(". ")}. {line.quantity === null ? "Falta un dato para cerrar este cálculo." : "La cantidad se actualiza si corregís una medida o supuesto."}</div>}</div><div className="material-meta"><span className={`state-tag ${statusClass[line.confidence]}`}>{statusLabel[line.confidence]}</span><small>{line.wastePercent === null ? "sin reserva" : `reserva ${line.wastePercent}%`}</small></div><button className="why-button" onClick={() => setWhy(!why)}>{why ? "Cerrar" : "¿Por qué?"}</button></article>; }

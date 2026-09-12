# Plano/Baño

Beta experimental en Next.js + TypeScript para interpretar un plano de baño y generar un cómputo preliminar editable.

## Flujo implementado

1. Se carga JPG, PNG o PDF y, para imágenes, se puede rotar, recortar bordes o mejorar contraste antes de enviar.
2. El servidor valida tipo, tamaño, página PDF, límite de solicitudes y responde con error si falta configuración.
3. Con `OPENAI_API_KEY` o `GEMINI_API_KEY` + `VISION_PROVIDER=gemini`, el servidor envía el plano al proveedor de visión seleccionado y exige un JSON Schema validado con baño, muros, aberturas, artefactos, evidencia, faltantes y preguntas.
4. La interfaz guía cuatro pasos: plano, lectura, confirmación y materiales. Muestra el plano con evidencias seleccionables y estados `detectado`, `confirmado`, `estimado` y `falta completar`.
5. El motor de cálculo está separado de la IA. Calcula pisos, revestimientos, adhesivo, pastina, impermeabilizante, recorridos sanitarios y eléctricos, y artefactos. Las instalaciones no visibles se resuelven con una plantilla explícita y editable.
6. El proyecto y el archivo original se guardan en `data/material-plans/`. Se puede descargar un respaldo JSON, exportar el cómputo a CSV y registrar correcciones de evaluación localmente.

La interfaz pública deja visible desde el inicio que es una beta sólo para baños. Sin API key, los archivos nuevos se rechazan con una explicación clara y no se simula ningún análisis. El ejemplo completo funciona sin API key y no afirma haber analizado un archivo nuevo.

## Arranque

Requisitos: Node.js 20.9+ y npm.

```bash
cp .env.example .env
npm install
npm run dev
```

Abrir <http://localhost:3000>.

Configuración mínima para lectura real con OpenAI:

```dotenv
OPENAI_API_KEY="..."
VISION_MODEL="gpt-4.1-mini"
# opcional, para un endpoint compatible con Responses API
VISION_API_URL="https://api.openai.com/v1/responses"
```

Alternativa con Google AI Studio:

```dotenv
VISION_PROVIDER="gemini"
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-3.6-flash"
```

La clave nunca llega al navegador. El archivo sí se envía al proveedor de IA configurado; la interfaz lo informa antes de usar el flujo. El proyecto y el original quedan además en almacenamiento local.

## Uso

1. Ejecutá `npm run dev` y abrí <http://localhost:3000>.
2. Para probar sin credenciales, elegí `Ver ejemplo completo`.
3. Para analizar un plano propio, configurá un proveedor y subí un JPG, PNG o PDF de un solo baño.
4. Confirmá medidas, altura de paredes, altura de revestimiento y el modo de instalaciones.
5. Revisá fórmulas, advertencias y filas estimadas antes de descargar CSV o JSON.

## Verificación

```bash
npm run lint
npm test
npm run build
```

La suite incluye pruebas unitarias de fórmulas legacy y de baño, aberturas, faltantes, cómputo parcial, plantilla de instalaciones, validación de entradas, perímetro, protección de rutas de almacenamiento y contratos OpenAI/Gemini. `npm run test:e2e` recorre la beta y el ejemplo completo en Chromium móvil.

## Limitaciones conocidas

- La lectura real depende de la API de visión y del proveedor/modelo configurados. No se afirma una precisión que no haya sido medida.
- La IA propone posiciones y elementos; las posiciones no son mediciones exactas. Las cotas explícitas tienen prioridad.
- No se calibra por escala impresa ni por píxeles sobre una fotografía con perspectiva. Una imagen no utilizable debe reemplazarse o corregirse antes de enviarla.
- El endpoint recibe PDFs y una página seleccionada, pero la extracción de página visual la realiza el proveedor; si el modelo no puede inspeccionarla, debe devolver la duda y no inventar datos.
- Los valores de rendimiento, manos y desperdicio de los ejemplos de prueba son supuestos editables, no especificaciones de obra.
- No incluye estructura, instalaciones ocultas verificadas, precios, pagos ni aprobación para obra. Los recorridos de instalaciones sin plano son plantillas preliminares.
- El almacenamiento local está pensado para un equipo o servidor único. En Vercel se usa `/tmp`, que es temporal por instancia; para producción hace falta reemplazarlo por Blob/S3 y una base persistente. También se necesita autenticación, control de acceso, backups operativos, antivirus/escaneo de archivos, retención y una política de privacidad.
- El rate limit actual es en memoria y por origen; debe reemplazarse por un límite distribuido antes de exponerlo públicamente.

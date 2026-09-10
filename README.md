# Cómputo/Plano

MVP funcional en Next.js + TypeScript para pasar de un plano arquitectónico a un cómputo editable de pisos/cerámicos, ladrillos y pintura.

## Flujo implementado

1. Se carga JPG, PNG o PDF y, para imágenes, se puede rotar o recortar bordes antes de enviar.
2. El servidor valida tipo, tamaño, página PDF, límite de solicitudes y responde con error si falta configuración.
3. Con `OPENAI_API_KEY` o `GEMINI_API_KEY` + `VISION_PROVIDER=gemini`, el servidor envía el plano al proveedor de visión seleccionado y exige un JSON Schema validado con ambientes, muros, aberturas, evidencia, faltantes y preguntas.
4. La interfaz muestra el plano, referencias visuales, estados `detectado`, `confirmado`, `supuesto` y `pendiente`, y una revisión editable.
5. El motor de cálculo está separado de la IA. Cuenta cada muro una vez, descuenta aberturas, calcula caras de pintura seleccionadas y conserva cómputos parciales.
6. El proyecto y el archivo original se guardan en `data/material-plans/`. Se puede descargar un respaldo JSON y exportar el cómputo a CSV.

La interfaz pública sólo muestra el flujo de carga real. Sin API key, los archivos nuevos se rechazan con una explicación clara y no se simula ningún análisis.

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
GEMINI_MODEL="gemini-2.5-flash"
```

La clave nunca llega al navegador. El archivo sí se envía al proveedor de IA configurado; la interfaz lo informa antes de usar el flujo. El proyecto y el original quedan además en almacenamiento local.

## Verificación

```bash
npm run lint
npm test
npm run build
```

La suite incluye 14 pruebas: fórmulas conocidas, un monoambiente controlado, aberturas, caras de pintura, faltantes, cómputo parcial, validación de entradas, perímetro, protección de rutas de almacenamiento, contratos OpenAI/Gemini y diagnóstico de configuración.

## Limitaciones conocidas

- La lectura real depende de la API de visión y del proveedor/modelo configurados. No se afirma una precisión que no haya sido medida.
- La IA propone posiciones y elementos; las posiciones no son mediciones exactas. Las cotas explícitas tienen prioridad.
- No se calibra por escala impresa ni por píxeles sobre una fotografía con perspectiva. Una imagen no utilizable debe reemplazarse o corregirse antes de enviarla.
- El endpoint recibe PDFs y una página seleccionada, pero la extracción de página visual la realiza el proveedor; si el modelo no puede inspeccionarla, debe devolver la duda y no inventar datos.
- Los valores de rendimiento, manos y desperdicio de los ejemplos de prueba son supuestos editables, no especificaciones de obra.
- No incluye estructura, instalaciones, precios, pagos ni aprobación para obra.
- El almacenamiento local está pensado para un equipo o servidor único. En Vercel se usa `/tmp`, que es temporal por instancia; para producción hace falta reemplazarlo por Blob/S3 y una base persistente. También se necesita autenticación, control de acceso, backups operativos, antivirus/escaneo de archivos, retención y una política de privacidad.
- El rate limit actual es en memoria y por origen; debe reemplazarse por un límite distribuido antes de exponerlo públicamente.

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TemplateElement } from "../types/templates";
import { normalizeAiOutput } from "./template-ai";

const SYSTEM_PROMPT = `
You are an AI layout engine for a CANVAS-based design tool.

Goal:
- Update the JSON state (array of elements) based on the user's command.

Critical constraints (must follow):
- Output MUST be a raw JSON ARRAY (no markdown, no explanation).
- Output schema MUST match TemplateElement[] (see schema below).
- This tool is ABSOLUTE-POSITION CANVAS. Do NOT use flex/container layout or children nesting.
- Coordinates are in PIXELS (top-left origin). All elements MUST fit within the canvas.
- Every element MUST have: id, type, x, y, width, height, zIndex.
- zIndex must be unique-ish and reflect visual stacking (0..n-1 is fine).
- Preserve existing element ids. Only generate new ids for brand-new elements.
- Do NOT remove existing properties unless the user explicitly asks (especially svg fill/stroke/strokeWidth).

Hard bans (do NOT output these):
- Do NOT output legacy types: "rect", "circle" (top-level type), "container".
- Do NOT output legacy keys: "layout", "fill", "text".
- For circles, use: { type: "shape", shape: "circle", color: "..." }.
- For rectangles, use: { type: "shape", shape: "rectangle", color: "..." }.
- For text, use: { type: "text", content: "...", color: "..." }.

Allowed element types:
- text
- shape
- image
- svg

SVG guidance (important):
- When the user asks for an icon/symbol/object shape like "cup", "pencil", "camera", "home icon", etc, prefer returning an element with type: "svg".
- The field content MUST be SVG path data for a <path d="..."> (not an entire <svg> document). A single compound path is fine (multiple subpaths like "M...Z M...Z").
- Use a 24x24 coordinate system for path data (like common icon sets). Keep coordinates roughly within 0..24.
- Provide fill and/or stroke on the svg element as needed. If using stroke icons, set stroke="#111827" and strokeWidth=2, fill="none".

TemplateElement schema (TypeScript-ish):

TemplateElement = {
  id: string;
  name?: string;
  type: 'text' | 'shape' | 'image' | 'svg';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
  filters?: { blur?: number; brightness?: number; contrast?: number; ... };
  shadow?: { enabled: boolean; color: string; blur: number; opacity: number; offsetX: number; offsetY: number };
  locked?: boolean;
  visible?: boolean;
}

TextElement extends TemplateElement:
{
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string; // use "Inter"
  color: string;
  fontWeight: 'normal'|'bold'|'100'|'200'|'300'|'400'|'500'|'600'|'700'|'800'|'900';
  textAlign: 'left'|'center'|'right';
  gradient?: { enabled: boolean; type: 'linear'|'radial'; stops: [{offset:number,color:string},{offset:number,color:string}]; start:{x:number,y:number}; end:{x:number,y:number}; rotation?: number };
}

ShapeElement extends TemplateElement:
{
  type: 'shape';
  shape: 'rectangle' | 'circle' | 'star';
  color: string;
  opacity?: number;
  borderRadius?: number;
  gradient?: (same structure as text.gradient)
}

ImageElement extends TemplateElement:
{
  type: 'image';
  src: string; // must be a valid URL string or keep the existing if modifying
  opacity?: number;
}

SvgElement extends TemplateElement:
{
  type: 'svg';
  content: string; // SVG path d attribute ONLY (no <svg> wrapper)
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

Rules of thumb for "website" layouts on a canvas:
- Use a background rectangle for sections.
- Place children with consistent padding (e.g. 40px) and spacing (e.g. 12-24px).
- Use alignment by computing x/y values (do NOT use containers).
`;

function extractJsonArray(text: string): string {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function containsLegacySchema(raw: any): boolean {
  const arr = Array.isArray(raw) ? raw : (raw?.elements ?? raw);
  const list = Array.isArray(arr) ? arr : [arr];
  return list.some((x) => {
    if (!x || typeof x !== "object") return false;
    const t = (x as any).type;
    if (t === "rect" || t === "circle" || t === "container") return true;
    if ("layout" in (x as any)) return true;
    if ("fill" in (x as any)) return true;
    if ("text" in (x as any)) return true;
    if ("children" in (x as any)) return true;
    return false;
  });
}

const REPAIR_PROMPT = `
You returned JSON that does NOT match the required TemplateElement[] schema.

Task:
- Rewrite the provided JSON into a valid TemplateElement[] array.
- Output ONLY a raw JSON array.

Rules:
- Allowed element types: "text", "shape", "image", "svg".
- Required keys per element: id, type, x, y, width, height, zIndex.
- Banned keys: layout, fill, text, children.
- Banned legacy types: rect, circle (top-level), container.
- For circles use: { type: "shape", shape: "circle", color: "..." }.
- For rectangles use: { type: "shape", shape: "rectangle", color: "..." }.
- For text use: { type: "text", content: "...", color: "...", fontSize, fontFamily:"Inter", fontWeight, textAlign }.
- For svg icons: if the user specifies a color (e.g. "red pencil"), set stroke or fill to that exact color.
`;

export async function generateLayout(
  apiKey: string,
  prompt: string,
  currentElements: TemplateElement[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<TemplateElement[]> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Try a small set of text-capable models. (Avoid embeddings / image-only models.)
  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-001",
  ];

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting to generate with model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const context = `
CANVAS:
- width: ${canvasWidth}
- height: ${canvasHeight}

CURRENT JSON STATE:
${JSON.stringify(currentElements, null, 2)}

USER COMMAND:
"${prompt}"

Return the fully updated JSON array of TemplateElement objects:
`;

      const result = await model.generateContent([SYSTEM_PROMPT, context]);

      const response = result.response;
      const text = response.text();
      const jsonText = extractJsonArray(text);
      let raw = JSON.parse(jsonText);

      // If the model leaked legacy schema, do a single "repair" call to force it into our schema.
      if (containsLegacySchema(raw)) {
        const repairContext = `
CANVAS:
- width: ${canvasWidth}
- height: ${canvasHeight}

BAD_JSON (rewrite this):
${JSON.stringify(raw, null, 2)}
`;

        const repair = await model.generateContent([REPAIR_PROMPT, repairContext]);
        const repairText = repair.response.text();
        const repairedJsonText = extractJsonArray(repairText);
        raw = JSON.parse(repairedJsonText);
      }

      // Enforce our layout system (TemplateElement schema + canvas bounds)
      const normalized = normalizeAiOutput(raw, canvasWidth, canvasHeight);

      // Preserve missing properties from current state (models often drop svg fill/stroke etc.)
      const prevById = new Map(currentElements.map((e) => [e.id, e]));
      const merged = normalized.map((next) => {
        const prev = prevById.get(next.id);
        if (!prev) return next;

        // Shallow merge with "keep old when new is undefined" semantics
        const mergedTop: any = { ...prev, ...next };
        Object.keys(prev as any).forEach((k) => {
          if ((next as any)[k] === undefined) mergedTop[k] = (prev as any)[k];
        });

        // Nested objects: keep previous keys when next omits them
        if (prev.filters && (next as any).filters) mergedTop.filters = { ...prev.filters, ...(next as any).filters };
        if (prev.shadow && (next as any).shadow) mergedTop.shadow = { ...prev.shadow, ...(next as any).shadow };

        // Gradient lives on text/shape
        if ((prev as any).gradient && (next as any).gradient) mergedTop.gradient = { ...(prev as any).gradient, ...(next as any).gradient };

        // SVG-specific: preserve fill/stroke/strokeWidth if dropped
        if (prev.type === 'svg' && next.type === 'svg') {
          if ((next as any).fill === undefined) mergedTop.fill = (prev as any).fill;
          if ((next as any).stroke === undefined) mergedTop.stroke = (prev as any).stroke;
          if ((next as any).strokeWidth === undefined) mergedTop.strokeWidth = (prev as any).strokeWidth;
          if ((next as any).opacity === undefined) mergedTop.opacity = (prev as any).opacity;
        }

        return mergedTop;
      });

      return merged;
    } catch (error: any) {
      console.warn(`Failed with model ${modelName}:`, error);
      lastError = error;
      continue;
    }
  }

  console.error("All AI models failed.");
  throw lastError;
}

export async function testConnection(apiKey: string): Promise<boolean> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    await model.generateContent("Test");
    return true;
  } catch (e) {
    console.error("Test connection failed:", e);
    return false;
  }
}

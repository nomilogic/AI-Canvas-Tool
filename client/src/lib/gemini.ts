import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TemplateElement } from "../types/templates";
import {
  applyAiActions,
  normalizeAiOutput,
  type AIGenerationStrategy,
  type AiActionsResponse,
} from "./template-ai";

// Alternate strategy: the model returns actions (create/update/delete) rather than a full element array.
// This allows us to avoid sending the full element JSON back to the model for every prompt.
const ACTIONS_SYSTEM_PROMPT = `
You are an AI layout engine for a CANVAS-based design tool.

Goal:
- Generate an ACTION LIST to create/update/delete elements based on the user's command.

Critical constraints (must follow):
- Output MUST be a raw JSON OBJECT (no markdown, no explanation).
- Output MUST match: { "actions": AiAction[] }
- Do NOT output a full TemplateElement[] array.
- This tool is ABSOLUTE-POSITION CANVAS. Do NOT use flex/container layout or children nesting.
- Coordinates are in PIXELS (top-left origin). All elements MUST fit within the canvas.
- When updating, reference existing elements ONLY by the provided ids.

AiAction schema:
- { op: "create", element: TemplateElement }
- { op: "update", id: string, patch: Partial<TemplateElement> } // patch only includes fields to change; use null to remove an optional field
- { op: "delete", id: string }

TemplateElement schema:
- Must match the same TemplateElement types used by the app (text/shape/svg/image/icon) with required keys: id, type, x, y, width, height, zIndex.
- Preserve existing ids for updates.
- For new elements, include id or omit it (the app will assign one).

Hard bans (do NOT output these):
- Do NOT output legacy types: "rect", "circle" (top-level type), "container".
- Do NOT output legacy keys: "layout", "fill", "text".
- Do NOT output type "logo". Use type "image".
`;

const SYSTEM_PROMPT = `
You are an AI layout engine for a CANVAS-based design tool.

Goal:
- Update the JSON state (array of elements) based on the user's command.

CANVAS SIZE IS PROVIDED IN THE CONTEXT - YOU MUST RESPECT IT:
- The canvas dimensions are specified in the context (e.g., "width: 800", "height: 600").
- ALL elements MUST fit entirely within these canvas bounds.
- NO element should have x+width > canvas_width, y+height > canvas_height, x < 0, or y < 0.
- If an element would extend beyond bounds, reduce its size or reposition it.
- When the user specifies canvas size, that OVERRIDES any assumptions you might make.

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
- Do NOT output type "logo". Use type "image" for any bitmap/raster.
- For circles, use: { type: "shape", shape: "circle", color: "..." }.
- For rectangles, use: { type: "shape", shape: "rectangle", color: "..." }.
- For text, use: { type: "text", content: "...", color: "..." }.

Allowed element types:
- text (for real text only)
- image (for bitmap/raster only - generate these when the user mentions image-like content: "image", "photo", "picture", "bitmap", etc.)
  - IMPORTANT: Every image element MUST include a non-empty "src" string.
  - If you cannot provide a real image URL or data URI, use a placeholder:
    - "https://via.placeholder.com/{width}x{height}?text={ShortLabel}"
- shape (for primitives like rectangles/circles/lines/stars/polygons)
- svg (for custom SVG paths/illustrations - generate these when user asks for a shape like "create a star", "draw a checkmark", "make a circle")
- icon (for Lucide icons)

Element type decision rule (IMPORTANT):
- If the user mentions bitmap terms like "png", "jpg", "jpeg", "webp", "gif", "photo", "picture", or explicitly says "image" → use type: "image".
  - src must be a real URL or a data URI (data:image/png;base64,...). If you cannot generate pixels, use a placeholder URL.
- If the user asks to draw/make an object WITHOUT requesting bitmap output → prefer type: "svg".
  - Examples: "draw a car", "create a star", "make a circle" → type: "svg" with SVG path data.
- User says "Create a shape" → type: "shape" or type: "svg".
- User says "Add an icon" → type: "icon" with iconName.

SVG guidance (important):
- When the user asks for an icon/symbol/object shape like "cup", "pencil", "camera", "home icon", etc, return type: "svg".
- The field content MUST be SVG path data for a <path d="..."> (not an entire <svg> document). A single compound path is fine (multiple subpaths like "M...Z M...Z").
- Use a 24x24 coordinate system for path data (like common icon sets). Keep coordinates roughly within 0..24.
- For stroke-style icons: fill="none", stroke="<color>", strokeWidth=2.
- For filled icons: fill="<color>", stroke="transparent".

Visual effects schema (must follow exactly):
- Opacity for ANY element (including text/shape/svg/image) is stored on the top-level key: opacity (0..1).
- Shadows MUST use: shadow: { enabled:true, color:"#000000", blur:10, opacity:0.5, offsetX:5, offsetY:5 }.
- Gradients are ONLY allowed on text and shape using: gradient: { enabled:true, type:"linear"|"radial", stops:[{offset:0,color:"#..."},{offset:1,color:"#..."}], start:{x:number,y:number}, end:{x:number,y:number}, rotation?:number }.
- Do NOT invent alternative gradient/shadow structures.

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
  opacity?: number; // 0..1
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
  src: string; // must be a valid URL string (data:image/png;base64,... for generated transparent PNGs, or regular image URLs)
  opacity?: number;
}

NOTE ON GENERATING TRANSPARENT IMAGES:
- You can generate small transparent PNG images as base64 data URIs.
- Format: "data:image/png;base64,iVBORw0KGgoAAAANS..."
- Use this for creating small icons, shapes, or custom graphics programmatically.
- Always generate minimal PNGs (16x16, 32x32, 64x64) to keep payload small.
- Keep the alpha channel (transparency) intact.
- Example usage: user says "Add a red dot" → generate a tiny red circle PNG as base64 → set src to the data URI.

SvgElement extends TemplateElement:
{
  type: 'svg';
  content: string; // SVG path d attribute ONLY (no <svg> wrapper)
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

IconElement extends TemplateElement:
{
  type: 'icon';
  iconName: string; // Must be one of: Heart, Check, X, Plus, Minus, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Smile, Zap, Sparkles, Crown, Flame, Shield, Star
  color?: string; // Icon color (e.g. "#000000")
  opacity?: number;
}

PNG GENERATION GUIDE - CREATING IMAGES:
For image creation requests, you have several options:

OPTION 1: Use External Image Generation APIs (RECOMMENDED)
- Use services like:
  * https://api.placeholder.com/ for placeholder images
  * Stability AI API for detailed image generation
  * OpenAI DALL-E API for AI-generated images
  * Unsplash API for stock photos
- Example: For "create a red car 200x200", call an image generation API with prompt "red car, red background"
- The service returns an image URL
- Use that URL as the src property

OPTION 2: Use Data URLs with SVG (FAST & RELIABLE)
- For drawable content (car, star, house, person), use type: "svg" instead
- SVG is vector-based, scalable, and works great for illustrated content
- Much faster than waiting for external API calls

OPTION 3: Use Placeholder Services
- For quick prototyping: https://via.placeholder.com/{width}x{height}/{color}
- Example: "https://via.placeholder.com/200x200/ff0000" for red 200x200
- Example: "https://via.placeholder.com/200x200/3b82f6/ffffff?text=Car" for blue with white text

IMAGE GENERATION EXAMPLES:

User says "Create a red car 200x200":
Option 1 (Real image generation): Call image generation API → get URL
Option 2 (SVG): Use type: "svg" with car drawing
Option 3 (Placeholder): "https://via.placeholder.com/200x200/ff0000?text=Car"

RECOMMENDED OUTPUT (using placeholder):
{
  type: "image",
  src: "https://via.placeholder.com/200x200/ff0000",
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  zIndex: 1,
  id: "generated-image-1",
  opacity: 1
}

RECOMMENDED OUTPUT (using SVG for drawings):
{
  type: "svg",
  content: "M50,50 L150,50 L150,100 L50,100 Z M70,110 C70,120 75,125 85,125 C95,125 100,120 100,110 M130,110 C130,120 135,125 145,125 C155,125 160,120 160,110",
  fill: "#ff0000",
  stroke: "#000000",
  strokeWidth: 2,
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  zIndex: 1,
  id: "car-svg",
  opacity: 1
}

Rules of thumb for "website" layouts on a canvas:
- Use a background rectangle for sections.
- Place children with consistent padding (e.g. 40px) and spacing (e.g. 12-24px).
- Use alignment by computing x/y values (do NOT use containers).

EXAMPLES - FOR FULL-WIDTH/FULL-HEIGHT ELEMENTS:
- For a full-width bar at the top: { type: "shape", shape: "rectangle", x: 0, y: 0, width: canvas_width, height: 60, color: "#..." }
- For a full-width bar at the bottom: { type: "shape", shape: "rectangle", x: 0, y: canvas_height-60, width: canvas_width, height: 60, color: "#..." }
- For a full-height sidebar: { type: "shape", shape: "rectangle", x: 0, y: 0, width: 200, height: canvas_height, color: "#..." }
- Key: For full-width, always use width = canvas_width, and x = 0. For full-height, always use height = canvas_height, and y = 0.

CRITICAL MATH FOR SIZING:
- If canvas is 800x600:
  - Full-width element: x=0, y=any, width=800, height=any (NO MORE, NO LESS)
  - Full-height element: x=any, y=0, width=any, height=600 (NO MORE, NO LESS)
  - Bottom-aligned bar: y = 600-height (e.g., 60px tall bar: y=540)
  - RIGHT-aligned element: x = 800-width
`;

function extractJsonArray(text: string): string {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function extractJsonObject(text: string): string {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function summarizeElementsForPrompt(elements: TemplateElement[]): unknown {
  // Compact summary (ids + bounds + a few key fields) to avoid sending full JSON.
  const MAX_TEXT = 120;
  const MAX_SVG = 160;

  return elements.map((el) => {
    const base: any = {
      id: el.id,
      type: el.type,
      name: (el as any).name,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: (el as any).rotation ?? 0,
      zIndex: el.zIndex,
    };

    if (el.type === "text") {
      const content = (el as any).content;
      if (typeof content === "string") base.content = content.slice(0, MAX_TEXT);
      base.fontSize = (el as any).fontSize;
      base.color = (el as any).color;
      base.textAlign = (el as any).textAlign;
    }

    if (el.type === "shape") {
      base.shape = (el as any).shape;
      base.color = (el as any).color;
    }

    if (el.type === "svg") {
      const content = (el as any).content;
      if (typeof content === "string") base.content = content.slice(0, MAX_SVG);
      base.fill = (el as any).fill;
      base.stroke = (el as any).stroke;
    }

    if (el.type === "image") {
      const src = (el as any).src;
      base.src = typeof src === "string" ? (src.startsWith("data:image/") ? "__DATA_URI_OMITTED__" : src.slice(0, 120)) : "";
    }

    if (el.type === "icon") {
      base.iconName = (el as any).iconName;
      base.color = (el as any).color;
    }

    return base;
  });
}

function shouldGenerateImagesFromPrompt(prompt: string): boolean {
  const s = prompt.toLowerCase();

  // If the user is explicitly saying "no image" / "don't add an image" etc, don't generate.
  if (/(no|without)\s+(an?\s+)?(image|photo|picture|bitmap|raster)|don'?t\s+(add|create|generate|make)\s+(an?\s+)?(image|photo|picture|bitmap|raster)/.test(s)) {
    return false;
  }

  // Broad trigger: whenever the user mentions image-like content.
  // This is intentionally permissive per your request.
  return /(image|photo|picture|bitmap|raster|png|jpe?g|gif|webp|stock\s*photo|photograph|screenshot)/.test(s);
}

function isPlaceholderImageSrc(src: unknown): boolean {
  if (typeof src !== 'string') return true;
  const s = src.trim();
  if (!s) return true;
  // Our fallback + common placeholder patterns
  return s.startsWith('https://via.placeholder.com/') || s.includes('placeholder.com');
}

function wantsTransparentBackground(prompt: string): boolean {
  const s = prompt.toLowerCase();

  // Common ways users ask for alpha/transparent exports.
  return /transparent(\s*(bg|background))?|no\s*background|without\s*background|alpha\s*channel|png\s*transparent/.test(s);
}

type Rgb = { r: number; g: number; b: number };

function colorDistance(a: Rgb, b: Rgb): number {
  // Euclidean distance in RGB space (0..441)
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function chromaKeyToTransparentPngDataUri(
  dataUri: string,
  chroma: Rgb,
  tolerance: number,
): Promise<string> {
  // Only handle data URIs.
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) return dataUri;

  // Decode via <img> + canvas.
  const img = new Image();
  img.src = dataUri;
  try {
    await img.decode();
  } catch {
    // If decode fails, don't block the pipeline.
    return dataUri;
  }

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) return dataUri;

  ctx.drawImage(img, 0, 0);

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // Sample 4 corners to estimate the real background color (flash-image may not produce exact #00FF00).
  const sample = (x: number, y: number): Rgb => {
    const ix = Math.min(w - 1, Math.max(0, Math.round(x)));
    const iy = Math.min(h - 1, Math.max(0, Math.round(y)));
    const idx = (iy * w + ix) * 4;
    return { r: d[idx], g: d[idx + 1], b: d[idx + 2] };
  };

  const c1 = sample(0, 0);
  const c2 = sample(w - 1, 0);
  const c3 = sample(0, h - 1);
  const c4 = sample(w - 1, h - 1);
  const bg: Rgb = {
    r: Math.round((c1.r + c2.r + c3.r + c4.r) / 4),
    g: Math.round((c1.g + c2.g + c3.g + c4.g) / 4),
    b: Math.round((c1.b + c2.b + c3.b + c4.b) / 4),
  };

  // Two heuristics:
  // 1) close to estimated background color
  // 2) "green-screen" dominance (covers slight gradients/artifacts)
  const greenDominanceDelta = 35;
  const greenMin = 120;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    const px: Rgb = { r, g, b };

    const distToBg = colorDistance(px, bg);
    const distToRequested = colorDistance(px, chroma);

    const isNearBg = distToBg <= tolerance;
    const isNearRequested = distToRequested <= tolerance;

    const maxRB = Math.max(r, b);
    const isGreenScreen = g >= greenMin && g - maxRB >= greenDominanceDelta;

    if (isNearBg || isNearRequested || isGreenScreen) {
      d[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Prefer toDataURL as the most compatible option.
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return dataUri;
  }
}

function pickAspectHint(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return '1:1';
  const r = width / height;
  const candidates: Array<{ label: string; ratio: number }> = [
    { label: '1:1', ratio: 1 },
    { label: '16:9', ratio: 16 / 9 },
    { label: '9:16', ratio: 9 / 16 },
    { label: '4:3', ratio: 4 / 3 },
    { label: '3:4', ratio: 3 / 4 },
    { label: '3:2', ratio: 3 / 2 },
    { label: '2:3', ratio: 2 / 3 },
    { label: '21:9', ratio: 21 / 9 },
  ];
  candidates.sort((a, b) => Math.abs(a.ratio - r) - Math.abs(b.ratio - r));
  return candidates[0]?.label ?? '1:1';
}

async function generateImageDataUriFlashImage(
  apiKey: string,
  prompt: string,
): Promise<{ dataUri: string; mimeType: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Debug: distinguish layout (gemini-2.5-flash) from pixel generation (gemini-2.5-flash-image)
  console.log('Calling image generation model: gemini-2.5-flash-image');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        // Ask for images only (avoid extra text that could bloat response)
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`flash-image generateContent failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];

  for (const p of parts) {
    const inline = p?.inlineData ?? p?.inline_data;
    const b64 = inline?.data;
    const mimeType = inline?.mimeType ?? inline?.mime_type ?? 'image/png';
    if (typeof b64 === 'string' && b64.length > 0) {
      return { dataUri: `data:${mimeType};base64,${b64}`, mimeType };
    }
  }

  throw new Error('flash-image response did not include inlineData');
}

function ensureImageElementsWhenRequested(
  userPrompt: string,
  elements: TemplateElement[],
  prevById: Map<string, TemplateElement>,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  if (!shouldGenerateImagesFromPrompt(userPrompt)) return elements;

  // If the model created a NEW svg as a stand-in (common for "car"), convert it to an image
  // so we can hydrate it with flash-image.
  const newSvg = elements.filter((e) => e.type === 'svg' && !prevById.has(e.id));
  if (newSvg.length === 1) {
    const el = newSvg[0];
    const w = Math.max(1, Math.round(el.width));
    const h = Math.max(1, Math.round(el.height));
    const label = encodeURIComponent((el as any).name ?? 'Image');
    return elements.map((e) => {
      if (e.id !== el.id) return e;
      return {
        ...(e as any),
        type: 'image',
        // placeholder until we hydrate
        src: `https://via.placeholder.com/${w}x${h}?text=${label}`,
      } as TemplateElement;
    });
  }

  // If we already have a placeholder image element, hydrate will pick it up.
  const hasPlaceholderImage = elements.some((e) => e.type === 'image' && isPlaceholderImageSrc((e as any).src));
  if (hasPlaceholderImage) return elements;

  // Otherwise: inject a new image element centered on canvas.
  const w = Math.max(64, Math.round(canvasWidth * 0.35));
  const h = Math.max(64, Math.round(canvasHeight * 0.35));
  const x = Math.max(0, Math.round((canvasWidth - w) / 2));
  const y = Math.max(0, Math.round((canvasHeight - h) / 2));
  const zIndex = Math.max(-1, ...elements.map((e) => e.zIndex ?? 0)) + 1;

  const injected: TemplateElement = {
    id: crypto.randomUUID(),
    name: 'Generated Image',
    type: 'image',
    x,
    y,
    width: w,
    height: h,
    zIndex,
    opacity: 1,
    src: `https://via.placeholder.com/${w}x${h}?text=Image`,
  } as any;

  return [...elements, injected];
}

async function hydrateNewPlaceholderImages(
  apiKey: string,
  userPrompt: string,
  elements: TemplateElement[],
  prevById: Map<string, TemplateElement>,
): Promise<TemplateElement[]> {
  if (!shouldGenerateImagesFromPrompt(userPrompt)) return elements;

  const promptLower = userPrompt.toLowerCase();
  const allowReplaceImage = /(replace|change|swap|update)\s+(the\s+)?(image|photo|picture)|new\s+(image|photo|picture)\s+for\s+(this|that)|regenerate\s+(the\s+)?(image|photo|picture)/.test(promptLower);

  let targets: TemplateElement[] = [];

  if (allowReplaceImage) {
    // If user explicitly asked to replace/regenerate an image, regenerate the most-relevant one.
    // Without a UI selection signal, we choose the last image in the current array (typically the one user just created/mentioned).
    const imgs = elements.filter((e) => e.type === 'image');
    const last = imgs[imgs.length - 1];
    if (last) targets = [last];
  } else {
    // Default behavior: generate for ANY image elements that still have placeholder src.
    // We used to require "new" elements only, but that prevents the image model from being called on later prompts
    // when the layout model reuses ids or keeps placeholders.
    targets = elements.filter((el) => {
      if (el.type !== 'image') return false;
      const src = (el as any).src;
      if (!isPlaceholderImageSrc(src)) return false;
      return true;
    });
  }

  console.log('hydrateNewPlaceholderImages', {
    allowReplaceImage,
    numElements: elements.length,
    numPrev: prevById.size,
    numTargets: targets.length,
    targets: targets.map((t) => ({
      id: t.id,
      name: (t as any).name,
      src: (t as any).src,
      isPlaceholder: isPlaceholderImageSrc((t as any).src),
      isPrev: prevById.has(t.id),
    })),
  });

  if (targets.length === 0) return elements;

  const maxToGenerate = allowReplaceImage ? 1 : 2;
  const toGenerate = targets.slice(0, maxToGenerate);

  const generatedById = new Map<string, string>();

  for (const el of toGenerate) {
    const name = (el as any).name ?? 'Image';
    const aspectHint = pickAspectHint(el.width, el.height);

    const needsTransparentBg = wantsTransparentBackground(userPrompt);

    // Use a chroma key background when user wants transparency, then post-process to alpha.
    // Note: This can remove real green pixels too; we try to discourage green in the subject.
    const CHROMA: Rgb = { r: 0, g: 255, b: 0 };

    const imagePrompt = [
      'Generate a single high-quality PNG image for a design canvas.',
      `Subject: ${String(name)}`,
      `User request: ${userPrompt}`,
      `Aspect ratio: ${aspectHint}.`,
      needsTransparentBg
        ? 'Background: solid chroma key green (#00FF00), completely flat, no gradients. Do NOT include green in the subject.'
        : 'Background: natural, matching the user request.',
      'No text unless the user explicitly asked for text.',
    ].join('\n');

    let { dataUri } = await generateImageDataUriFlashImage(apiKey, imagePrompt);

    if (needsTransparentBg) {
      // More aggressive by default because model often produces near-green, not exact #00FF00.
      dataUri = await chromaKeyToTransparentPngDataUri(dataUri, CHROMA, 70);
    }

    generatedById.set(el.id, dataUri);
  }

  return elements.map((el) => {
    if (el.type !== 'image') return el;
    const nextSrc = generatedById.get(el.id);
    if (!nextSrc) return el;
    return { ...(el as any), src: nextSrc } as TemplateElement;
  });
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
- ENSURE ALL ELEMENTS FIT WITHIN THE CANVAS BOUNDS (see dimensions provided).

Rules:
- Allowed element types: "text", "shape", "image", "svg".
- Do NOT output type "logo".
- Required keys per element: id, type, x, y, width, height, zIndex.
- For type "image", you MUST include a non-empty "src" string.
  - If missing, use: "https://via.placeholder.com/{width}x{height}?text=Image"
- Banned keys: layout, fill, text, children.
- Banned legacy types: rect, circle (top-level), container.
- For circles use: { type: "shape", shape: "circle", color: "..." }.
- For rectangles use: { type: "shape", shape: "rectangle", color: "..." }.
- For text use: { type: "text", content: "...", color: "...", fontSize, fontFamily:"Inter", fontWeight, textAlign }.
- For svg icons: output ONLY path data in content; use 24x24 coordinate system.
- Visual effects must follow schema: opacity (top-level 0..1), shadow (enabled/color/blur/opacity/offsetX/offsetY), gradient (text/shape only).
- If the element is NOT an image and NOT text, it MUST be either type "shape" or type "svg".
- Canvas constraint: NO element should exceed canvas bounds. If any element is outside bounds, reposition or resize it to fit.
`;

/**
 * Enforces full-width and full-height constraints based on user command keywords.
 * If user says "full width", "full height", "full size", etc., ensure elements match those dimensions.
 */
function enforceFullDimensionConstraints(
  elements: TemplateElement[],
  prompt: string,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  const promptLower = prompt.toLowerCase();
  
  // Detect full-width requests
  const hasFullWidth = /full\s*width|full\s*size|width.*full|entire.*width|span.*full/.test(promptLower);
  // Detect full-height requests
  const hasFullHeight = /full\s*height|full\s*size|height.*full|entire.*height|span.*full/.test(promptLower);
  
  // Detect "bar", "header", "footer", "nav" patterns that should span horizontally
  const isBar = /bar|header|footer|nav|top\s*bar|bottom\s*bar|strip/.test(promptLower);
  
  // Detect position keywords for alignment
  const isTopElement = /top|header|nav/.test(promptLower);
  const isBottomElement = /bottom|footer/.test(promptLower);
  const isFullHeight = /sidebar|full\s*height|entire\s*height/.test(promptLower);
  
  return elements.map((el) => {
    // For bars/headers/footers with "full" keyword or positional keyword
    if ((hasFullWidth || isBar) && (isTopElement || isBottomElement || /at\s*top|at\s*bottom/.test(promptLower))) {
      return {
        ...el,
        x: 0,
        width: canvasWidth,
      };
    }
    
    // For any "full width" request
    if (hasFullWidth) {
      return {
        ...el,
        x: 0,
        width: canvasWidth,
      };
    }
    
    // For any "full height" request
    if (hasFullHeight || isFullHeight) {
      return {
        ...el,
        y: 0,
        height: canvasHeight,
      };
    }
    
    return el;
  });
}

function sanitizeElementsForPrompt(elements: TemplateElement[]): unknown {
  // Avoid blowing up prompt tokens with data URIs or huge SVG/text blobs.
  // The model doesn't need the full base64 payload; it only needs to know that an image exists.
  const MAX_TEXT = 600;
  const MAX_SVG = 1200;

  return elements.map((el) => {
    const out: any = { ...el };

    if (out.type === 'image') {
      const src = out.src;
      if (typeof src === 'string') {
        if (src.startsWith('data:image/')) {
          out.src = '__DATA_URI_OMITTED__';
        } else if (src.length > 300) {
          out.src = src.slice(0, 120) + '…__TRUNCATED__';
        }
      }
    }

    if (out.type === 'text') {
      const content = out.content;
      if (typeof content === 'string' && content.length > MAX_TEXT) {
        out.content = content.slice(0, MAX_TEXT) + '…__TRUNCATED__';
      }
    }

    if (out.type === 'svg') {
      const content = out.content;
      if (typeof content === 'string' && content.length > MAX_SVG) {
        out.content = content.slice(0, MAX_SVG) + '…__TRUNCATED__';
      }
    }

    // Drop any accidental huge keys
    delete out.history;
    delete out.imageData;

    return out;
  });
}

export async function generateLayout(
  apiKey: string,
  prompt: string,
  currentElements: TemplateElement[],
  canvasWidth: number,
  canvasHeight: number,
  customSystemPrompt?: string,
  options?: { strategy?: AIGenerationStrategy },
): Promise<TemplateElement[]> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Try a small set of text-capable models. (Avoid embeddings / image-only models.)
  // NOTE: Even if the user asks for an "image", this function still expects the model to return JSON.
  // Image binaries should be created separately (or via placeholders) to avoid breaking JSON parsing.
  // Per project requirement: use only Flash for layout JSON (no Pro / Vision).
  const modelsToTry = [
    "gemini-2.5-flash",
  ];

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting to generate with model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const promptLower = prompt.toLowerCase();

      const strategy: AIGenerationStrategy = options?.strategy ?? "full";

      const context =
        strategy === "schema"
          ? `
CANVAS DIMENSIONS (STRICT - ALL ELEMENTS MUST FIT):
- width: ${canvasWidth} pixels
- height: ${canvasHeight} pixels
- Valid bounds: x >= 0, y >= 0, x+width <= ${canvasWidth}, y+height <= ${canvasHeight}

EXISTING ELEMENTS (SUMMARY - IDs ARE AUTHORITATIVE):
${JSON.stringify(summarizeElementsForPrompt(currentElements), null, 2)}

USER COMMAND:
"${prompt}"

Return a JSON object: {"actions": [...]}.
- Use update/delete with the provided ids.
- Use create for new elements.
- Patches should only include changed fields. Use null to remove an optional field.
`
          : `
CANVAS DIMENSIONS (STRICT - ALL ELEMENTS MUST FIT):
- width: ${canvasWidth} pixels
- height: ${canvasHeight} pixels
- Valid x range: 0 to ${canvasWidth} (element's right edge = x + width must be <= ${canvasWidth})
- Valid y range: 0 to ${canvasHeight} (element's bottom edge = y + height must be <= ${canvasHeight})

IMPORTANT: When generating elements:
- Never output x < 0, y < 0, x+width > ${canvasWidth}, or y+height > ${canvasHeight}
- If user asks for "full width" or "full height", use EXACTLY canvas_width (${canvasWidth}) or canvas_height (${canvasHeight})
- Do NOT reduce full-width/full-height elements. They should span the ENTIRE dimension.
- Example: For canvas ${canvasWidth}x${canvasHeight}, "full-width bar on top" should be: {x:0, y:0, width:${canvasWidth}, height:60}

CURRENT JSON STATE:
${JSON.stringify(sanitizeElementsForPrompt(currentElements), null, 2)}

USER COMMAND:
"${prompt}"

Return the fully updated JSON array of TemplateElement objects (ensuring ALL elements fit within canvas):
`;

      const systemPromptToUse =
        customSystemPrompt || (strategy === "schema" ? ACTIONS_SYSTEM_PROMPT : SYSTEM_PROMPT);

      const result = await model.generateContent([systemPromptToUse, context]);

      const response = result.response;
      const text = response.text();

      if (strategy === "schema") {
        const objText = extractJsonObject(text);
        const parsed = JSON.parse(objText) as AiActionsResponse;
        const actions = Array.isArray((parsed as any)?.actions) ? (parsed as any).actions : [];

        const applied = applyAiActions(currentElements, actions, canvasWidth, canvasHeight, prompt);

        const prevById = new Map(currentElements.map((e) => [e.id, e]));

        const enforced = enforceFullDimensionConstraints(applied, prompt, canvasWidth, canvasHeight);
        const ensured = ensureImageElementsWhenRequested(prompt, enforced, prevById, canvasWidth, canvasHeight);
        const hydrated = await hydrateNewPlaceholderImages(apiKey, prompt, ensured, prevById);
        return hydrated;
      }

      const jsonText = extractJsonArray(text);
      let raw = JSON.parse(jsonText);

      // If the model leaked legacy schema, do a single "repair" call to force it into our schema.
      if (containsLegacySchema(raw)) {
        const repairContext = `
CANVAS DIMENSIONS (STRICT - ALL ELEMENTS MUST FIT):
- width: ${canvasWidth} pixels
- height: ${canvasHeight} pixels
- Valid bounds: x >= 0, y >= 0, x+width <= ${canvasWidth}, y+height <= ${canvasHeight}

IMPORTANT: 
- Ensure all repaired elements fit within these bounds. Reduce sizes or reposition if needed.
- For full-width elements, use width = ${canvasWidth} (not less)
- For full-height elements, use height = ${canvasHeight} (not less)

BAD_JSON (rewrite this to valid TemplateElement[] with proper bounds):
${JSON.stringify(sanitizeElementsForPrompt(normalizeAiOutput(raw, canvasWidth, canvasHeight)), null, 2)}
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

        // Image-specific: by default, treat an existing image's src as immutable.
        // The layout model frequently overwrites src (often with placeholders), which looks like "it removed my image".
        // If the user explicitly asks to replace/change the image, we allow src changes.
        if (prev.type === 'image' && next.type === 'image') {
          const prevSrc = (prev as any).src;
          const nextSrc = (next as any).src;

          const allowReplaceImage = /(replace|change|swap|update)\s+(the\s+)?(image|photo|picture)|new\s+(image|photo|picture)\s+for\s+(this|that)|regenerate\s+(the\s+)?(image|photo|picture)/.test(promptLower);

          if (!allowReplaceImage) {
            // Keep whatever we already had.
            if (typeof prevSrc === 'string' && prevSrc.trim() !== '') {
              mergedTop.src = prevSrc;
            }
          } else {
            // Even when replacing, never replace a real image with an empty/placeholder.
            if (isPlaceholderImageSrc(nextSrc) && !isPlaceholderImageSrc(prevSrc)) {
              mergedTop.src = prevSrc;
            }
            if (typeof nextSrc === 'string' && nextSrc.trim() === '' && typeof prevSrc === 'string' && prevSrc.trim() !== '') {
              mergedTop.src = prevSrc;
            }
          }
        }

        // SVG-specific: preserve fill/stroke/strokeWidth if dropped
        if (prev.type === 'svg' && next.type === 'svg') {
          if ((next as any).fill === undefined) mergedTop.fill = (prev as any).fill;
          if ((next as any).stroke === undefined) mergedTop.stroke = (prev as any).stroke;
          if ((next as any).strokeWidth === undefined) mergedTop.strokeWidth = (prev as any).strokeWidth;
          if ((next as any).opacity === undefined) mergedTop.opacity = (prev as any).opacity;
        }

        return mergedTop;
      });

      // If the model "forgets" to include existing elements, keep them by default.
      // This prevents accidental loss of previously-generated images.
      // (If the user explicitly asks to delete/clear/reset, we allow dropping.)
      const allowDropExisting = /(\bdelete\b|\bremove\b|\bclear\b|\breset\b|start\s*over|from\s*scratch|wipe|empty\s*canvas)/.test(promptLower);
      const mergedIds = new Set(merged.map((e) => e.id));
      const preserved = allowDropExisting
        ? []
        : currentElements.filter((e) => !mergedIds.has(e.id));

      const mergedWithPreserved = [...merged, ...preserved];

      // Enforce full-width/height constraints based on user command
      const enforced = enforceFullDimensionConstraints(mergedWithPreserved, prompt, canvasWidth, canvasHeight);

      // If prompt mentions bitmap/image terms, ensure we have an image element to hydrate.
      const ensured = ensureImageElementsWhenRequested(prompt, enforced, prevById, canvasWidth, canvasHeight);
      console.log('ensureImageElementsWhenRequested', {
        before: enforced.length,
        after: ensured.length,
        newImages: ensured.filter((e) => e.type === 'image' && !prevById.has(e.id)).map((e) => ({ id: e.id, src: (e as any).src })),
      });

      // Use gemini-2.5-flash-image to generate actual pixels and inject a data URI into image.src
      const hydrated = await hydrateNewPlaceholderImages(apiKey, prompt, ensured, prevById);
      console.log('hydrateNewPlaceholderImages result', {
        before: ensured.filter((e) => e.type === 'image').length,
        after: hydrated.filter((e) => e.type === 'image').length,
        generated: hydrated.filter((e) => e.type === 'image' && String((e as any).src ?? '').startsWith('data:image/')).map((e) => e.id),
      });

      return hydrated;
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

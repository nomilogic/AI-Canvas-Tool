import { z } from "zod";
import type {
  TemplateElement,
  TextElement,
  ShapeElement,
  LogoElement,
  SvgElement,
  FilterProps,
  ShadowProps,
  GradientProps,
} from "../types/templates";

// Note: The AI is not always reliable. This module:
// - extracts/validates a TemplateElement[]
// - fills defaults required by the editor
// - clamps geometry into the canvas bounds
// - (optionally) maps legacy CanvasElement output to the current TemplateElement schema

const zNumber = z.coerce.number();
const zOptionalNumber = z.coerce.number().optional();

const zFilterProps: z.ZodType<FilterProps> = z
  .object({
    blur: zOptionalNumber,
    brightness: zOptionalNumber,
    contrast: zOptionalNumber,
    grayscale: zOptionalNumber,
    hue: zOptionalNumber,
    invert: zOptionalNumber,
    opacity: zOptionalNumber,
    saturate: zOptionalNumber,
    sepia: zOptionalNumber,
  })
  .partial()
  .passthrough();

const zShadowProps: z.ZodType<ShadowProps> = z
  .object({
    enabled: z.coerce.boolean(),
    color: z.string(),
    blur: zNumber,
    opacity: zNumber,
    offsetX: zNumber,
    offsetY: zNumber,
  })
  .passthrough();

const zGradientProps: z.ZodType<GradientProps> = z
  .object({
    enabled: z.coerce.boolean(),
    type: z.enum(["linear", "radial"]),
    stops: z
      .array(z.object({ offset: zNumber, color: z.string() }))
      .min(2)
      .max(6),
    start: z.object({ x: zNumber, y: zNumber }),
    end: z.object({ x: zNumber, y: zNumber }),
    rotation: zOptionalNumber,
  })
  .passthrough();

const zTemplateBase = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.enum(["text", "logo", "shape", "svg", "image", "group"]),
    x: zNumber,
    y: zNumber,
    width: zNumber,
    height: zNumber,
    rotation: zOptionalNumber,
    zIndex: zNumber.optional(),
    filters: zFilterProps.optional(),
    shadow: zShadowProps.optional(),
    opacity: zOptionalNumber,
    locked: z.coerce.boolean().optional(),
    visible: z.coerce.boolean().optional(),
  })
  .passthrough();

const zText = zTemplateBase.extend({
  type: z.literal("text"),
  content: z.string(),
  fontSize: zNumber.default(32),
  fontFamily: z.string().default("Inter"),
  color: z.string().default("#111827"),
  fontWeight: z
    .enum(["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"])
    .default("bold"),
  textAlign: z.enum(["left", "center", "right"]).default("center"),
  backgroundColor: z.string().optional(),
  textOpacity: zOptionalNumber,
  backgroundOpacity: zOptionalNumber,
  padding: zOptionalNumber,
  borderRadius: zOptionalNumber,
  maxWidth: zOptionalNumber,
  gradient: zGradientProps.optional(),
});

const zShape = zTemplateBase.extend({
  type: z.literal("shape"),
  shape: z.enum([
    "rectangle",
    "circle",
    "line",
    "star",
    "triangle",
    "diamond",
    "pentagon",
    "hexagon",
    "octagon",
    "rounded-rectangle",
  ]),
  color: z.string().default("#3b82f6"),
  opacity: zOptionalNumber,
  borderRadius: zOptionalNumber,
  borderWidth: zOptionalNumber,
  borderColor: z.string().optional(),
  gradient: zGradientProps.optional(),
});

const zLogo = zTemplateBase.extend({
  type: z.enum(["logo", "image"]),
  // AI sometimes forgets to include src; we'll fill it with a placeholder later.
  src: z.string().optional(),
  opacity: zOptionalNumber,
  borderRadius: zOptionalNumber,
  borderColor: z.string().optional(),
  borderWidth: zOptionalNumber,
});

const zSvg = zTemplateBase.extend({
  type: z.literal("svg"),
  content: z.string(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: zOptionalNumber,
  opacity: zOptionalNumber,
});

const zIcon = zTemplateBase.extend({
  type: z.literal("icon"),
  iconName: z.string(),
  color: z.string().optional(),
  opacity: zOptionalNumber,
});

function extractPathDataFromSvgMarkup(markup: string): string | null {
  if (!markup) return null;
  const s = String(markup);

  // Collect all d="..." occurrences and join into one compound path.
  // Avoid String.matchAll for TS downlevel compatibility.
  const re = /d=("([^"]+)"|'([^']+)')/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const d = m[2] ?? m[3];
    if (typeof d === "string" && d.trim().length > 0) parts.push(d);
  }

  if (parts.length === 0) return null;
  return parts.join(" ");
}

function coerceSvgContent(item: any): any {
  if (!item || typeof item !== "object") return item;
  if (item.type !== "svg") return item;

  // common alternative key
  if (!item.content && typeof item.d === "string") {
    return { ...item, content: item.d };
  }

  // paths array
  if (!item.content && Array.isArray(item.paths)) {
    const joined = item.paths
      .map((p: any) => p?.d)
      .filter((d: any) => typeof d === "string" && d.trim().length > 0)
      .join(" ");
    if (joined) return { ...item, content: joined };
  }

  // full <svg> markup pasted into content
  if (typeof item.content === "string" && item.content.includes("<")) {
    const extracted = extractPathDataFromSvgMarkup(item.content);
    if (extracted) return { ...item, content: extracted };
  }

  return item;
}

function coerceImageContent(item: any): any {
  if (!item || typeof item !== "object") return item;
  if (item.type !== "image" && item.type !== "logo") return item;

  // Normalize type: we treat "logo" as an "image" in the editor.
  const normalizedType = item.type === "logo" ? "image" : item.type;

  // Common AI variants for the URL field
  const candidate =
    item.src ??
    item.url ??
    item.imageUrl ??
    item.imageURL ??
    item.image ??
    item.dataUri ??
    item.dataURI;

  // Base64 variant (sometimes returned without a data: prefix)
  const base64 = item.base64 ?? item.pngBase64 ?? item.png_base64;

  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return { ...item, type: normalizedType, src: candidate };
  }

  if (typeof base64 === "string" && base64.trim().length > 0) {
    const s = base64.trim();
    const src = s.startsWith("data:image/") ? s : `data:image/png;base64,${s}`;
    return { ...item, type: normalizedType, src };
  }

  // Leave src undefined here; downstream will fill it with a placeholder.
  return { ...item, type: normalizedType };
}

function coerceAiItem(item: any): any {
  return coerceImageContent(coerceSvgContent(item));
}

const zTemplateElement = z.discriminatedUnion("type", [zText, zShape, zLogo, zSvg, zIcon]);

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function ensureId(id: string | undefined) {
  // crypto.randomUUID is available in modern browsers
  return id && id.trim().length > 0 ? id : crypto.randomUUID();
}

function ensureZIndex(zIndex: number | undefined, idx: number) {
  return Number.isFinite(zIndex) ? (zIndex as number) : idx;
}

function normalizeGeometry(el: TemplateElement, canvasWidth: number, canvasHeight: number): TemplateElement {
  const width = clamp(el.width, 1, canvasWidth);
  const height = clamp(el.height, 1, canvasHeight);
  const x = clamp(el.x, 0, Math.max(0, canvasWidth - width));
  const y = clamp(el.y, 0, Math.max(0, canvasHeight - height));

  return {
    ...el,
    x,
    y,
    width,
    height,
  };
}

// Legacy CanvasElement (older AI prompt/schema)
// This is best-effort: containers are converted into a background rect + laid-out children.
export type LegacyCanvasElement = {
  id?: string;
  type: "rect" | "circle" | "text" | "image" | "container";
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  radius?: number;
  fill?: string;
  text?: string;
  fontSize?: number;
  rotation?: number;
  opacity?: number;
  layout?: "flex" | "absolute";
  direction?: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end";
  justify?: "start" | "center" | "end" | "between";
  padding?: number;
  children?: LegacyCanvasElement[];
};

function parseSize(value: number | string | undefined, fallback: number, total: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.endsWith("%")) {
      const pct = Number.parseFloat(s.slice(0, -1));
      if (Number.isFinite(pct)) return (pct / 100) * total;
    }
    const n = Number.parseFloat(s);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function estimateTextBox(text: string, fontSize: number) {
  // Very rough estimate; the editor lets user resize anyway.
  const chars = Math.max(1, text.length);
  const width = clamp(Math.round(chars * (fontSize * 0.6)), 50, 700);
  const height = clamp(Math.round(fontSize * 1.4), 20, 300);
  return { width, height };
}

function legacyToTemplate(
  legacy: LegacyCanvasElement,
  canvasWidth: number,
  canvasHeight: number,
  zIndexBase: number,
  out: TemplateElement[],
  parentOffset: { x: number; y: number } = { x: 0, y: 0 },
) {
  const x = (legacy.x ?? 0) + parentOffset.x;
  const y = (legacy.y ?? 0) + parentOffset.y;

  // Containers -> background rect + layout children
  if (legacy.type === "container") {
    const padding = legacy.padding ?? 0;
    const gap = legacy.gap ?? 0;
    const direction = legacy.direction ?? "column";

    const width = parseSize(legacy.width, 400, canvasWidth);
    const height = parseSize(legacy.height, 200, canvasHeight);

    // background
    const bg: ShapeElement = {
      id: ensureId(legacy.id),
      name: "Container",
      type: "shape",
      shape: "rectangle",
      x,
      y,
      width,
      height,
      zIndex: zIndexBase,
      rotation: legacy.rotation ?? 0,
      color: legacy.fill ?? "#ffffff",
      opacity: legacy.opacity ?? 1,
      borderRadius: legacy.radius,
    };
    out.push(normalizeGeometry(bg, canvasWidth, canvasHeight));

    const children = legacy.children ?? [];

    let cursorX = x + padding;
    let cursorY = y + padding;

    // naive layout: sequential in row/column
    children.forEach((child, idx) => {
      const childFont = child.fontSize ?? 24;
      const childText = child.text ?? "";

      const childW = child.type === "text"
        ? estimateTextBox(childText, childFont).width
        : parseSize(child.width, 120, width - padding * 2);

      const childH = child.type === "text"
        ? estimateTextBox(childText, childFont).height
        : parseSize(child.height, 60, height - padding * 2);

      const childX = direction === "row" ? cursorX : x + padding;
      const childY = direction === "row" ? y + padding : cursorY;

      legacyToTemplate(
        {
          ...child,
          x: childX - parentOffset.x,
          y: childY - parentOffset.y,
          width: childW,
          height: childH,
        },
        canvasWidth,
        canvasHeight,
        zIndexBase + 1 + idx,
        out,
        parentOffset,
      );

      if (direction === "row") cursorX += childW + gap;
      else cursorY += childH + gap;
    });

    return;
  }

  if (legacy.type === "rect") {
    const width = parseSize(legacy.width, 150, canvasWidth);
    const height = parseSize(legacy.height, 100, canvasHeight);
    const shape: ShapeElement = {
      id: ensureId(legacy.id),
      name: "Rectangle",
      type: "shape",
      shape: "rectangle",
      x,
      y,
      width,
      height,
      zIndex: zIndexBase,
      rotation: legacy.rotation ?? 0,
      color: legacy.fill ?? "#3b82f6",
      opacity: legacy.opacity ?? 1,
      borderRadius: legacy.radius,
    };
    out.push(normalizeGeometry(shape, canvasWidth, canvasHeight));
    return;
  }

  if (legacy.type === "circle") {
    // Legacy "circle" might provide radius OR width/height.
    // Our editor represents circles as shape='circle' with width/height = diameter.
    const widthFromLegacy = typeof legacy.width === "number" ? legacy.width : undefined;
    const heightFromLegacy = typeof legacy.height === "number" ? legacy.height : undefined;
    const diameterFromWH =
      widthFromLegacy && heightFromLegacy
        ? Math.min(widthFromLegacy, heightFromLegacy)
        : widthFromLegacy ?? heightFromLegacy;

    const radius = legacy.radius ?? (diameterFromWH ? diameterFromWH / 2 : Math.min(canvasWidth, canvasHeight) * 0.1);
    const diameter = Math.max(1, radius * 2);

    const shape: ShapeElement = {
      id: ensureId(legacy.id),
      name: "Circle",
      type: "shape",
      shape: "circle",
      x,
      y,
      width: diameter,
      height: diameter,
      zIndex: zIndexBase,
      rotation: legacy.rotation ?? 0,
      color: legacy.fill ?? "#3b82f6",
      opacity: legacy.opacity ?? 1,
    };
    out.push(normalizeGeometry(shape, canvasWidth, canvasHeight));
    return;
  }

  if (legacy.type === "text") {
    const fontSize = legacy.fontSize ?? 32;
    const content = legacy.text ?? "Text";
    const est = estimateTextBox(content, fontSize);
    const text: TextElement = {
      id: ensureId(legacy.id),
      name: "Text",
      type: "text",
      x,
      y,
      width: parseSize(legacy.width, est.width, canvasWidth),
      height: parseSize(legacy.height, est.height, canvasHeight),
      zIndex: zIndexBase,
      rotation: legacy.rotation ?? 0,
      content,
      fontSize,
      fontFamily: "Inter",
      color: legacy.fill ?? "#111827",
      textAlign: "center",
      fontWeight: "bold",
    };
    out.push(normalizeGeometry(text, canvasWidth, canvasHeight));
    return;
  }

  if (legacy.type === "image") {
    const width = parseSize(legacy.width, 200, canvasWidth);
    const height = parseSize(legacy.height, 200, canvasHeight);
    const img: LogoElement = {
      id: ensureId(legacy.id),
      name: "Image",
      type: "image",
      src: (legacy as any).src ?? "",
      x,
      y,
      width,
      height,
      zIndex: zIndexBase,
      rotation: legacy.rotation ?? 0,
      opacity: legacy.opacity ?? 1,
    };
    out.push(normalizeGeometry(img, canvasWidth, canvasHeight));
  }
}

function isProbablyLegacyCanvasElement(x: any): x is LegacyCanvasElement {
  if (!x || typeof x !== "object") return false;

  // Explicit legacy types
  const t = x.type;
  if (t === "rect" || t === "circle" || t === "container") return true;

  // Legacy-specific keys
  if ("layout" in x) return true;
  if ("fill" in x) return true;
  if ("text" in x) return true;
  if ("radius" in x) return true;
  if ("children" in x) return true;

  // Legacy allows percentage strings for sizing
  if (typeof x.width === "string" || typeof x.height === "string") return true;

  return false;
}

function renumberZIndex(elements: TemplateElement[]) {
  return elements.map((el, idx) => ({ ...el, zIndex: idx }));
}

function ensureImageSrc(el: TemplateElement): TemplateElement {
  if (el.type !== "image") return el;

  const src = (el as any).src;
  if (typeof src === "string" && src.trim().length > 0) return el;

  const w = Math.max(1, Math.round(el.width));
  const h = Math.max(1, Math.round(el.height));
  const label = encodeURIComponent((el as any).name ?? "Image");

  return {
    ...(el as any),
    // Safe default so the editor always has something renderable.
    src: `actual url or base64`,
  };
}

export function normalizeAiOutput(
  raw: unknown,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  // Common AI failure modes:
  // - returns { elements: [...] }
  // - returns a single object
  // - returns the older CanvasElement schema (or a mix of old+new)
  const maybeArray = (raw as any)?.elements ?? raw;

  const arr = Array.isArray(maybeArray) ? maybeArray : [maybeArray];

  const out: TemplateElement[] = [];

  // 1) Convert any legacy elements
  arr.forEach((item, idx) => {
    if (isProbablyLegacyCanvasElement(item)) {
      legacyToTemplate(item, canvasWidth, canvasHeight, out.length + idx, out);
    }
  });

  // 2) Keep any already-correct TemplateElements
  arr.forEach((item) => {
    const maybeCoerced = coerceAiItem(item);
    const res = zTemplateElement.safeParse(maybeCoerced);
    if (res.success) out.push(res.data as TemplateElement);
  });

  if (out.length === 0) return [];

  // Normalize IDs, geometry, and zIndex
  const normalized = out.map((el, idx) => {
    const withBase: TemplateElement = {
      ...el,
      id: ensureId((el as any).id),
      zIndex: ensureZIndex((el as any).zIndex, idx),
      rotation: (el as any).rotation ?? 0,
    } as TemplateElement;

    return normalizeGeometry(withBase, canvasWidth, canvasHeight);
  });

  // De-duplicate ids if AI returned duplicates
  const seen = new Set<string>();
  const deduped = normalized.map((el) => {
    if (!seen.has(el.id)) {
      seen.add(el.id);
      return el;
    }
    const nextId = crypto.randomUUID();
    seen.add(nextId);
    return { ...el, id: nextId };
  });

  // Sort by zIndex to match rendering order, then re-number to keep it clean.
  const sorted = deduped.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return renumberZIndex(sorted.map(ensureImageSrc));
}

/**
 * Attempts to extract simple HTML elements (e.g. <div style="left:0px;top:0px;width:100px;height:100px;background-color:#333;">)
 * from an arbitrary text blob and convert them into basic TemplateElement shapes so the
 * editor can render Puter/Claude HTML snippets directly.
 */
export function parseHtmlElementsFromText(
  text: string,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  if (!text || typeof text !== "string") return [];

  // Unwrap code fences like ```html ... ```
  const unwrapped = text.replace(/```[a-zA-Z-]*\n?([\s\S]*?)```/g, "$1").trim();

  const out: TemplateElement[] = [];

  function parseCssValue(val: string | undefined, axis: "x" | "y" | "w" | "h") {
    if (!val) return undefined;
    const s = val.trim();
    const px = s.match(/^(-?[0-9.]+)px$/i);
    if (px) return Number(px[1]);
    const pct = s.match(/^(-?[0-9.]+)%$/i);
    if (pct) {
      const n = Number(pct[1]) / 100;
      return axis === "w" || axis === "x" ? Math.round(n * canvasWidth) : Math.round(n * canvasHeight);
    }
    const num = Number(s.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(num) ? num : undefined;
  }

  // Simple <div> detection
  const divRe = /<div\b([^>]*)>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = divRe.exec(unwrapped))) {
    const attrs = m[1] || "";
    // style attribute
    const styleMatch = attrs.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const style = (styleMatch && (styleMatch[1] || styleMatch[2])) || "";
    const styleMap: Record<string, string> = {};
    style.split(";").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
      const [k, v] = pair.split(":").map((x) => x && x.trim());
      if (k && v) styleMap[k.toLowerCase()] = v;
    });

    const left = parseCssValue(styleMap["left"], "x") ?? 0;
    const top = parseCssValue(styleMap["top"], "y") ?? 0;
    const width = parseCssValue(styleMap["width"], "w") ?? 100;
    const height = parseCssValue(styleMap["height"], "h") ?? 100;
    const bg = styleMap["background-color"] ?? styleMap["background"] ?? undefined;

    const el: any = {
      id: crypto.randomUUID(),
      type: "shape",
      name: "Box",
      x: left,
      y: top,
      width,
      height,
      zIndex: 0,
    };

    if (bg) el.color = bg;
    if (styleMap["opacity"]) {
      const op = parseFloat(styleMap["opacity"] as string);
      if (!Number.isNaN(op)) el.opacity = op;
    }

    out.push(el as TemplateElement);
  }

  // <img src=...> detection
  const imgRe = /<img\b([^>]*?)\/>/gi;
  while ((m = imgRe.exec(unwrapped))) {
    const attrs = m[1] || "";
    const srcMatch = attrs.match(/src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = srcMatch ? srcMatch[1] || srcMatch[2] || srcMatch[3] : undefined;
    const styleMatch = attrs.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const style = (styleMatch && (styleMatch[1] || styleMatch[2])) || "";
    const styleMap: Record<string, string> = {};
    style.split(";").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
      const [k, v] = pair.split(":").map((x) => x && x.trim());
      if (k && v) styleMap[k.toLowerCase()] = v;
    });

    const left = parseCssValue(styleMap["left"], "x") ?? 0;
    const top = parseCssValue(styleMap["top"], "y") ?? 0;
    const width = parseCssValue(styleMap["width"], "w") ?? 100;
    const height = parseCssValue(styleMap["height"], "h") ?? 100;

    const imgEl: any = {
      id: crypto.randomUUID(),
      type: "image",
      name: "Image",
      x: left,
      y: top,
      width,
      height,
      zIndex: 0,
      src: src || undefined,
    };

    out.push(imgEl as TemplateElement);
  }

  return normalizeAiOutput(out, canvasWidth, canvasHeight);
}

/**
 * Extracts any JSON object/array from a text blob (including ```json code fences),
 * coerces provider-specific element shapes (e.g., type: 'box', snake_case fields) into
 * our internal shape, and returns normalized TemplateElement[]
 */
export function parseJsonElementsFromText(
  text: string,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  if (!text || typeof text !== "string") return [];

  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  const startIdx = start === -1 ? arrStart : start;
  if (startIdx === -1) return [];

  const end = cleaned.lastIndexOf("}");
  const arrEnd = cleaned.lastIndexOf("]");
  const endIdx = Math.max(end, arrEnd);
  if (endIdx === -1 || endIdx < startIdx) return [];

  const jsonText = cleaned.slice(startIdx, endIdx + 1);

  try {
    const parsed = JSON.parse(jsonText);
    let nodes: any[] = [];
    if (Array.isArray(parsed)) nodes = parsed;
    else if ((parsed as any)?.elements && Array.isArray((parsed as any).elements)) nodes = (parsed as any).elements;
    else if ((parsed as any).actions) return []; // actions handled elsewhere
    else nodes = [parsed];

    const coerced = nodes.map((n) => coercePuterElement(n));
    return normalizeAiOutput(coerced, canvasWidth, canvasHeight);
  } catch (err) {
    return [];
  }
}

function coercePuterElement(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;

  const out: any = { ...raw };

  // Normalize snake_case -> camelCase for known keys
  if (out.fill_color && !out.color) out.color = out.fill_color;
  if (out.fill && !out.color) out.color = out.fill;
  if (out.background && !out.color) out.color = out.background;
  if (out.stroke_color && !out.borderColor) out.borderColor = out.stroke_color;
  if (out.stroke && !out.borderColor) out.borderColor = out.stroke;
  if (out.stroke_width && !out.borderWidth) out.borderWidth = out.stroke_width;
  if (out.font_size && !out.fontSize) out.fontSize = out.font_size;
  if (out.font_family && !out.fontFamily) out.fontFamily = out.font_family;

  // Convert 'box' / 'rect' / 'rectangle' to our 'shape' rectangle
  if (out.type === "box" || out.type === "rect" || out.type === "rectangle") {
    out.type = "shape";
    out.shape = out.shape || "rectangle";
    if (!out.color && out.fill) out.color = out.fill;
    if (!out.color && out.fill_color) out.color = out.fill_color;
  }

  // Map legacy keys for text
  if (out.type === "text") {
    out.content = out.content ?? out.text ?? out.caption ?? out.label;
  }

  // Ensure numeric geometry coercion
  ["x", "y", "width", "height", "rotation", "zIndex"].forEach((k) => {
    if (out[k] !== undefined) {
      const n = Number(out[k]);
      if (!Number.isNaN(n)) out[k] = n;
    }
  });

  // Provide defaults for width/height if missing
  if (out.width === undefined) out.width = 100;
  if (out.height === undefined) out.height = 100;

  return out;
}

export type AIGenerationStrategy = "full" | "schema" | "html";

export type AiAction =
  | { op: "create"; element: unknown }
  | { op: "update"; id: string; patch: Record<string, unknown> }
  | { op: "delete"; id: string };

export type AiActionsResponse = {
  actions: AiAction[];
};

function applyPatchToElement(prev: TemplateElement, patch: Record<string, unknown>): TemplateElement {
  const next: any = { ...prev };

  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete next[k];
      continue;
    }

    const prevVal = (next as any)[k];

    // Shallow merge nested objects when both are plain objects.
    if (
      prevVal &&
      typeof prevVal === "object" &&
      !Array.isArray(prevVal) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      (next as any)[k] = { ...prevVal, ...(v as any) };
      continue;
    }

    (next as any)[k] = v as any;
  }

  return next as TemplateElement;
}

/**
 * Applies an AI "actions" response (create/update/delete) onto the current element list.
 * This is used for the "schema" strategy where we avoid sending the full element JSON back to the model.
 */
export function applyAiActions(
  currentElements: TemplateElement[],
  actions: AiAction[],
  canvasWidth: number,
  canvasHeight: number,
  userPrompt?: string,
): TemplateElement[] {
  const allowReplaceImage = !!userPrompt && /(replace|change|swap|update)\s+(the\s+)?(image|photo|picture)|new\s+(image|photo|picture)\s+for\s+(this|that)|regenerate\s+(the\s+)?(image|photo|picture)/.test(userPrompt.toLowerCase());

  const deletedIds = new Set<string>();
  const byId = new Map<string, TemplateElement>(currentElements.map((e) => [e.id, e]));

  let next: TemplateElement[] = [...currentElements];

  for (const action of actions ?? []) {
    if (!action || typeof action !== "object") continue;

    if ((action as any).op === "delete") {
      const id = String((action as any).id ?? "");
      if (!id) continue;
      deletedIds.add(id);
      byId.delete(id);
      next = next.filter((e) => e.id !== id);
      continue;
    }

    if ((action as any).op === "update") {
      const id = String((action as any).id ?? "");
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev) continue;

      const patch = ((action as any).patch ?? {}) as Record<string, unknown>;
      const candidate = applyPatchToElement(prev, patch);

      // Image src is treated as immutable unless the user explicitly asks to replace/change it.
      if (prev.type === "image" && candidate.type === "image" && !allowReplaceImage) {
        const prevSrc = (prev as any).src;
        if (typeof prevSrc === "string" && prevSrc.trim() !== "") {
          (candidate as any).src = prevSrc;
        }
      }

      byId.set(id, candidate);
      next = next.map((e) => (e.id === id ? candidate : e));
      continue;
    }

    if ((action as any).op === "create") {
      const element = (action as any).element;
      if (!element || typeof element !== "object") continue;

      const id = typeof (element as any).id === "string" && (element as any).id.trim() !== ""
        ? String((element as any).id)
        : crypto.randomUUID();

      const candidate = { ...(element as any), id } as TemplateElement;
      byId.set(id, candidate);
      next.push(candidate);
      continue;
    }
  }

  // Normalize/clamp; if normalization drops an existing (non-deleted) element due to a bad patch,
  // keep the previous version to avoid data loss.
  const normalized = normalizeAiOutput(next, canvasWidth, canvasHeight);
  const normalizedIds = new Set(normalized.map((e) => e.id));

  const preservedInvalid = currentElements.filter((e) => !deletedIds.has(e.id) && !normalizedIds.has(e.id));

  return normalizeAiOutput([...normalized, ...preservedInvalid], canvasWidth, canvasHeight);
}

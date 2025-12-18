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
  shape: z.enum(["rectangle", "circle", "line", "star"]),
  color: z.string().default("#3b82f6"),
  opacity: zOptionalNumber,
  borderRadius: zOptionalNumber,
  borderWidth: zOptionalNumber,
  borderColor: z.string().optional(),
  gradient: zGradientProps.optional(),
});

const zLogo = zTemplateBase.extend({
  type: z.enum(["logo", "image"]),
  src: z.string(),
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

const zTemplateElement = z.discriminatedUnion("type", [zText, zShape, zLogo, zSvg]);

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
    const maybeCoerced = coerceSvgContent(item);
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
  return renumberZIndex(deduped.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)));
}

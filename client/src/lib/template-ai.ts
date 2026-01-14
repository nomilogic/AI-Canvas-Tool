import { z } from "zod";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import valueParser from "postcss-value-parser";
import { parse as parseSvg } from "svgson";
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
    const _rawOut: any[] = [];
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
    type: z.enum(["linear", "radial"]),
    stops: z
      .array(z.object({ offset: zNumber, color: z.string() }))
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
  // Our runtime shape elements use `type: 'shape'` and a `shape` property
  type: z.literal("shape"),
  shape: z
    .enum([
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
    ])
    .optional(),
  color: z.string().optional(),
  borderRadius: zOptionalNumber,
  gradient: zGradientProps.optional(),
  opacity: zOptionalNumber,
})
.passthrough();

const zLogo = zTemplateBase.extend({
  type: z.literal("logo"),
  src: z.string().default("")
}).passthrough();

const zSvg = zTemplateBase.extend({
  type: z.literal("svg"),
  content: z.string(),
  viewBox: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: zOptionalNumber,
}).passthrough();

const zTemplateElement = z.discriminatedUnion("type", [zText, zShape, zLogo, zSvg]);

// Lightweight legacy element type (older outputs may use a different schema)
export type LegacyCanvasElement = any;

function ensureId(id: string | undefined) {
  return typeof id === "string" && id.trim().length > 0 ? id : crypto.randomUUID();
}

function ensureZIndex(zIndex: number | undefined, idx: number) {
  return typeof zIndex === "number" ? zIndex : idx;
}

function parseSize(value: number | string | undefined, fallback: number, total: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const s = value.trim();
    const pct = s.match(/^([0-9.]+)%$/);
    if (pct) return Math.round((Number(pct[1]) / 100) * total);
    const px = Number(s.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(px) && px > 0) return px;
  }
  return fallback;
}

function estimateTextBox(text: string, fontSize: number) {
  const avgCharWidth = fontSize * 0.6;
  const width = Math.min(2000, Math.max(10, Math.round(text.length * avgCharWidth)));
  const height = Math.max(10, Math.round(fontSize * 1.2));
  return { width, height };
}

function normalizeGeometry(el: TemplateElement, canvasWidth: number, canvasHeight: number): TemplateElement {
  const x = Math.max(0, Math.min(el.x ?? 0, canvasWidth));
  const y = Math.max(0, Math.min(el.y ?? 0, canvasHeight));
  const width = Math.max(1, Math.min(el.width ?? 1, canvasWidth));
  const height = Math.max(1, Math.min(el.height ?? 1, canvasHeight));
  return { ...el, x, y, width, height } as TemplateElement;
}

function coerceAiItem(item: any): any {
  // Minimal coercion: convert snake_case keys to camelCase for puter outputs
  if (!item || typeof item !== "object") return item;
  const res: any = {};
  Object.keys(item).forEach((k) => {
    const v = (item as any)[k];
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    res[camel] = v;
  });
  return res;
}

  function legacyToTemplate(
    legacy: any,
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
    children.forEach((child: any, idx: number) => {
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

/**
 * Parse a CSS linear-gradient(...) string into a lightweight GradientProps-like object.
 */
function parseCssLinearGradient(str: string | undefined) {
  if (!str) return undefined;
  const s = str.trim();
  const lgMatch = s.match(/linear-gradient\((.*)\)/i);
  if (!lgMatch) return undefined;

  const inner = lgMatch[1].trim();

  // Try to extract an angle or direction at the start
  let rotation: number | undefined;
  const angleMatch = inner.match(/^([0-9.]+)deg\s*,/i);
  if (angleMatch) rotation = Number(angleMatch[1]);
  else if (/to\s+right/i.test(inner)) rotation = 90;
  else if (/to\s+left/i.test(inner)) rotation = 270;
  else if (/to\s+bottom/i.test(inner)) rotation = 180;
  else if (/to\s+top/i.test(inner)) rotation = 0;

  // Extract color stops while being tolerant of commas inside rgba(...) by
  // matching colors with optional percentage.
  const stopRe = /(?:rgba?\([^\)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*[0-9.]*%?/g;
  const stopsRaw = Array.from(inner.matchAll(stopRe)).map((mm) => mm[0].trim());
  const stops: { offset: number; color: string }[] = [];
  if (stopsRaw.length) {
    // If stops include explicit percentage, parse them; otherwise spread evenly.
    const explicit = stopsRaw.map((s) => {
      const pct = s.match(/\s([0-9.]+)%$/);
      const color = s.replace(/\s+[0-9.]+%$/, "").trim();
      return { color, pct: pct ? Number(pct[1]) / 100 : undefined };
    });

    if (explicit.some((e) => e.pct !== undefined)) {
      explicit.forEach((e) => stops.push({ offset: e.pct ?? 0, color: e.color }));
    } else {
      const step = 1 / Math.max(1, stopsRaw.length - 1);
      explicit.forEach((e, i) => stops.push({ offset: i * step, color: e.color }));
    }
  }

  const gradient: any = {
    enabled: true,
    type: "linear",
    stops,
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
    rotation,
  };
  return gradient;
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
  const _rawOut: any[] = [];

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
  let unwrapped = text.replace(/```[a-zA-Z-]*\n?([\s\S]*?)```/g, "$1").trim();

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

  // parseCssLinearGradient is defined at module level and reused by JSON coercion

  // Try AST-based parsing using rehype + svgson + postcss-value-parser
  try {
    // Be tolerant of different module shapes (CJS default vs ESM default export).
    const rehypePlugin: any = (rehypeParse as any)?.default ?? rehypeParse;
    const tree: any = unified().use(rehypePlugin, { fragment: true }).parse(unwrapped);

    const styleToMap = (style: string | undefined) => {
      const map: Record<string, string> = {};
      if (!style) return map;
      // If rehype gives us a style object (props.style may be an object), accept it.
      if (typeof (style as any) === 'object') {
        try {
          Object.keys(style as any).forEach((k) => {
            const v = (style as any)[k];
            if (k && v !== undefined && v !== null) map[k.toLowerCase()] = String(v);
          });
          return map;
        } catch (e) {
          // fall through to string-based parsing
        }
      }
      (style as string).split(';').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
        const [k, v] = pair.split(':').map((x: any) => x && x.trim());
        if (k && v) map[k.toLowerCase()] = v;
      });
      return map;
    };

    const cssValueToPx2 = (val: string | undefined, axis: 'x' | 'y' | 'w' | 'h') => {
      if (!val) return undefined;
      const parsed = valueParser.unit(val);
      if (parsed && parsed.number !== undefined) {
        if (parsed.unit === '%') {
          const n = parsed.number / 100;
          return axis === 'w' || axis === 'x' ? Math.round(n * canvasWidth) : Math.round(n * canvasHeight);
        }
        return parsed.number;
      }
      const n = Number(val.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    };

    const collectText = (node: any) => {
      if (!node) return '';
      let acc = '';
      if (node.type === 'text' && typeof node.value === 'string') acc += node.value;
      if (Array.isArray(node.children)) node.children.forEach((c: any) => acc += collectText(c));
      return acc;
    };

    const walkNode = (node: any) => {
      if (!node) return;
      if (Array.isArray(node.children)) node.children.forEach(walkNode);
      if (node.type !== 'element') return;
      const tag = (node.tagName || '').toLowerCase();
      const props = node.properties || {};
      const styleRaw = typeof props.style === 'string' ? props.style : props.style?.toString?.();
      const styleMap = styleToMap(styleRaw);

      if (tag === 'div') {
        const left = cssValueToPx2(styleMap['left'], 'x') ?? 0;
        const top = cssValueToPx2(styleMap['top'], 'y') ?? 0;
        const width = cssValueToPx2(styleMap['width'], 'w') ?? 100;
        const height = cssValueToPx2(styleMap['height'], 'h') ?? 100;
        const bg = styleMap['background-color'] ?? styleMap['background'] ?? undefined;

        const textContent = collectText(node).replace(/<[^>]+>/g, '').trim();
        const hasElementChildren = Array.isArray(node.children) && node.children.some((c: any) => c.type === 'element');
        // Only treat as a text element if the div is a leaf (no element children).
        if (textContent.length > 0 && !hasElementChildren) {
          const fontSize = cssValueToPx2(styleMap['font-size'], 'h') ?? 32;
          const fontFamily = (styleMap['font-family'] ?? 'Inter').split(',')[0].trim();
          const fontWeight = styleMap['font-weight'] ?? 'bold';
          const color = styleMap['color'] ?? '#111827';
          const textAlign = (styleMap['text-align'] as any) || 'center';

          const txt: any = {
            id: crypto.randomUUID(),
            type: 'text',
            name: 'Text',
            x: left,
            y: top,
            width,
            height,
            zIndex: 0,
            content: textContent,
            fontSize,
            fontFamily,
            fontWeight,
            color,
            textAlign,
            style: styleRaw,
          };
          out.push(txt as TemplateElement);
          _rawOut.push(txt);
          return;
        }

        const el: any = {
          id: crypto.randomUUID(),
          type: 'shape',
          name: 'Box',
          x: left,
          y: top,
          width,
          height,
          zIndex: 0,
          shape: 'rectangle',
          style: styleRaw,
        };

        if (bg) {
          const grad = parseCssLinearGradient(bg);
          if (grad) el.gradient = grad;
          else el.color = bg;
        }

        if (styleMap['border-radius']) {
          const br = cssValueToPx2(styleMap['border-radius'], 'h');
          if (br !== undefined) el.borderRadius = br;
          if (br !== undefined && Math.min(el.width, el.height) > 0 && br >= Math.min(el.width, el.height) / 2) el.shape = 'circle';
        }

        if (styleMap['transform']) {
          const rot = (styleMap['transform'] as string).match(/rotate\(\s*([-0-9.]+)deg\s*\)/i);
          if (rot) el.rotation = Number(rot[1]);
        }

        out.push(el as TemplateElement);
        _rawOut.push(el);
      }

      if (tag === 'img') {
        const styleMap = styleToMap(props.style as string);
        const left = cssValueToPx2(styleMap['left'], 'x') ?? 0;
        const top = cssValueToPx2(styleMap['top'], 'y') ?? 0;
        const width = cssValueToPx2(styleMap['width'], 'w') ?? 100;
        const height = cssValueToPx2(styleMap['height'], 'h') ?? 100;
        const imgEl: any = {
          id: crypto.randomUUID(),
          type: 'image',
          name: 'Image',
          x: left,
          y: top,
          width,
          height,
          zIndex: 0,
          src: props.src,
        };
        out.push(imgEl as TemplateElement);
        _rawOut.push(imgEl);
      }

      if (tag === 'svg') {
        const styleMap = styleToMap(props.style as any);
        const left = cssValueToPx2(styleMap['left'], 'x') ?? 0;
        const top = cssValueToPx2(styleMap['top'], 'y') ?? 0;
        const width = cssValueToPx2(styleMap['width'], 'w') ?? 100;
        const height = cssValueToPx2(styleMap['height'], 'h') ?? 100;

        // Try to find first path/g child and read attributes directly from AST node
        const children = node.children || [];
        const pathNode = children.find((c: any) => c.type === 'element' && (c.tagName === 'path' || c.tagName === 'g' || c.tagName === 'circle' || c.tagName === 'rect')) as any;

        let d = '';
        let stroke: string | undefined = undefined;
        let strokeWidth: number | undefined = undefined;
        let fill: string | undefined = undefined;

        if (pathNode) {
          d = pathNode.properties?.d ?? '';
          stroke = pathNode.properties?.stroke ?? pathNode.properties?.['stroke'];
          const sw = pathNode.properties?.['stroke-width'] ?? pathNode.properties?.['strokeWidth'];
          if (sw !== undefined) strokeWidth = Number(sw);
          fill = pathNode.properties?.fill ?? undefined;
        } else {
          // Fallback: attempt to stringify inner children and use svgson
          const svgHtml = (node.children || []).map((c: any) => c.value ?? '').join('');
          try {
            const parsedSvg = parseSvg('<svg ' + Object.keys(props).filter((k: any) => k !== 'style').map((k: any) => `${k}="${props[k]}"`).join(' ') + '>' + svgHtml + '</svg>');
            const found = (parsedSvg.children || []).find((c: any) => c.name === 'path' || c.name === 'g');
            d = found?.attributes?.d ?? '';
            stroke = found?.attributes?.stroke ?? undefined;
            strokeWidth = found?.attributes?.['stroke-width'] ? Number(found.attributes['stroke-width']) : undefined;
            fill = found?.attributes?.fill;
          } catch (e) {
            // ignore
          }
        }

        const svgEl: any = {
          id: crypto.randomUUID(),
          type: 'svg',
          name: 'SVG',
          x: left,
          y: top,
          width,
          height,
          zIndex: 0,
          content: d,
          fill,
          stroke,
          strokeWidth,
          viewBox: props.viewBox ?? parsed?.attributes?.viewBox,
        };
        out.push(svgEl as TemplateElement);
        _rawOut.push(svgEl);
      }
    };

    walkNode(tree);
    if (out.length > 0) return normalizeAiOutput(out, canvasWidth, canvasHeight);
  } catch (err) {
    // Fail quietly in normal operation; keep debug-level info for developers.
    // eslint-disable-next-line no-console
    console.debug && console.debug('parseHtmlElementsFromText AST parse failed, falling back to heuristic parser:', err?.message ?? err);
  }
  // Simple <div> detection
  // First, extract leaf <div> elements that directly contain text (no child tags)
  const leafDivRe = /<div\b([^>]*)>\s*([^<]+?)\s*<\/div>/gi;
  let m: RegExpExecArray | null;
  const leafMatches: RegExpExecArray[] = [];
  while ((m = leafDivRe.exec(unwrapped))) {
    leafMatches.push(m);
  }
  // Remove leaf matches from the working HTML so the generic div matcher doesn't capture them inside parents
  for (const lm of leafMatches) {
    const attrs = lm[1] || "";
    const textContent = (lm[2] || "").replace(/\s+/g, ' ').trim();
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
    const fontSize = parseCssValue(styleMap['font-size'], 'h') ?? 32;
    const fontFamily = (styleMap['font-family'] || 'Inter').split(',')[0].trim();
    const fontWeight = styleMap['font-weight'] || 'bold';
    const color = styleMap['color'] || '#111827';

    const txt: any = {
      id: crypto.randomUUID(),
      type: 'text',
      name: 'Text',
      x: left,
      y: top,
      width,
      height,
      zIndex: 0,
      content: textContent,
      fontSize,
      fontFamily,
      fontWeight,
      color,
      textAlign: (styleMap['text-align'] as any) || 'center',
      style,
    };
    out.push(txt as TemplateElement);
    _rawOut.push(txt);
    // remove this substring to avoid double-capture
    unwrapped = unwrapped.replace(lm[0], '');
  }

  const divRe = /<div\b([^>]*)>([\s\S]*?)<\/div>/gi;
  m = null;
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
      shape: "rectangle",
    };
    // If this div contains plain text, prefer a `text` element so font properties
    // are preserved for the editor. Otherwise treat as a simple shape.
    const innerHtml = (m[2] || '').replace(/\s+/g, ' ').trim();
    const innerText = innerHtml.replace(/<[^>]+>/g, '').trim();
    const hasChildTags = /<[^>]+>/.test(m[2] || '');
    // Only emit a text element when the div is a leaf containing only text (no child tags).
    if (innerText.length > 0 && !hasChildTags) {
      const fontSize = parseCssValue(styleMap['font-size'], 'h') ?? 32;
      const fontFamily = (styleMap['font-family'] || 'Inter').split(',')[0].trim();
      const fontWeight = styleMap['font-weight'] || 'bold';
      const color = styleMap['color'] || '#111827';

      const txt: any = {
        id: crypto.randomUUID(),
        type: 'text',
        name: 'Text',
        x: left,
        y: top,
        width,
        height,
        zIndex: 0,
        content: innerText,
        fontSize,
        fontFamily,
        fontWeight,
        color,
        textAlign: (styleMap['text-align'] as any) || 'center',
        style: style,
      };
      out.push(txt as TemplateElement);
      _rawOut.push(txt);
      continue;
    }
    if (bg) {
      // background may be a simple color or a linear-gradient()
      const lg = parseCssLinearGradient(bg);
      if (lg) {
        el.gradient = lg;
      } else {
        el.color = bg;
      }
    }
    if (style) {
      el.style = style;
    }
    if (styleMap["opacity"]) {
      const op = parseFloat(styleMap["opacity"] as string);
      if (!Number.isNaN(op)) el.opacity = op;
    }
    if (styleMap['border-radius']) {
      const br = parseCssValue(styleMap['border-radius'], 'h');
      if (br !== undefined) el.borderRadius = br;
      if (br !== undefined && Math.min(el.width, el.height) > 0 && br >= Math.min(el.width, el.height) / 2) el.shape = 'circle';
    }
    if (styleMap["transform"]) {
      const t = styleMap["transform"] as string;
      const rot = t.match(/rotate\s*\(\s*([-0-9.]+)deg\s*\)/i);
      if (rot) el.rotation = Number(rot[1]);
      // keep raw transform in style so non-supported transforms can round-trip
      el.style = (el.style ? el.style + ";" : "") + `transform: ${t}`;
    }

    out.push(el as TemplateElement);
    _rawOut.push(el);
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
    _rawOut.push(imgEl);
  }

  // <svg> detection - preserve content and viewBox where possible
  const svgRe = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi;
  while ((m = svgRe.exec(unwrapped))) {
    const attrs = m[1] || "";
    const inner = m[2] || "";
    const styleMatch = attrs.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const style = (styleMatch && (styleMatch[1] || styleMatch[2])) || "";
    const styleMap: Record<string, string> = {};
    style.split(";").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
      const [k, v] = pair.split(":").map((x) => x && x.trim());
      if (k && v) styleMap[k.toLowerCase()] = v;
    });

    // try to get bounding geometry from style attributes or width/height attrs
    const left = parseCssValue(styleMap["left"], "x") ?? 0;
    const top = parseCssValue(styleMap["top"], "y") ?? 0;
    const width = parseCssValue(styleMap["width"], "w") ?? 100;
    const height = parseCssValue(styleMap["height"], "h") ?? 100;

    const viewBoxMatch = attrs.match(/viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const viewBox = viewBoxMatch ? (viewBoxMatch[1] || viewBoxMatch[2]) : undefined;

    const svgEl: any = {
      id: crypto.randomUUID(),
      type: "svg",
      name: "SVG",
      x: left,
      y: top,
      width,
      height,
      zIndex: 0,
      content: inner.trim(),
    };
    if (viewBox) svgEl.viewBox = viewBox;
    if (style) svgEl.style = style;
    // try to pull a top-level fill/stroke from inner paths
    const fillMatch = inner.match(/fill\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (fillMatch) svgEl.fill = fillMatch[1] || fillMatch[2];
    const strokeMatch = inner.match(/stroke\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (strokeMatch) svgEl.stroke = strokeMatch[1] || strokeMatch[2];
    const strokeWidthMatch = inner.match(/stroke-width\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (strokeWidthMatch) svgEl.strokeWidth = Number(strokeWidthMatch[1] || strokeWidthMatch[2]);

    out.push(svgEl as TemplateElement);
    _rawOut.push(svgEl);
  }

  // Raw output is intentionally not logged in production; use debug tools when needed.

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
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const lastObjEnd = cleaned.lastIndexOf("}");
  const lastArrEnd = cleaned.lastIndexOf("]");

  // Choose a matching pair: prefer an array if its opening '[' appears before '{', otherwise prefer an object
  let startIdx = -1;
  let endIdx = -1;
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    startIdx = firstArr;
    endIdx = lastArrEnd;
  } else if (firstObj !== -1) {
    startIdx = firstObj;
    endIdx = lastObjEnd;
  }

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return [];

  const jsonText = cleaned.slice(startIdx, endIdx + 1);

  try {
    const parsed = JSON.parse(jsonText);
    let nodes: any[] = [];
    if (Array.isArray(parsed)) nodes = parsed;
    else if ((parsed as any)?.elements && Array.isArray((parsed as any).elements)) nodes = (parsed as any).elements;
    else if ((parsed as any).actions) return []; // actions handled elsewhere
    else nodes = [parsed];

    const coerced = nodes.map((n) => coercePuterElement(n));

    // Map Puter-style geometry keys to our expected schema and coerce percentage widths/heights
    const adjusted = coerced.map((it: any) => {
      const copy = { ...it };
      if (copy.left !== undefined && copy.x === undefined) copy.x = parseSize(copy.left, 0, canvasWidth);
      if (copy.top !== undefined && copy.y === undefined) copy.y = parseSize(copy.top, 0, canvasHeight);
      if (copy.width !== undefined) copy.width = parseSize(copy.width, 100, canvasWidth);
      if (copy.height !== undefined) copy.height = parseSize(copy.height, 100, canvasHeight);
      return copy;
    });

    return normalizeAiOutput(adjusted, canvasWidth, canvasHeight);
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

  // If provider used CSS-like backgrounds (e.g., linear-gradient(...)), coerce into gradient
  if (typeof out.background === "string" && out.background.includes("linear-gradient")) {
    const g = parseCssLinearGradient(out.background);
    if (g) out.gradient = g;
  }
  if (typeof out.fill === "string" && out.fill.includes("linear-gradient")) {
    const g = parseCssLinearGradient(out.fill);
    if (g) out.gradient = g;
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

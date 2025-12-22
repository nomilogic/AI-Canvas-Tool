import { z } from "zod";
import type {
  TemplateElement,
  TextElement,
  ShapeElement,
  LogoElement,
  SvgElement,
  IconElement,
  ShadowProps,
  GradientProps,
} from "../types/templates";

const zNumber = z.coerce.number();
const zOptionalNumber = z.coerce.number().optional();

const zShadowProps: z.ZodType<ShadowProps> = z
  .object({
    enabled: z.coerce.boolean(),
    color: z.string(),
    blur: zNumber,
    opacity: zNumber,
    offsetX: zNumber,
    offsetY: zNumber,
  })
  .partial()
  .passthrough();

const zGradientProps: z.ZodType<GradientProps> = z
  .object({
    enabled: z.coerce.boolean(),
    type: z.enum(["linear", "radial"]),
    stops: z.array(z.object({ offset: zNumber, color: z.string() })).min(2).max(6),
    start: z.object({ x: zNumber, y: zNumber }),
    end: z.object({ x: zNumber, y: zNumber }),
    rotation: zOptionalNumber,
  })
  .partial()
  .passthrough();

const zLayoutBase = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.enum(["group", "text", "shape", "image", "svg", "icon"]),
    x: zNumber,
    y: zNumber,
    width: zNumber,
    height: zNumber,
    rotation: zOptionalNumber,
    zIndex: zNumber.optional(),
    opacity: zOptionalNumber,
    shadow: zShadowProps.optional(),
    gradient: zGradientProps.optional(),
  })
  .passthrough();

// Recursive layout node with optional children (for groups)
// children are positioned ABSOLUTELY within the parent box.
// Top-level nodes are ABSOLUTE within the canvas.
// We intentionally allow extra keys and coerce numbers to keep the schema tolerant.

// Forward declaration using lazy to support recursion
// eslint-disable-next-line @typescript-eslint/no-use-before-define
const zLayoutNode: z.ZodType<any> = z.lazy(() =>
  zLayoutBase.extend({
    children: z.array(zLayoutNode).optional(),
  }),
);

const zLayoutRoot = z.array(zLayoutNode);

type LayoutNode = z.infer<typeof zLayoutNode>;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function ensureId(id: string | undefined): string {
  return id && id.trim().length > 0 ? id : crypto.randomUUID();
}

/**
 * Flattens a nested layout tree into TemplateElement[] + GroupElement children relations.
 * - Applies parent offsets so every element ends up with absolute canvas coordinates.
 * - Clamps x,y,width,height into canvas bounds.
 */
function flattenLayoutTree(
  nodes: LayoutNode[],
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  const out: TemplateElement[] = [];
  const groupChildren = new Map<string, string[]>();
  let zCounter = 0;

  const walk = (
    nodeList: LayoutNode[],
    parentOffset: { x: number; y: number },
    parentGroupId?: string,
  ) => {
    for (const node of nodeList) {
      if (!node || typeof node !== "object") continue;

      const id = ensureId(node.id);
      const rawX = parentOffset.x + Number(node.x ?? 0);
      const rawY = parentOffset.y + Number(node.y ?? 0);
      const rawW = Number(node.width ?? 0);
      const rawH = Number(node.height ?? 0);

      // Clamp to canvas bounds (basic, but safe)
      const width = clamp(rawW || 1, 1, canvasWidth);
      const height = clamp(rawH || 1, 1, canvasHeight);
      const x = clamp(rawX, 0, Math.max(0, canvasWidth - width));
      const y = clamp(rawY, 0, Math.max(0, canvasHeight - height));

      const base: Partial<TemplateElement> = {
        id,
        name: (node as any).name,
        x,
        y,
        width,
        height,
        rotation: (node as any).rotation ?? 0,
        zIndex: zCounter++,
        opacity: (node as any).opacity,
        shadow: (node as any).shadow,
        // filters & other extras can be patched in by AI via actions; we keep minimal here.
      };

      const t = (node as any).type as LayoutNode["type"];

      if (t === "group") {
        const group: any = {
          ...base,
          type: "group",
          children: [], // we'll fill from groupChildren map later
        };
        out.push(group as TemplateElement);

        // Recurse into children with this group's absolute offset
        const childOffset = { x, y };
        walk((node as any).children ?? [], childOffset, id);
        continue;
      }

      let element: TemplateElement | null = null;

      if (t === "text") {
        const content = (node as any).content ?? (node as any).text ?? "Text";
        const textEl: TextElement = {
          ...(base as any),
          type: "text",
          content,
          fontSize: (node as any).fontSize ?? 32,
          fontFamily: (node as any).fontFamily ?? "Inter",
          color: (node as any).color ?? "#111827",
          fontWeight: (node as any).fontWeight ?? "bold",
          textAlign: (node as any).textAlign ?? "center",
          gradient: (node as any).gradient,
        };
        element = textEl;
      } else if (t === "shape") {
        const shapeEl: ShapeElement = {
          ...(base as any),
          type: "shape",
          shape: (node as any).shape ?? "rectangle",
          color: (node as any).color ?? "#3b82f6",
          opacity: (node as any).opacity,
          borderRadius: (node as any).borderRadius,
          borderWidth: (node as any).borderWidth,
          borderColor: (node as any).borderColor,
          gradient: (node as any).gradient,
        };
        element = shapeEl;
      } else if (t === "image") {
        const name = (node as any).name ?? "Image";
        let src = (node as any).src as string | undefined;
        if (!src || !src.trim()) {
          const w = Math.max(1, Math.round(width));
          const h = Math.max(1, Math.round(height));
          const label = encodeURIComponent(name);
          src = `https://via.placeholder.com/${w}x${h}?text=${label || "Image"}`;
        }
        const imgEl: LogoElement = {
          ...(base as any),
          type: "image",
          src,
          opacity: (node as any).opacity,
          borderRadius: (node as any).borderRadius,
          borderWidth: (node as any).borderWidth,
          borderColor: (node as any).borderColor,
        };
        element = imgEl as TemplateElement;
      } else if (t === "svg") {
        const svgEl: SvgElement = {
          ...(base as any),
          type: "svg",
          content: (node as any).content ?? (node as any).d ?? "",
          fill: (node as any).fill,
          stroke: (node as any).stroke,
          strokeWidth: (node as any).strokeWidth,
          opacity: (node as any).opacity,
        };
        element = svgEl;
      } else if (t === "icon") {
        const iconName = (node as any).iconName ?? (node as any).name ?? "Star";
        const iconEl: IconElement = {
          ...(base as any),
          type: "icon",
          iconName,
          color: (node as any).color ?? "#111827",
        };
        element = iconEl;
      } else {
        // Unknown type: skip rather than breaking the entire layout.
        continue;
      }

      if (!element) continue;

      out.push(element);

      if (parentGroupId) {
        const arr = groupChildren.get(parentGroupId) ?? [];
        arr.push(element.id);
        groupChildren.set(parentGroupId, arr);
      }

      // If node has its own children but isn't type "group", we ignore children to keep semantics simple.
    }
  };

  walk(nodes, { x: 0, y: 0 });

  // Attach children arrays to group elements.
  return out.map((el) => {
    if ((el as any).type === "group") {
      const children = groupChildren.get(el.id) ?? [];
      return { ...(el as any), children } as TemplateElement;
    }
    return el;
  });
}

/**
 * Attempts to interpret raw AI JSON as a nested LayoutNode[] tree and normalize it
 * into a flat TemplateElement[] compatible with the editor.
 *
 * If parsing fails or no valid nodes are found, returns an empty array and callers
 * should fall back to other normalization paths (e.g. normalizeAiOutput / legacy).
 */
export function normalizeLayoutTree(
  raw: unknown,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  try {
    const maybeArray = (raw as any)?.elements ?? raw;
    const arr = Array.isArray(maybeArray) ? maybeArray : [maybeArray];
    const parsed = zLayoutRoot.safeParse(arr);
    if (!parsed.success) {
      return [];
    }
    const nodes = parsed.data as LayoutNode[];
    if (!nodes.length) return [];
    return flattenLayoutTree(nodes, canvasWidth, canvasHeight);
  } catch {
    return [];
  }
}

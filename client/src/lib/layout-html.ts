import type { TemplateElement, TextElement, ShapeElement, LogoElement, SvgElement } from "../types/templates";

export type SimpleDomTransform = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

/**
 * Serialize the current TemplateElement list into a simple absolute-positioned HTML snippet.
 * This is used as a bridge while we migrate to HTML as the primary layout format.
 */
export function elementsToHtml(
  elements: TemplateElement[],
  canvasSize: { width: number; height: number },
): string {
  const { width, height } = canvasSize;

  const sorted = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const children = sorted
    .map((el) => {
      const style: string[] = [];
      style.push("position:absolute");
      style.push(`left:${Math.round(el.x)}px`);
      style.push(`top:${Math.round(el.y)}px`);
      style.push(`width:${Math.round(el.width)}px`);
      style.push(`height:${Math.round(el.height)}px`);
      if ((el as any).rotation) {
        style.push(`transform:rotate(${Math.round((el as any).rotation)}deg)`);
      }
      if (el.opacity !== undefined) {
        style.push(`opacity:${el.opacity}`);
      }

      const commonAttrs = `data-el-id="${el.id}" style="${style.join(";")}"`;

      if (el.type === "shape") {
        const s = el as ShapeElement;
        const shapeStyle: string[] = [];
        if (s.color) shapeStyle.push(`background:${s.color}`);
        if (typeof (s as any).borderRadius === "number") {
          shapeStyle.push(`border-radius:${Math.round((s as any).borderRadius)}px`);
        }
        // Merge shape-specific style into the main style string.
        const merged = style.concat(shapeStyle);
        return `<div data-el-id="${el.id}" style="${merged.join(";")}"></div>`;
      }

      if (el.type === "text") {
        const t = el as TextElement;
        const textStyle: string[] = [...style];
        textStyle.push(`color:${t.color}`);
        textStyle.push(`font-size:${Math.round(t.fontSize)}px`);
        // Use single quotes inside the style value to avoid breaking the surrounding
        // double-quoted style attribute.
        const fontFamily = (t.fontFamily || "Inter").replace(/'/g, "\\'");
        textStyle.push(`font-family:'${fontFamily}'`);
        const fontWeight = t.fontWeight || "bold";
        textStyle.push(`font-weight:${fontWeight}`);
        textStyle.push(`text-align:${t.textAlign}`);
        textStyle.push("display:flex");
        textStyle.push("align-items:center");
        textStyle.push("justify-content:center");
        return `<div data-el-id="${el.id}" style="${textStyle.join(";")}">${escapeHtml(
          t.content || "",
        )}</div>`;
      }

      if (el.type === "image") {
        const img = el as LogoElement;
        const imgStyle: string[] = [...style];
        imgStyle.push("object-fit:cover");
        if (typeof (img as any).borderRadius === "number") {
          imgStyle.push(`border-radius:${Math.round((img as any).borderRadius)}px`);
        }
        const src = (img as any).src || "";
        return `<img data-el-id="${el.id}" alt="${escapeHtml(img.name || "Image")}" src="${escapeHtml(
          src,
        )}" style="${imgStyle.join(";")}" />`;
      }

      if (el.type === "svg") {
        const svg = el as SvgElement;
        const svgStyle: string[] = [...style];
        const fill = svg.fill ?? "#111827";
        const stroke = svg.stroke;
        const strokeWidth = svg.strokeWidth;
        const strokeAttrs = stroke
          ? ` stroke="${stroke}"${
              strokeWidth !== undefined ? ` stroke-width="${strokeWidth}"` : ""
            }`
          : "";
        const d = svg.content || "";
        return `<svg data-el-id="${el.id}" viewBox="0 0 100 100" style="${svgStyle.join(";")}">
  <path d="${d}" fill="${fill}"${strokeAttrs}></path>
</svg>`;
      }

      // Fallback: non-supported types become empty divs with their box preserved.
      return `<div ${commonAttrs}></div>`;
    })
    .join("\n");

  const rootStyle = [
    "position:relative",
    `width:${Math.round(width)}px`,
    `height:${Math.round(height)}px`,
    "background:#ffffff",
  ].join(";");

  return `<div style="${rootStyle}">
${children}
</div>`;
}

function stripScripts(html: string): string {
  // Remove any <script>...</script> blocks for safety before injecting into a DOM container.
  return typeof html === "string" ? html.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
}

/**
 * Update an existing HTML layout string in place for a set of transform changes.
 *
 * Only positional geometry is changed (left/top/width/height/rotate). All other
 * structure and styling is preserved so that complex authored HTML does not get
 * "normalized" or rebuilt from TemplateElements.
 */
export function updateHtmlForTransforms(
  html: string,
  transforms: SimpleDomTransform[],
): string {
  if (!html || typeof document === "undefined" || !Array.isArray(transforms) || transforms.length === 0) {
    return html;
  }

  const container = document.createElement("div");
  container.innerHTML = stripScripts(html);

  for (const t of transforms) {
    const el = container.querySelector<HTMLElement>(`[data-el-id="${t.id}"]`);
    if (!el) continue;

    const style = el.style;
    // Ensure absolutely positioned for consistency with the editor model.
    if (!style.position) {
      style.position = "absolute";
    }

    style.left = `${Math.round(t.x)}px`;
    style.top = `${Math.round(t.y)}px`;
    style.width = `${Math.round(t.width)}px`;
    style.height = `${Math.round(t.height)}px`;

    const rotation = Math.round(t.rotation || 0);
    const current = style.transform || "";

    // Strip any existing rotate(...) from the transform while preserving others.
    const withoutRotate = current.replace(/rotate\([^)]*\)/, "").trim();
    if (rotation === 0) {
      style.transform = withoutRotate;
    } else {
      const rotateStr = `rotate(${rotation}deg)`;
      style.transform = withoutRotate ? `${withoutRotate} ${rotateStr}` : rotateStr;
    }
  }

  return container.innerHTML;
}

/**
 * Replace the entire inline style attribute for a given element id.
 * Used for a "raw CSS" textarea per element.
 */
export function updateHtmlRawStyle(
  html: string,
  id: string,
  style: string,
): string {
  if (!html || typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = stripScripts(html);
  const el = container.querySelector<HTMLElement>(`[data-el-id="${id}"]`);
  if (!el) return html;
  el.setAttribute("style", style || "");
  return container.innerHTML;
}

/**
 * Remove one or more elements (by data-el-id) from an HTML layout.
 * Used when deleting layers so we don't regenerate the entire HTML.
 */
export function deleteHtmlElementsById(html: string, ids: string[]): string {
  if (!html || typeof document === "undefined" || ids.length === 0) return html;
  const container = document.createElement("div");
  container.innerHTML = stripScripts(html);
  for (const id of ids) {
    const el = container.querySelector<HTMLElement>(`[data-el-id="${id}"]`);
    if (el && el.parentElement) {
      el.parentElement.removeChild(el);
    }
  }
  return container.innerHTML;
}

/**
 * Replace the text content of the element with the given id.
 * This is used when editing text layers directly from the editor.
 */
export function updateHtmlTextContent(
  html: string,
  id: string,
  text: string,
): string {
  if (!html || typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = stripScripts(html);
  const el = container.querySelector<HTMLElement>(`[data-el-id="${id}"]`);
  if (!el) return html;
  el.textContent = text;
  return container.innerHTML;
}

/**
 * Ensure every absolutely positioned element in the HTML has a stable data-el-id
 * attribute, without changing any other structure or styles. This is used when
 * the user pastes raw HTML in the HTML tab so the editor can later target and
 * modify specific elements reliably.
 */
export function ensureHtmlHasElementIds(html: string): string {
  if (!html || typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = stripScripts(html);

  const walk = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    const style = el.style;
    if (style.position === "absolute") {
      const existingId = el.getAttribute("data-el-id");
      if (!existingId || existingId.trim().length === 0) {
        el.setAttribute("data-el-id", crypto.randomUUID());
      }
    }
    Array.from(el.children).forEach(walk);
  };

  Array.from(container.children).forEach(walk);
  return container.innerHTML;
}

function parseAbsoluteHtmlToTemplateElements(
  html: string,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  if (typeof document === "undefined") return [];

  const sanitized = stripScripts(html);
  const container = document.createElement("div");
  // Attach off-screen so we can rely on real DOM layout (getBoundingClientRect)
  container.style.position = "absolute";
  container.style.left = "-10000px";
  container.style.top = "-10000px";
  container.style.visibility = "hidden";
  container.innerHTML = sanitized;
  document.body.appendChild(container);

  try {
    // Prefer a body element if present (for full HTML documents), otherwise
    // fall back to the first <div>, then the first element child.
    let root: HTMLElement | null = container.querySelector("body");
    if (!root) {
      root = container.querySelector("div");
    }
    if (!root) {
      root = container.firstElementChild as HTMLElement | null;
    }
    if (!root) return [];

    const rootRect = root.getBoundingClientRect();

    const result: TemplateElement[] = [];
    let zIndexCounter = 0;

    const toPx = (value: string | null | undefined): number => {
      if (!value) return 0;
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    };

    const walk = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;

      const style = el.style;
      const rawStyleAttr = el.getAttribute("style") || "";
      const position = style.position || "";

      if (position === "absolute") {
        // Use the actual rendered box relative to the root so CSS (flex, fonts, etc.)
        // is respected even when width/height are not explicitly set inline.
        const rect = el.getBoundingClientRect();
        let x = rect.left - rootRect.left;
        let y = rect.top - rootRect.top;
        let width = rect.width;
        let height = rect.height;

        if (width <= 0) width = toPx(style.width) || 120;
        if (height <= 0) height = toPx(style.height) || 40;

        const transform = style.transform || "";
        let rotation = 0;
        const match = transform.match(/rotate\(([-\d.]+)deg\)/);
        if (match) rotation = parseFloat(match[1]);

        const opacity = style.opacity ? parseFloat(style.opacity) : undefined;
        const tag = el.tagName.toLowerCase();

        const existingId = el.getAttribute("data-el-id");
        const id = existingId && existingId.trim().length > 0 ? existingId : crypto.randomUUID();

        if (tag === "img") {
          const img = el as HTMLImageElement;
          const src = img.getAttribute("src") || "";
          const logoEl: TemplateElement = {
            id,
            name: img.getAttribute("alt") || "Image",
            type: "image",
            x,
            y,
            width,
            height,
            rotation,
            zIndex: zIndexCounter++,
            style: rawStyleAttr,
            opacity,
            // @ts-expect-error - src is valid on image type
            src,
          } as any;
          result.push(logoEl);
        } else if (tag === "svg") {
          const path = el.querySelector("path");
          const d = path?.getAttribute("d") || "";
          const fill = path?.getAttribute("fill") || undefined;
          const stroke = path?.getAttribute("stroke") || undefined;
          const strokeWidthAttr = path?.getAttribute("stroke-width");
          const strokeWidth = strokeWidthAttr ? parseFloat(strokeWidthAttr) : undefined;
          const svgEl: TemplateElement = {
            id,
            name: "SVG",
            type: "svg",
            x,
            y,
            width,
            height,
            rotation,
            zIndex: zIndexCounter++,
            style: rawStyleAttr,
            opacity,
            // @ts-expect-error - svg specific props
            content: d,
            fill,
            stroke,
            strokeWidth,
          } as any;
          result.push(svgEl);
        } else {
          const textContent = (el.textContent || "").trim();
          const backgroundColor = style.backgroundColor || "";
          const borderRadiusCss = style.borderRadius || "";
          const borderRadius = borderRadiusCss ? toPx(borderRadiusCss) : undefined;
          const fontSize = style.fontSize ? toPx(style.fontSize) : 16;
          const color = style.color || "#000000";
          const fontFamily = style.fontFamily || "Inter";
          const fontWeight = style.fontWeight || "400";
          const textAlign = (style.textAlign as any) || "center";

          if (textContent) {
            const textEl: TemplateElement = {
              id,
              name: "Text",
              type: "text",
              x,
              y,
              width,
              height,
              rotation,
              zIndex: zIndexCounter++,
              style: rawStyleAttr,
              opacity,
              // @ts-expect-error - text specific props
              content: textContent,
              fontSize,
              fontFamily,
              color,
              fontWeight,
              textAlign,
            } as any;
            result.push(textEl);
          } else if (backgroundColor) {
            const shapeEl: TemplateElement = {
              id,
              name: "Shape",
              type: "shape",
              x,
              y,
              width,
              height,
              rotation,
              zIndex: zIndexCounter++,
              style: rawStyleAttr,
              opacity,
              // @ts-expect-error - shape specific props
              shape: borderRadius && borderRadius > Math.min(width, height) / 3 ? "circle" : "rectangle",
              color: backgroundColor,
              borderRadius,
            } as any;
            result.push(shapeEl);
          } else {
            // Fallback: treat any other absolutely positioned element as a generic
            // frame so it is still selectable and transformable in the editor.
            const frameEl: TemplateElement = {
              id,
              name: "Frame",
              type: "shape",
              x,
              y,
              width,
              height,
              rotation,
              zIndex: zIndexCounter++,
              style: rawStyleAttr,
              opacity,
              // @ts-expect-error - shape specific props
              shape: "rectangle",
              color: "transparent",
              borderRadius,
            } as any;
            result.push(frameEl);
          }
        }
      }

      Array.from(el.children).forEach(walk);
    };

    walk(root);
    return result;
  } finally {
    // Always detach the off-screen container
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Parse an absolute-positioned HTML snippet into TemplateElements.
 * This is intentionally lossy (we only care about geometry and a few visual props).
 */
export function htmlToElements(
  html: string,
  canvasWidth: number,
  canvasHeight: number,
): TemplateElement[] {
  return parseAbsoluteHtmlToTemplateElements(html, canvasWidth, canvasHeight);
}

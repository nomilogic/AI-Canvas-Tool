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
    typeof s === 'string' 
      ? s.replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;")
      : "";

  const children = sorted
    .map((el) => {
      const inlineStyle = (el as any).style || "";
      const commonAttrs = `data-el-id="${el.id}" style="${inlineStyle}"`;

      if (el.type === "shape") {
        const s = el as ShapeElement;
        const shapeType = (s as any).shape || "rectangle";
        return `<div data-el-id="${el.id}" data-shape="${shapeType}" style="${inlineStyle}"></div>`;
      }

      if (el.type === "text") {
        const t = el as TextElement;
        return `<div data-el-id="${el.id}" style="${inlineStyle}">${escapeHtml(
          t.content || "",
        )}</div>`;
      }

      if (el.type === "image") {
        const img = el as LogoElement;
        const src = (img as any).src || "";
        return `<img data-el-id="${el.id}" alt="${escapeHtml(img.name || "Image")}" src="${escapeHtml(
          src,
        )}" style="${inlineStyle}" />`;
      }

      if (el.type === "svg") {
        const svg = el as SvgElement;
        const d = svg.content || "";
        const viewBox = svg.viewBox || "0 0 24 24";
        return `<svg data-el-id="${el.id}" viewBox="${viewBox}" style="${inlineStyle}"><path d="${d}" fill="currentColor"></path></svg>`;
      }

      return `<div ${commonAttrs}></div>`;
    })
    .join("\n");

 

  return `${children}`;
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

    // Clear opposing positional constraints so left/top/width/height fully define
    // the box. This avoids distortions when the original HTML used right/bottom.
    style.right = "";
    style.bottom = "";

    const rotation = Math.round(t.rotation || 0);

    // For edited elements we canonicalize transforms to "rotate(...)" only.
    // Any previous translate/scale/etc. is baked into left/top/width/height via
    // parseAbsoluteHtmlToTemplateElements, so keeping them here would double-apply
    // the effect and cause scaling/offset bugs.
    if (!rotation) {
      style.transform = "";
    } else {
      style.transform = `rotate(${rotation}deg)`;
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
  if (!html) return html;

  // In browser environments use the real DOM for accurate parsing & layout.
  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = stripScripts(html);
    
    // Support both data-el-id and regular id attributes for maximum compatibility
    const el = container.querySelector<HTMLElement>(`[data-el-id="${id}"], #${id}`);
    if (!el) {
      console.warn(`Element with ID ${id} not found in HTML for style update`);
      return html;
    }
    
    // Set the style attribute directly
    el.setAttribute("style", style || "");
    
    // If it's the root element, return its outerHTML, otherwise return container's innerHTML
    return container.innerHTML;
  }

  // Server-side / test fallback: do a best-effort string replacement so tests
  // and non-DOM environments can still patch inline styles.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRe = new RegExp(`(<[^>]*data-el-id=["']${esc(id)}["'][^>]*>)`, "i");
  const m = html.match(tagRe);
  if (!m) return html;
  const tag = m[1];
  let newTag: string;
  if (/\sstyle=/.test(tag)) {
    newTag = tag.replace(/style=("[^"]*"|'[^']*')/i, `style="${style}"`);
  } else {
    newTag = tag.replace(/>$/, ` style="${style}">`);
  }
  return html.replace(tag, newTag);
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
 * Update the primary <path> d attribute and/or viewBox for a given SVG element id.
 * This lets the editor offer a simple "SVG code" textarea without regenerating
 * the entire HTML tree from TemplateElements.
 */
export function updateHtmlSvgContent(
  html: string,
  id: string,
  options: { d?: string; viewBox?: string | null },
): string {
  if (!html || typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = stripScripts(html);

  const svg = container.querySelector<SVGElement>(`svg[data-el-id="${id}"]`);
  if (!svg) return html;

  if (Object.prototype.hasOwnProperty.call(options, "viewBox")) {
    const vb = options.viewBox;
    if (vb && vb.trim().length > 0) {
      svg.setAttribute("viewBox", vb);
    } else {
      svg.removeAttribute("viewBox");
    }
  }

  if (typeof options.d === "string") {
    let path = svg.querySelector("path");
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.appendChild(path);
    }
    path.setAttribute("d", options.d);
  }

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
    // Treat both HTML and SVG elements as candidates. Many SVG tags still expose
    // a .style declaration and participate in absolute layout when authored with
    // inline styles.
    const anyEl = el as any;
    const style: CSSStyleDeclaration | undefined = anyEl && anyEl.style;

    if (style && style.position === "absolute") {
      const existingId = anyEl.getAttribute?.("data-el-id");
      if (!existingId || existingId.trim().length === 0) {
        anyEl.setAttribute("data-el-id", crypto.randomUUID());
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
      // Support both HTML and SVG elements; many SVGs participate in layout with
      // inline styles just like divs.
      const anyEl = el as any;
      const style: CSSStyleDeclaration = anyEl.style || ({} as any);
      const rawStyleAttr = (anyEl.getAttribute?.("style") as string) || "";
      const position = style.position || "";

      if (position === "absolute") {
        // Use the actual rendered box *and* any inline left/top/width/height so we
        // don't accidentally change the element's size when rotating.
        const rect = anyEl.getBoundingClientRect();

        // Start from the rendered box relative to root.
        let x = rect.left - rootRect.left;
        let y = rect.top - rootRect.top;
        let width = rect.width;
        let height = rect.height;

        // Prefer inline CSS geometry when present; for rotated elements this keeps
        // width/height stable instead of recomputing from the rotated bounding box.
        const cssLeft = style.left || style.insetInlineStart || "";
        const cssTop = style.top || style.insetBlockStart || "";
        if (cssLeft) x = toPx(cssLeft);
        if (cssTop) y = toPx(cssTop);

        const cssWidth = style.width;
        const cssHeight = style.height;
        if (cssWidth) width = toPx(cssWidth);
        if (cssHeight) height = toPx(cssHeight);

        if (width <= 0) width = toPx(style.width) || 120;
        if (height <= 0) height = toPx(style.height) || 40;

        const transform = style.transform || "";
        let rotation = 0;
        const match = transform.match(/rotate\(([-\d.]+)deg\)/);
        if (match) rotation = parseFloat(match[1]);

        const opacity = style.opacity ? parseFloat(style.opacity) : undefined;
        const tag = (anyEl.tagName as string).toLowerCase();

        // Capture shadow and gradient from computed style if not in inline style
        const boxShadow = style.boxShadow || "";
        const background = style.background || "";
        const clipPath = style.clipPath || "";

        const existingId = anyEl.getAttribute?.("data-el-id") as string | null;
        const id = existingId && existingId.trim().length > 0 ? existingId : crypto.randomUUID();

        if (tag === "img") {
          const img = anyEl as HTMLImageElement;
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
          const path = anyEl.querySelector("path");
          const d = path?.getAttribute("d") || "";
          const fill = path?.getAttribute("fill") || undefined;
          const stroke = path?.getAttribute("stroke") || undefined;
          const strokeWidthAttr = path?.getAttribute("stroke-width");
          const strokeWidth = strokeWidthAttr ? parseFloat(strokeWidthAttr) : undefined;
          const viewBoxAttr = (anyEl.getAttribute("viewBox") || anyEl.getAttribute("viewbox") || "") as string;
          const viewBox = viewBoxAttr && viewBoxAttr.trim().length > 0 ? viewBoxAttr : undefined;
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
            viewBox,
            fill,
            stroke,
            strokeWidth,
          } as any;
          result.push(svgEl);
        } else {
          const textContent = (anyEl.textContent || "").trim();
          const backgroundColor = style.backgroundColor || style.background || "";
          const borderRadiusCss = style.borderRadius || "";
          const borderRadius = borderRadiusCss ? toPx(borderRadiusCss) : undefined;
          const fontSize = style.fontSize ? toPx(style.fontSize) : 16;
          const color = style.color || "#000000";
          const fontFamily = style.fontFamily || "Inter";
          const fontWeight = style.fontWeight || "400";
          const textAlign = (style.textAlign as any) || "center";
          const dataShape = anyEl.getAttribute?.("data-shape");

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
              style: rawStyleAttr || `background:${background};box-shadow:${boxShadow};clip-path:${clipPath}`,
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
          } else if (backgroundColor || background || boxShadow) {
            // Preserve the original logical shape if it was encoded, otherwise infer from borderRadius.
            const inferredShape =
              borderRadius && borderRadius > Math.min(width, height) / 3 ? "circle" : "rectangle";
            const shapeKind = (dataShape as any) || inferredShape;

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
              style: rawStyleAttr || `background:${background};box-shadow:${boxShadow};clip-path:${clipPath}`,
              opacity,
              // @ts-expect-error - shape specific props
              shape: shapeKind,
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

/**
 * Append one or more new TemplateElements to an existing HTML layout without
 * rebuilding the whole tree. This is used when the user adds new layers from
 * the toolbar while working with rich AI-authored HTML.
 */
export function appendElementsToHtml(
  html: string,
  elements: TemplateElement[],
  canvasSize: { width: number; height: number },
): string {
  if (!html || typeof document === "undefined" || !Array.isArray(elements) || elements.length === 0) {
    return html;
  }

  const container = document.createElement("div");
  container.innerHTML = stripScripts(html);

  // Reuse the same root selection logic as the HTML parser so we append inside
  // the main canvas element rather than outside it.
  let root: HTMLElement | null = container.querySelector("body");
  if (!root) {
    root = container.querySelector("div");
  }
  if (!root) {
    root = container.firstElementChild as HTMLElement | null;
  }
  if (!root) {
    root = container;
  }

  // Generate standalone HTML for just the new elements, then strip its wrapper
  // and append the children into the existing root.
  const tmp = document.createElement("div");
  tmp.innerHTML = elementsToHtml(elements, canvasSize);
  const generatedRoot = tmp.firstElementChild as HTMLElement | null;
  if (generatedRoot) {
    while (generatedRoot.firstChild) {
      root.appendChild(generatedRoot.firstChild);
    }
  }

  return container.innerHTML;
}

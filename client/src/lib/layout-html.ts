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

  // If there is a full-canvas shape element (the relative root div from AI),
  // prefer to use it as the background for the root container so editing it
  // updates the canvas directly. We also attach its data-el-id to the root
  // so in-place raw CSS edits can target the root element.
  const bgEl = sorted.find(
    (e) =>
      e.type === "shape" &&
      e.x <= 0 &&
      e.y <= 0 &&
      e.width >= width &&
      e.height >= height,
  ) as any | undefined;

  const children = sorted
    .filter((el) => !(bgEl && el.id === bgEl.id))
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

        // Background / Gradient / Fill
        if (s.gradient && (s.gradient as any).enabled) {
          const g = s.gradient as any;
          if (g.type === 'linear') {
            const stops = Array.isArray(g.stops) ? g.stops : [];
            const parts = stops.map((st: any) => `${st.color} ${Math.round((st.offset ?? 0) * 100)}%`);
            const angle = typeof g.rotation === 'number' ? `${g.rotation}deg` : '0deg';
            shapeStyle.push(`background:linear-gradient(${angle}, ${parts.join(', ')})`);
          } else if (g.type === 'radial') {
            const stops = Array.isArray(g.stops) ? g.stops : [];
            const parts = stops.map((st: any) => `${st.color} ${Math.round((st.offset ?? 0) * 100)}%`);
            shapeStyle.push(`background:radial-gradient(circle, ${parts.join(', ')})`);
          }
        } else if ((s as any).color) {
          shapeStyle.push(`background:${(s as any).color}`);
        }

        // Encode the logical shape type into CSS so non-rectangular shapes (triangle,
        // diamond, etc.) are actually visible in the HTML renderer.
        switch ((s as any).shape) {
          case "circle":
            shapeStyle.push("border-radius:9999px");
            break;
          case "triangle":
            shapeStyle.push("clip-path:polygon(50% 0,100% 100%,0 100%)");
            break;
          case "diamond":
            shapeStyle.push("clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)");
            break;
          case "pentagon":
            shapeStyle.push("clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)");
            break;
          case "hexagon":
            shapeStyle.push("clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)");
            break;
          case "octagon":
            shapeStyle.push(
              "clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)",
            );
            break;
          case "rounded-rectangle":
            shapeStyle.push("border-radius:16px");
            break;
        }

        // Explicit borderRadius on the element overrides the canned defaults above.
        if (typeof (s as any).borderRadius === "number") {
          shapeStyle.push(`border-radius:${Math.round((s as any).borderRadius)}px`);
        }

        // Shadow
        if ((s as any).shadow && (s as any).shadow.enabled) {
          const sh = (s as any).shadow as any;
          const hex = (sh.color || '#000000').replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          const o = typeof sh.opacity === 'number' ? sh.opacity : 1;
          shapeStyle.push(`box-shadow:${Math.round(sh.offsetX)}px ${Math.round(sh.offsetY)}px ${Math.round(sh.blur)}px rgba(${r},${g},${b},${o})`);
        }

        const merged = style.concat(shapeStyle);
        const dataAttrs = [`data-el-id=\"${el.id}\"`, (s as any).shape ? `data-shape=\"${(s as any).shape}\"` : null]
          .filter(Boolean)
          .join(" ");

        return `<div ${dataAttrs} style="${merged.join(";")}"></div>`;
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
        const viewBox = svg.viewBox && svg.viewBox.trim().length > 0 ? svg.viewBox : "0 0 100 100";
        const w = Math.max(1, Math.round(el.width));
        const h = Math.max(1, Math.round(el.height));
        return `<svg data-el-id="${el.id}" viewBox="${viewBox}" width="${w}" height="${h}" style="${svgStyle.join(";")}">
  <path d="${d}" fill="${fill}"${strokeAttrs}></path>
</svg>`;
      }

      // Fallback: non-supported types become empty divs with their box preserved.
      return `<div ${commonAttrs}></div>`;
    })
    .join("\n");

  // Build the root style. If we have an explicit background element, use its
  // visual properties (color/gradient/image) on the root so it behaves like
  // a true canvas background and is easy to edit.
  const rootStyleParts: string[] = ["position:relative", `width:${Math.round(width)}px`, `height:${Math.round(height)}px`, "overflow:hidden"];
  let rootDataAttr = '';
  if (bgEl) {
    // If the background element has a custom style, try to preserve its background/clip properties
    if (bgEl.style) {
      const parts = bgEl.style.split(';');
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.startsWith('background') || trimmed.startsWith('clip-path') || trimmed.startsWith('border-radius')) {
          rootStyleParts.push(trimmed);
        }
      }
    }

    // Use gradient if present and not already overridden by background in style
    const hasBackgroundInStyle = rootStyleParts.some(p => p.startsWith('background'));
    if (!hasBackgroundInStyle && bgEl.gradient && (bgEl.gradient as any).enabled) {
      const g = bgEl.gradient as any;
      if (g.type === 'linear') {
        const stops = Array.isArray(g.stops) ? g.stops : [];
        const parts = stops.map((st: any) => `${st.color} ${Math.round((st.offset ?? 0) * 100)}%`);
        const angle = typeof g.rotation === 'number' ? `${g.rotation}deg` : '0deg';
        rootStyleParts.push(`background:linear-gradient(${angle}, ${parts.join(', ')})`);
      } else if (g.type === 'radial') {
        const stops = Array.isArray(g.stops) ? g.stops : [];
        const parts = stops.map((st: any) => `${st.color} ${Math.round((st.offset ?? 0) * 100)}%`);
        rootStyleParts.push(`background:radial-gradient(circle, ${parts.join(', ')})`);
      }
    } else if (!hasBackgroundInStyle && (bgEl as any).color) {
      rootStyleParts.push(`background:${(bgEl as any).color}`);
    }

    if ((bgEl as any).shadow && (bgEl as any).shadow.enabled) {
      const sh = (bgEl as any).shadow as any;
      const hex = (sh.color || '#000000').replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const o = typeof sh.opacity === 'number' ? sh.opacity : 1;
      rootStyleParts.push(`box-shadow:${Math.round(sh.offsetX)}px ${Math.round(sh.offsetY)}px ${Math.round(sh.blur)}px rgba(${r},${g},${b},${o})`);
    }

    // Expose the background element id on the root so raw CSS edits can target it.
    rootDataAttr = ` data-el-id=\"${bgEl.id}\"`;
  } else {
    rootStyleParts.push("background:#ffffff");
  }

  const rootStyle = rootStyleParts.join(";");

  return `<div${rootDataAttr} style="${rootStyle}">
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
    const el = container.querySelector<HTMLElement>(`[data-el-id="${id}"]`);
    if (!el) return html;
    el.setAttribute("style", style || "");
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
          const backgroundColor = style.backgroundColor || "";
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

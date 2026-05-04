/**
 * Export a passport profile as PNG image.
 * Uses html2canvas to render the profile card to an image.
 */
import html2canvas from "html2canvas";

/**
 * Regex that matches color values html2canvas cannot parse:
 *  - oklab(...)  — produced by browsers when resolving CSS relative-color syntax
 *  - oklch(...)  — same source
 *  - hsl(from ...) / color(from ...) — relative-color syntax that may survive as-is
 */
const UNSAFE_COLOR_RE = /oklab\(|oklch\(|hsl\(\s*from\s|color\(\s*from\s/i;

/**
 * CSS longhand properties that can carry color values.
 * We check these on every element and force a safe fallback when they contain
 * an unsupported color function, preventing the html2canvas parse crash.
 */
const COLOR_PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "column-rule-color",
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
  "box-shadow",
  "text-shadow",
];

/**
 * Walk every element in `root` (including root itself) and strip any
 * computed or inline style value that html2canvas cannot parse.
 *
 * Called inside html2canvas's onclone callback so the original DOM is
 * never mutated.
 */
function sanitizeUnsafeColors(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;

  function walk(el: Element): void {
    if (!(el instanceof (win as Window & typeof globalThis).HTMLElement) &&
        !(el instanceof (win as Window & typeof globalThis).SVGElement)) {
      return;
    }

    const htmlEl = el as HTMLElement;
    const computed = win.getComputedStyle(el);

    // 1. Check computed values for every colour-bearing longhand property.
    for (const prop of COLOR_PROPS) {
      const val = computed.getPropertyValue(prop);
      if (val && UNSAFE_COLOR_RE.test(val)) {
        htmlEl.style.setProperty(prop, "transparent");
      }
    }

    // 2. Also scan inline style declarations (including CSS custom properties)
    //    because some frameworks write relative-color values directly as style attrs.
    //    Iterate backwards so removal doesn't shift indices.
    for (let i = htmlEl.style.length - 1; i >= 0; i--) {
      const p = htmlEl.style[i];
      const v = htmlEl.style.getPropertyValue(p);
      if (v && UNSAFE_COLOR_RE.test(v)) {
        // For custom properties, remove entirely; for standard props, set transparent.
        if (p.startsWith("--")) {
          htmlEl.style.removeProperty(p);
        } else {
          htmlEl.style.setProperty(p, "transparent");
        }
      }
    }

    for (const child of el.children) {
      walk(child);
    }
  }

  walk(root);
}

export async function downloadPassportPNG(address: string, elementId: string = "passport-card"): Promise<void> {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error("Passport card element not found");
    }

    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
      allowTaint: true,
      useCORS: true,
      onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
        sanitizeUnsafeColors(clonedEl);
      },
    });

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `repsolana-passport-${address.slice(0, 8)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    const e = err as Error;
    throw new Error(`Failed to export passport: ${e.message}`);
  }
}

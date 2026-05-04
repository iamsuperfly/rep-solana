/**
 * Export a passport profile as PNG image.
 *
 * Uses html2canvas-pro (aliased as html2canvas) which supports most
 * CSS Color Level 4 — but Tailwind v4 opacity modifiers (bg-primary/30, etc.)
 * still resolve to color-mix(in oklch, ...) in computed styles, and
 * bg-clip-text / text-transparent gradient text renders as invisible.
 *
 * Fix (Option A): inject a CSS override block into the cloned document that:
 *   1. Re-declares all CSS custom properties as plain hsl() values.
 *   2. Replaces gradient clip-text with a solid fallback color.
 *   3. Replaces oklch-based opacity backgrounds with direct rgba().
 */
import html2canvas from "html2canvas";

/**
 * Injected into the cloned DOM right before html2canvas renders.
 * All values are static hsl() / rgba() — zero color-mix or oklch.
 */
const EXPORT_COMPAT_CSS = `
  /* ── Reset CSS custom properties to plain hsl() so html2canvas never
        encounters oklch / color-mix during paint. ── */
  :root, .dark {
    --background:            240 18% 5%;
    --foreground:            220 20% 96%;
    --border:                260 25% 16%;
    --input:                 260 25% 14%;
    --ring:                  270 95% 70%;
    --card:                  240 22% 8%;
    --card-foreground:       220 20% 96%;
    --muted:                 240 18% 12%;
    --muted-foreground:      240 10% 65%;
    --primary:               270 95% 65%;
    --primary-foreground:    0   0%  100%;
    --secondary:             165 95% 55%;
    --secondary-foreground:  240 18% 5%;
    --accent:                195 100% 55%;
    --accent-foreground:     240 18% 5%;
    --destructive:           0   75% 60%;

    /* Resolved token aliases (Tailwind @theme inline) */
    --color-background:       hsl(240, 18%,  5%);
    --color-foreground:       hsl(220, 20%, 96%);
    --color-border:           hsl(260, 25%, 16%);
    --color-card:             hsl(240, 22%,  8%);
    --color-card-foreground:  hsl(220, 20%, 96%);
    --color-muted:            hsl(240, 18%, 12%);
    --color-muted-foreground: hsl(240, 10%, 65%);
    --color-primary:          hsl(270, 95%, 65%);
    --color-secondary:        hsl(165, 95%, 55%);
    --color-accent:           hsl(195, 100%, 55%);
    --color-destructive:      hsl(  0, 75%, 60%);
  }

  /* ── Gradient clip-text -> solid fallback.
        html2canvas cannot render -webkit-background-clip:text so the tier
        label renders invisible. Replace with the gradient start-color (purple). ── */
  #passport-card [class*="bg-clip-text"],
  #passport-card [class*="text-transparent"] {
    -webkit-background-clip: unset !important;
    background-clip:         unset !important;
    -webkit-text-fill-color: hsl(270, 95%, 70%) !important;
    color:                   hsl(270, 95%, 70%) !important;
  }

  /* ── Opacity-modified backgrounds (bg-primary/30, bg-secondary/20, etc.)
        Tailwind v4 emits color-mix(in oklch, ...) for these; replace with rgba. ── */
  #passport-card [class*="bg-primary/"] {
    background-color: rgba(153, 69, 255, 0.30) !important;
  }
  #passport-card [class*="bg-secondary/"] {
    background-color: rgba(20, 241, 149, 0.20) !important;
  }
  #passport-card [class*="bg-background/"] {
    background-color: rgba(11, 11, 20, 0.40) !important;
  }
  #passport-card [class*="bg-muted/"] {
    background-color: rgba(22, 21, 37, 0.40) !important;
  }

  /* ── Explicit card root colors ── */
  #passport-card {
    background-color: hsl(240, 22%, 8%) !important;
    color: hsl(220, 20%, 96%) !important;
  }

  /* ── Image normalisation (Tailwind preflight sets img { display:block }
        which can shift text baselines in the canvas render). ── */
  img {
    display: inline-block !important;
    vertical-align: middle !important;
  }
`;

export async function downloadPassportPNG(
  address: string,
  elementId: string = "passport-card",
): Promise<void> {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error("Passport card element not found");
    }

    const canvas = await html2canvas(element, {
      backgroundColor: "hsl(240, 22%, 8%)",
      scale: 2,
      logging: false,
      allowTaint: false,
      useCORS: true,
      imageTimeout: 15000,
      onclone: (clonedDoc: Document) => {
        const style = clonedDoc.createElement("style");
        style.textContent = EXPORT_COMPAT_CSS;
        clonedDoc.head.appendChild(style);
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

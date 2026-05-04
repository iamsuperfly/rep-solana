/**
 * Screenshot the passport card and download it as a PNG.
 *
 * Uses html2canvas-pro (aliased as html2canvas in package.json pnpm overrides).
 * A compat CSS block is injected into the cloned document so html2canvas never
 * encounters oklch / color-mix() in computed styles — Tailwind v4 emits these
 * for opacity modifiers (bg-primary/30 etc.) and color tokens.
 *
 * The capture size matches whatever the browser is currently rendering
 * (desktop, mobile, etc.) — no forced dimensions.
 */
import html2canvas from "html2canvas";

/** Injected only into the cloned DOM — zero effect on the live UI. */
const SCREENSHOT_COMPAT_CSS = `
  /* Re-declare CSS custom properties as plain hsl() so html2canvas never
     encounters oklch / color-mix() during paint. */
  :root, .dark {
    --background:           240 18% 5%;
    --foreground:           220 20% 96%;
    --border:               260 25% 16%;
    --card:                 240 22% 8%;
    --card-foreground:      220 20% 96%;
    --muted:                240 18% 12%;
    --muted-foreground:     240 10% 65%;
    --primary:              270 95% 65%;
    --primary-foreground:   0   0%  100%;
    --secondary:            165 95% 55%;
    --secondary-foreground: 240 18% 5%;
    --accent:               195 100% 55%;
    --accent-foreground:    240 18% 5%;
    --destructive:          0   75% 60%;

    /* Resolved Tailwind @theme inline tokens */
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

  /* Gradient clip-text (tier label) → solid purple fallback.
     html2canvas cannot read back -webkit-background-clip:text,
     so without this the tier label would be invisible. */
  #passport-card [class*="bg-clip-text"],
  #passport-card [class*="text-transparent"] {
    -webkit-background-clip: unset !important;
    background-clip:         unset !important;
    -webkit-text-fill-color: hsl(270, 95%, 70%) !important;
    color:                   hsl(270, 95%, 70%) !important;
  }

  /* Opacity-modified backgrounds — Tailwind v4 emits color-mix(in oklch,…)
     for these; replace with plain rgba(). */
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

  /* Explicit card root colours */
  #passport-card {
    background-color: hsl(240, 22%, 8%) !important;
    color: hsl(220, 20%, 96%) !important;
  }

  /* Tailwind preflight sets img { display: block } which shifts text
     baselines in the canvas render. */
  img {
    display: inline-block !important;
    vertical-align: middle !important;
  }
`;

/**
 * Captures the #passport-card element and triggers a PNG download.
 * Size reflects the current browser viewport — no forced dimensions.
 */
export async function screenshotPassport(address: string): Promise<void> {
  const element = document.getElementById("passport-card");
  if (!element) {
    throw new Error("Passport card not found on this page.");
  }

  const canvas = await html2canvas(element, {
    backgroundColor: "hsl(240, 22%, 8%)",
    scale: 2,           // 2× for crisp retina output
    logging: false,
    useCORS: true,
    allowTaint: false,
    imageTimeout: 15000,
    onclone: (clonedDoc: Document) => {
      const style = clonedDoc.createElement("style");
      style.textContent = SCREENSHOT_COMPAT_CSS;
      clonedDoc.head.appendChild(style);
    },
  });

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `repsolana-passport-${address.slice(0, 8)}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

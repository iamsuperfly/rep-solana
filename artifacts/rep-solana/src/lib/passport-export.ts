/**
 * Export a passport profile as PNG image.
 * Uses html2canvas-pro (aliased as html2canvas) which natively supports
 * oklab(), oklch(), and CSS Color Level 4 — eliminating the
 * "unsupported color function" crash that plagued the original html2canvas.
 */
import html2canvas from "html2canvas";

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
      allowTaint: false,
      useCORS: true,
      imageTimeout: 15000,
      onclone: (clonedDoc: Document) => {
        // Layout stabilisation: Tailwind v4 preflight sets img { display: block }
        // which can cause vertical text shifts in the rendered canvas.
        // Forcing inline-block restores the expected alignment.
        const style = clonedDoc.createElement("style");
        style.textContent = `
          img { display: inline-block !important; vertical-align: middle !important; }
          * { line-height: initial !important; -webkit-font-smoothing: antialiased; }
        `;
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

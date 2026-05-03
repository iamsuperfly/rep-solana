/**
 * Export a passport profile as PNG image.
 * Uses html2canvas to render the profile card to an image.
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
      allowTaint: true,
      useCORS: true,
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

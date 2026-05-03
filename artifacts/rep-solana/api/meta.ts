/**
 * Vercel Edge Runtime function: GET /api/meta?a=<address>&s=<score>&t=<tier>
 *
 * Generates Metaplex-compatible NFT metadata JSON on the fly.
 * Used as the cNFT metadata URI so wallets and Helius can fetch it
 * without any external service, upload step, or CORS gymnastics.
 *
 * Uses the Vercel Edge Runtime (web standard Request/Response) so there
 * are no Node.js type imports — no build errors, no compatibility issues.
 *
 * URL baked into the cNFT leaf (example):
 *   https://rep-solana.vercel.app/api/meta?a=7D4r...&s=72&t=Trusted
 * Length: ~110 chars max — well within Bubblegum's 200-byte URI limit.
 */

export const config = { runtime: "edge" };

export default function handler(req: Request): Response {
  const url = new URL(req.url);

  const address = url.searchParams.get("a") ?? "";
  const score = Math.max(
    0,
    Math.min(100, parseInt(url.searchParams.get("s") ?? "0") || 0),
  );
  const tier = url.searchParams.get("t") ?? "New";

  if (!address) {
    return new Response(
      JSON.stringify({ error: "Missing required param: a (wallet address)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const origin = url.origin;
  const imageUrl = `${origin}/passport.png`;

  const metadata = {
    name: `RepSolana #${score} · ${tier}`,
    symbol: "REPSOL",
    description:
      "Soulbound, compressed reputation passport on Solana. " +
      "Score and tier are derived from on-chain activity at mint time. " +
      "Non-transferable: enforced via Metaplex Bubblegum V2 + Core PermanentFreezeDelegate.",
    image: imageUrl,
    external_url: `${origin}/p/${address}`,
    attributes: [
      { trait_type: "Score", value: score },
      { trait_type: "Tier", value: tier },
      { trait_type: "Soulbound", value: "true" },
      { trait_type: "Standard", value: "Bubblegum V2" },
    ],
    properties: {
      category: "image",
      creators: [{ address, share: 100 }],
      files: [{ uri: imageUrl, type: "image/png" }],
    },
  };

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=300, max-age=60, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

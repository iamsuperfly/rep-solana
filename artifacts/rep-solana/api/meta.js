/**
 * Vercel Edge function: GET /api/meta?a=<address>&s=<score>&t=<tier>
 *
 * Plain JavaScript — no TypeScript compilation, no type errors, no "Emit skipped".
 * Vercel routes .js files through esbuild directly, skipping tsc entirely.
 *
 * Returns Metaplex-compatible NFT metadata JSON on the fly.
 * This URL is baked into the cNFT leaf at mint time so wallets and Helius
 * always fetch clean JSON instead of the SPA HTML page.
 */

export const config = { runtime: "edge" };

export default function handler(req) {
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
      "Score and tier reflect on-chain activity at mint time. " +
      "Non-transferable via Metaplex Bubblegum V2 + PermanentFreezeDelegate.",
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

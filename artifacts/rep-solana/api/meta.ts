/**
 * Vercel serverless function: GET /api/meta?a=<address>&s=<score>&t=<tier>
 *
 * Generates Metaplex-compatible NFT metadata JSON on the fly.
 * Used as the cNFT metadata URI so wallets and Helius can fetch it
 * without any external service, upload step, or CORS gymnastics.
 *
 * Why this instead of jsonblob.com / IPFS / etc:
 *   - jsonblob POST hides the Location header from browsers (CORS)
 *   - jsonblob PUT returns 404 for new UUIDs (only updates existing blobs)
 *   - Every external service adds a failure point and rate limits
 *   This endpoint is self-hosted, stateless, always-on as long as
 *   Vercel is running, and returns correct Content-Type instantly.
 *
 * URL baked into the cNFT leaf (example):
 *   https://rep-solana.vercel.app/api/meta?a=7D4r...&s=72&t=Trusted
 * Length: ~110 chars max — well within Bubblegum's 200-byte URI limit.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url ?? "/api/meta";
  const base = `https://${req.headers.host ?? "rep-solana.vercel.app"}`;
  const url = new URL(rawUrl, base);

  const address = url.searchParams.get("a") ?? "";
  const score = Math.max(
    0,
    Math.min(100, parseInt(url.searchParams.get("s") ?? "0") || 0),
  );
  const tier = url.searchParams.get("t") ?? "New";

  if (!address) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing required param: a (wallet address)" }));
    return;
  }

  const origin = `https://${req.headers.host ?? "rep-solana.vercel.app"}`;
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

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, s-maxage=300, max-age=60, stale-while-revalidate=600",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(metadata));
}

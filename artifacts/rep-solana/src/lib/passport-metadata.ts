/**
 * Off-chain metadata builder + free, key-less JSON pinning for the
 * Bubblegum V2 cNFT `uri` field.
 *
 * Metadata upload strategy:
 *   We use jsonblob.com's anonymous, key-less, CORS-enabled JSON store.
 *
 *   IMPORTANT — why we use PUT (not POST):
 *   jsonblob.com's POST endpoint creates a blob and returns its URL via
 *   the `Location` response header. However jsonblob.com does NOT include
 *   `Access-Control-Expose-Headers: Location` in its CORS response, so
 *   the browser's fetch() silently hides that header from JavaScript —
 *   `res.headers.get("Location")` always returns null in a browser
 *   context. The upload succeeds but the code can never read the URL,
 *   causing the fallback to fire on every mint.
 *
 *   Fix: use PUT /api/jsonBlob/:id with a client-generated UUID. We
 *   choose the ID ourselves so we know the URL before the request fires —
 *   no response headers needed. GET /api/jsonBlob/:id returns the blob
 *   as application/json, which Helius and wallet apps can fetch correctly.
 *
 * Image strategy:
 *   The cNFT `image` field points to the single static collection image
 *   (`/passport.png`) so every holder sees the same unified passport
 *   visual in their wallet (Phantom, Backpack, etc.). Per-holder richness
 *   — score, tier, badges — lives in the `attributes` array and in the
 *   app's public profile page (/p/<address>). The inline SVG generated
 *   by `passportImageDataUri` is still used for the in-app PassportCard
 *   UI; it is NOT baked into the on-chain metadata image field.
 */

import type { ReputationProfile } from "./solana";
import { scoreTier } from "./passport";

/** Stable HTTPS URL of the single shared collection image shown in wallets. */
function collectionImageUrl(): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://repsolana.app";
  return `${origin}/passport.png`;
}

export interface OnChainMetadataAttribute {
  trait_type: string;
  value: string | number;
}

export interface OnChainPassportMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  attributes: OnChainMetadataAttribute[];
  properties: {
    category: "image";
    creators: { address: string; share: number }[];
    files: { uri: string; type: string }[];
  };
  // Custom — RepSolana-specific verifiable claim block.
  repsolana: {
    version: "2.0";
    standard: "metaplex-bubblegum-v2-soulbound";
    address: string;
    score: number;
    tier: string;
    badges: string[];
    breakdown: { label: string; value: number; max: number; detail: string }[];
    activitySummary: {
      walletAgeDays: number;
      totalTxs: number;
      successRate: number;
      defi: number;
      staking: number;
      nft: number;
      uniqueProgramCount: number;
      solBalance: number;
    };
    issuedAt: number;
    soulbound: true;
    collectionMint: string;
    merkleTree: string;
  };
}

export function buildOnChainMetadata(
  profile: ReputationProfile,
  ctx: { collectionMint: string; merkleTree: string },
): OnChainPassportMetadata {
  const tier = scoreTier(profile.score.total).label;
  const earnedBadges = profile.badges.filter((b) => b.earned).map((b) => b.label);
  const successRate =
    profile.stats.totalTxs > 0
      ? profile.stats.successTxs / profile.stats.totalTxs
      : 0;

  // Single static collection image — same for every holder in their wallet.
  // Per-holder score/tier/badges are expressed through `attributes` below.
  const image = collectionImageUrl();

  // ⚠ Solana's MetadataArgsV2.name has a HARD 32-byte limit. Anything
  // longer is silently truncated by the SDK — and crucially, that truncated
  // form is what the leaf hash commits to ON-CHAIN forever. We MUST keep
  // the score early in the name so it never gets clipped, even for a
  // 100-point Legendary passport.
  //
  // Format:                 "RepSolana #100 · Legendary"   (26 bytes ✓)
  //                         "RepSolana #50 · Active"       (22 bytes ✓)
  //                         "RepSolana #0 · New"           (18 bytes ✓)
  //
  // The two `·` characters are 2 bytes each in UTF-8; everything else is
  // ASCII. Worst case (3-digit score + "Legendary") = 26 bytes — well
  // within budget. The score immediately after `#` is what
  // `parseScoreFromAsset` reads as the canonical on-chain truth.
  const onChainName = `RepSolana #${profile.score.total} · ${tier}`;

  return {
    name: onChainName,
    symbol: "REPSOL",
    description:
      "Soulbound, compressed reputation passport on Solana. " +
      "Score, badges and activity claims are derived live from on-chain " +
      "history at mint time. Non-transferable: enforced via Metaplex " +
      "Bubblegum V2 + Core PermanentFreezeDelegate.",
    image,
    external_url: `${
      typeof window !== "undefined" ? window.location.origin : "https://repsolana.app"
    }/p/${profile.address}`,
    attributes: [
      { trait_type: "Score", value: profile.score.total },
      { trait_type: "Tier", value: tier },
      { trait_type: "Wallet Age (days)", value: Math.round(profile.stats.walletAgeDays) },
      { trait_type: "Total Txs", value: profile.stats.totalTxs },
      { trait_type: "Success Rate", value: `${(successRate * 100).toFixed(0)}%` },
      { trait_type: "DeFi Interactions", value: profile.stats.categoryCounts.defi },
      { trait_type: "Staking Actions", value: profile.stats.categoryCounts.staking },
      { trait_type: "NFT Interactions", value: profile.stats.categoryCounts.nft },
      { trait_type: "Unique Programs", value: profile.stats.uniqueProgramCount },
      { trait_type: "Soulbound", value: "true" },
      { trait_type: "Standard", value: "Bubblegum V2" },
      ...earnedBadges.map((b) => ({ trait_type: "Badge", value: b })),
    ],
    properties: {
      category: "image",
      creators: [{ address: profile.address, share: 100 }],
      files: [{ uri: image, type: "image/png" }],
    },
    repsolana: {
      version: "2.0",
      standard: "metaplex-bubblegum-v2-soulbound",
      address: profile.address,
      score: profile.score.total,
      tier,
      badges: earnedBadges,
      breakdown: profile.score.components.map((c) => ({
        label: c.label,
        value: c.value,
        max: c.max,
        detail: c.detail,
      })),
      activitySummary: {
        walletAgeDays: Math.round(profile.stats.walletAgeDays),
        totalTxs: profile.stats.totalTxs,
        successRate,
        defi: profile.stats.categoryCounts.defi,
        staking: profile.stats.categoryCounts.staking,
        nft: profile.stats.categoryCounts.nft,
        uniqueProgramCount: profile.stats.uniqueProgramCount,
        solBalance: profile.stats.solBalance,
      },
      issuedAt: Date.now(),
      soulbound: true,
      collectionMint: ctx.collectionMint,
      merkleTree: ctx.merkleTree,
    },
  };
}

/**
 * Upload metadata JSON to jsonblob.com using PUT with a client-generated
 * UUID so we know the final URL upfront — no response headers needed.
 *
 * Background: jsonblob.com's POST endpoint returns the blob URL via the
 * `Location` header, but that header is not CORS-exposed to browsers
 * (no `Access-Control-Expose-Headers: Location`), so `fetch()` always
 * returns null for it. PUT to a self-chosen UUID sidesteps this entirely.
 */
export async function uploadMetadataJSON(
  metadata: OnChainPassportMetadata,
): Promise<string> {
  try {
    const id = crypto.randomUUID();
    const url = `https://jsonblob.com/api/jsonBlob/${id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(metadata),
    });
    if (res.ok) {
      return url;
    }
    console.warn("jsonblob.com PUT failed with status:", res.status);
  } catch (err) {
    console.warn("jsonblob.com upload failed:", err);
  }

  // Fallback: external_url itself. Won't auto-render rich indexer
  // metadata but the on-chain mint succeeds and judges can read the
  // full claim from /p/<wallet> (we cache locally).
  return metadata.external_url.slice(0, 200);
}

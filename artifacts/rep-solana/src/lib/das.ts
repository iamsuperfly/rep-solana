/**
 * Helius DAS (Digital Asset Standard) lookups for the public Verify page.
 *
 * The Verify page lets ANYONE (no wallet connection required) confirm that
 * a wallet has minted a real on-chain RepSolana passport cNFT on devnet.
 *
 * We query Helius's `getAssetsByOwner` (DAS) endpoint, then filter the
 * response down to the RepSolana passport assets (matched by symbol +
 * collection name + the embedded `repsolana` metadata block).
 *
 * NOTE on RPC requirements:
 *   The vanilla `api.devnet.solana.com` endpoint does NOT implement the
 *   DAS extension methods. A Helius (or other DAS-capable) RPC URL is
 *   required. We honour the same env vars the rest of the app uses
 *   (`VITE_HELIUS_RPC_URL` or `VITE_HELIUS_API_KEY`); without those, the
 *   verify page degrades gracefully with a "configure DAS" CTA.
 */

import { getDevnetRpcUrl } from "./bubblegum";

export interface DasAssetCreator {
  address: string;
  share: number;
  verified?: boolean;
}

export interface DasAssetGrouping {
  group_key: string; // typically "collection"
  group_value: string;
}

export interface DasAssetCompression {
  eligible: boolean;
  compressed: boolean;
  data_hash: string;
  creator_hash: string;
  asset_hash: string;
  tree: string;            // merkle tree pubkey
  seq: number;
  leaf_id: number;
}

export interface DasAssetOwnership {
  frozen: boolean;
  delegated: boolean;
  delegate: string | null;
  ownership_model: string;
  owner: string;
}

export interface DasAssetContent {
  $schema?: string;
  json_uri: string;
  files?: { uri?: string; mime?: string }[];
  metadata?: {
    name?: string;
    symbol?: string;
    description?: string;
    attributes?: { trait_type: string; value: string | number }[];
    token_standard?: string;
  };
  links?: { image?: string; external_url?: string };
}

export interface DasAsset {
  interface: string;
  id: string;
  content: DasAssetContent;
  authorities: { address: string; scopes: string[] }[];
  compression: DasAssetCompression;
  grouping: DasAssetGrouping[];
  royalty?: unknown;
  creators: DasAssetCreator[];
  ownership: DasAssetOwnership;
  mutable: boolean;
  burnt: boolean;
}

export interface DasAssetsByOwnerResult {
  total: number;
  limit: number;
  page: number;
  items: DasAsset[];
}

interface DasResponse<T> {
  jsonrpc: "2.0";
  id: string;
  result?: T;
  error?: { code: number; message: string };
}

/** Ad-hoc DAS RPC URL override via URL query string (?heliusKey=...). */
function rpcUrlFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const usp = new URLSearchParams(window.location.search);
  const key = usp.get("heliusKey");
  if (key) return `https://devnet.helius-rpc.com/?api-key=${key}`;
  const url = usp.get("rpc");
  if (url) return url;
  return null;
}

/** True if we have a DAS-capable RPC configured. */
export function hasDasRpc(): boolean {
  if (rpcUrlFromQuery()) return true;
  const url = getDevnetRpcUrl();
  // Vanilla devnet does NOT implement DAS — only Helius / QuickNode / etc.
  return !/api\.devnet\.solana\.com/.test(url);
}

export function getDasRpcUrl(): string {
  return rpcUrlFromQuery() ?? getDevnetRpcUrl();
}

async function dasRpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(getDasRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `repsolana-${method}`,
      method,
      params,
    }),
  });
  if (!res.ok) {
    throw new Error(`DAS ${method} HTTP ${res.status}`);
  }
  const json = (await res.json()) as DasResponse<T>;
  if (json.error) {
    throw new Error(`DAS ${method} error: ${json.error.message}`);
  }
  if (!json.result) {
    throw new Error(`DAS ${method} returned no result`);
  }
  return json.result;
}

export async function getAssetsByOwner(
  owner: string,
  page = 1,
  limit = 100,
): Promise<DasAssetsByOwnerResult> {
  return dasRpc<DasAssetsByOwnerResult>("getAssetsByOwner", {
    ownerAddress: owner,
    page,
    limit,
    displayOptions: { showCollectionMetadata: true },
  });
}

export async function getAssetByMint(assetId: string): Promise<DasAsset> {
  return dasRpc<DasAsset>("getAsset", { id: assetId });
}

// ---------------------------------------------------------------------------
// RepSolana-specific filters
// ---------------------------------------------------------------------------

/** Heuristic: is this DAS asset a RepSolana passport cNFT? */
export function isRepSolanaPassport(asset: DasAsset): boolean {
  if (!asset?.content) return false;
  if (asset.burnt) return false;
  const meta = asset.content.metadata ?? {};
  const symbolMatches = (meta.symbol ?? "").toUpperCase() === "REPSOL";
  const nameMatches = /repsolana/i.test(meta.name ?? "") || /reputation passport/i.test(meta.name ?? "");
  return Boolean(asset.compression?.compressed) && (symbolMatches || nameMatches);
}

export interface VerifiedPassport {
  asset: DasAsset;
  /** The RepSolana off-chain metadata (fetched from `content.json_uri`). May be null if uri unreachable. */
  json: PassportJsonShape | null;
  /** Asset ID = the cNFT mint id (PDA). */
  assetId: string;
  /** Wallet that currently owns the asset. */
  owner: string;
  /** Bubblegum merkle tree pubkey (from `compression.tree`). */
  merkleTree: string;
  /** Core collection pubkey (from `grouping`). */
  collectionMint: string | null;
  /** Soulbound? True iff frozen by the collection's PermanentFreezeDelegate. */
  isFrozen: boolean;
  /** Always true here, but explicit. */
  isCompressed: boolean;
}

/** Off-chain JSON shape (matches `passport-metadata.ts`). */
export interface PassportJsonShape {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: { trait_type: string; value: string | number }[];
  repsolana?: {
    version?: string;
    standard?: string;
    address?: string;
    score?: number;
    tier?: string;
    badges?: string[];
    breakdown?: { label: string; value: number; max: number; detail?: string }[];
    activitySummary?: {
      walletAgeDays?: number;
      totalTxs?: number;
      successRate?: number;
      defi?: number;
      staking?: number;
      nft?: number;
      uniqueProgramCount?: number;
      solBalance?: number;
    };
    issuedAt?: number;
    soulbound?: boolean;
    collectionMint?: string;
    merkleTree?: string;
  };
}

/**
 * Extract the reputation score from an on-chain RepSolana passport.
 *
 * We layer the lookup so a partial outage of any one source still yields
 * the correct score — `0` is only returned when *every* source is missing
 * (which means the asset isn't really a RepSolana passport):
 *
 *   1. **On-chain `name` field** (most reliable). We bake the score into
 *      the cNFT name at mint time as `RepSolana Passport · {tier} · {n}`.
 *      The name is stored in the leaf hash and is therefore part of the
 *      cryptographic on-chain commitment — DAS can't miss it.
 *   2. Off-chain JSON's `repsolana.score` (canonical claim block).
 *   3. The on-chain `Score` attribute populated by the indexer when it
 *      successfully fetched the off-chain JSON.
 */
export function parseScoreFromAsset(
  asset: DasAsset,
  json: PassportJsonShape | null,
): number {
  // 1) Parse from the on-chain name.
  const name = asset.content?.metadata?.name ?? "";
  const trailing = name.match(/(\d+)\s*$/);
  if (trailing) {
    const n = parseInt(trailing[1], 10);
    if (Number.isFinite(n)) return n;
  }
  // 2) Off-chain JSON.
  if (typeof json?.repsolana?.score === "number") return json.repsolana.score;
  // 3) Indexer-populated attribute.
  const attr = asset.content?.metadata?.attributes?.find(
    (a) => a.trait_type === "Score",
  )?.value;
  if (typeof attr === "number" && Number.isFinite(attr)) return attr;
  if (typeof attr === "string" && /^\d+$/.test(attr)) return parseInt(attr, 10);
  return 0;
}

/**
 * Look up a wallet's RepSolana passport (if any) using Helius DAS.
 * Returns the most-recently-minted passport when multiple exist.
 */
export async function findRepSolanaPassportForWallet(
  walletAddress: string,
): Promise<VerifiedPassport | null> {
  const result = await getAssetsByOwner(walletAddress, 1, 100);
  const candidates = result.items.filter(isRepSolanaPassport);
  if (candidates.length === 0) return null;

  // Most-recently-minted = highest leaf_id within the same tree.
  candidates.sort((a, b) => (b.compression?.leaf_id ?? 0) - (a.compression?.leaf_id ?? 0));
  const asset = candidates[0];

  let json: PassportJsonShape | null = null;
  try {
    if (asset.content?.json_uri) {
      const r = await fetch(asset.content.json_uri, { method: "GET" });
      if (r.ok) json = (await r.json()) as PassportJsonShape;
    }
  } catch {
    json = null;
  }

  const collection = asset.grouping?.find((g) => g.group_key === "collection")?.group_value ?? null;

  return {
    asset,
    json,
    assetId: asset.id,
    owner: asset.ownership?.owner,
    merkleTree: asset.compression?.tree,
    collectionMint: collection,
    isFrozen: Boolean(asset.ownership?.frozen),
    isCompressed: Boolean(asset.compression?.compressed),
  };
}

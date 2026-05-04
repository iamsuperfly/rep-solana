import { getDevnetRpcUrl, OFFICIAL_COLLECTION_MINT } from "./bubblegum";

export interface DasAssetCreator { address: string; share: number; verified?: boolean; }
export interface DasAssetGrouping { group_key: string; group_value: string; }
export interface DasAssetCompression { eligible: boolean; compressed: boolean; data_hash: string; creator_hash: string; asset_hash: string; tree: string; seq: number; leaf_id: number; }
export interface DasAssetOwnership { frozen: boolean; delegated: boolean; delegate: string | null; ownership_model: string; owner: string; }
export interface DasAssetContent { $schema?: string; json_uri: string; files?: { uri?: string; mime?: string }[]; metadata?: { name?: string; symbol?: string; description?: string; attributes?: { trait_type: string; value: string | number }[]; token_standard?: string; }; links?: { image?: string; external_url?: string }; }
export interface DasAsset { interface: string; id: string; content: DasAssetContent; authorities: { address: string; scopes: string[] }[]; compression: DasAssetCompression; grouping: DasAssetGrouping[]; royalty?: unknown; creators: DasAssetCreator[]; ownership: DasAssetOwnership; mutable: boolean; burnt: boolean; }
export interface DasAssetsByOwnerResult { total: number; limit: number; page: number; items: DasAsset[]; }
interface DasResponse<T> { jsonrpc: "2.0"; id: string; result?: T; error?: { code: number; message: string }; }

function rpcUrlFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const usp = new URLSearchParams(window.location.search);
  const key = usp.get("heliusKey");
  if (key) return `https://devnet.helius-rpc.com/?api-key=${key}`;
  const url = usp.get("rpc");
  if (url) return url;
  return null;
}

export function hasDasRpc(): boolean {
  if (rpcUrlFromQuery()) return true;
  const url = getDevnetRpcUrl();
  return !/api\.devnet\.solana\.com/.test(url);
}

export function getDasRpcUrl(): string {
  return rpcUrlFromQuery() ?? getDevnetRpcUrl();
}

async function dasRpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(getDasRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `repsolana-${method}`, method, params }),
  });
  if (!res.ok) throw new Error(`DAS ${method} HTTP ${res.status}`);
  const json = (await res.json()) as DasResponse<T>;
  if (json.error) throw new Error(`DAS ${method} error: ${json.error.message}`);
  if (!json.result) throw new Error(`DAS ${method} returned no result`);
  return json.result;
}

export async function getAssetsByOwner(owner: string, page = 1, limit = 100): Promise<DasAssetsByOwnerResult> {
  return dasRpc<DasAssetsByOwnerResult>("getAssetsByOwner", { ownerAddress: owner, page, limit, displayOptions: { showCollectionMetadata: true } });
}

export async function getAssetByMint(assetId: string): Promise<DasAsset> {
  return dasRpc<DasAsset>("getAsset", { id: assetId });
}

export function isRepSolanaPassport(asset: DasAsset): boolean {
  if (!asset?.content) return false;
  if (asset.burnt) return false;
  const meta = asset.content.metadata ?? {};
  const symbolMatches = (meta.symbol ?? "").toUpperCase() === "REPSOL";
  const nameMatches = /repsolana/i.test(meta.name ?? "") || /reputation passport/i.test(meta.name ?? "");
  return Boolean(asset.compression?.compressed) && (symbolMatches || nameMatches);
}

export interface VerifiedPassport { asset: DasAsset; json: PassportJsonShape | null; assetId: string; owner: string; merkleTree: string; collectionMint: string | null; isFrozen: boolean; isCompressed: boolean; }
export interface PassportJsonShape { name?: string; symbol?: string; description?: string; image?: string; external_url?: string; attributes?: { trait_type: string; value: string | number }[]; repsolana?: { version?: string; standard?: string; address?: string; score?: number; tier?: string; badges?: string[]; breakdown?: { label: string; value: number; max: number; detail?: string }[]; activitySummary?: { walletAgeDays?: number; totalTxs?: number; successRate?: number; defi?: number; staking?: number; nft?: number; uniqueProgramCount?: number; solBalance?: number; }; issuedAt?: number; soulbound?: boolean; collectionMint?: string; merkleTree?: string; }; }

export function parseScoreFromAsset(asset: DasAsset, json: PassportJsonShape | null): number | null {
  const name = asset.content?.metadata?.name ?? "";
  const hashMatch = name.match(/#(\d+)\b/);
  if (hashMatch) { const n = parseInt(hashMatch[1], 10); if (Number.isFinite(n)) return n; }
  if (typeof json?.repsolana?.score === "number") return json.repsolana.score;
  const attr = asset.content?.metadata?.attributes?.find((a) => a.trait_type === "Score")?.value;
  if (typeof attr === "number" && Number.isFinite(attr)) return attr;
  if (typeof attr === "string" && /^\d+$/.test(attr)) return parseInt(attr, 10);
  const trailing = name.match(/(\d+)\s*$/);
  if (trailing) { const n = parseInt(trailing[1], 10); if (Number.isFinite(n)) return n; }
  return null;
}

// ---------------------------------------------------------------------------
// Live on-chain leaderboard — all passport holders in the official collection
// ---------------------------------------------------------------------------

export interface OnChainLeaderboardEntry {
  /** Leaf owner — the wallet that holds the passport. */
  address: string;
  score: number;
  /** Tier label parsed from the cNFT name ("Legendary", "Trusted", …). */
  tier: string;
  assetId: string;
}

/**
 * Fetch every passport in the official RepSolana collection via DAS
 * `getAssetsByGroup`, deduplicate by owner (keep highest score), and
 * return sorted descending by score.
 *
 * Requires a Helius (or equivalent DAS-capable) RPC endpoint.
 */
export async function getOnChainLeaderboard(): Promise<OnChainLeaderboardEntry[]> {
  const result = await dasRpc<DasAssetsByOwnerResult>("getAssetsByGroup", {
    groupKey: "collection",
    groupValue: OFFICIAL_COLLECTION_MINT,
    limit: 100,
    page: 1,
    sortBy: { sortBy: "created", sortDirection: "desc" },
  });

  const byOwner = new Map<string, OnChainLeaderboardEntry>();

  for (const asset of result.items) {
    if (asset.burnt) continue;
    const owner = asset.ownership?.owner;
    if (!owner) continue;

    const score = parseScoreFromAsset(asset, null);
    if (score === null) continue;

    // Parse tier from name: "RepSolana #100 · Legendary" → "Legendary"
    const name = asset.content?.metadata?.name ?? "";
    const tierMatch = name.split("·");
    const tier = tierMatch.length > 1 ? tierMatch[tierMatch.length - 1].trim() : "";

    const existing = byOwner.get(owner);
    if (!existing || score > existing.score) {
      byOwner.set(owner, { address: owner, score, tier, assetId: asset.id });
    }
  }

  return Array.from(byOwner.values()).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Per-wallet DAS passport lookup
// ---------------------------------------------------------------------------

export async function findAllRepSolanaPassports(walletAddress: string): Promise<VerifiedPassport[]> {
  const result = await getAssetsByOwner(walletAddress, 1, 100);
  const candidates = result.items.filter(isRepSolanaPassport);
  if (candidates.length === 0) return [];
  const verified: VerifiedPassport[] = [];
  for (const asset of candidates) {
    try {
      let json: PassportJsonShape | null = null;
      if (asset.content?.json_uri && /^https?:\/\//.test(asset.content.json_uri)) {
        const r = await fetch(asset.content.json_uri, { method: "GET", headers: { Accept: "application/json" } });
        const ct = r.headers.get("content-type") ?? "";
        if (r.ok && /json/i.test(ct)) json = (await r.json()) as PassportJsonShape;
      }
      const collection = asset.grouping?.find((g) => g.group_key === "collection")?.group_value ?? null;
      verified.push({ asset, json, assetId: asset.id, owner: asset.ownership?.owner, merkleTree: asset.compression?.tree, collectionMint: collection, isFrozen: Boolean(asset.ownership?.frozen), isCompressed: Boolean(asset.compression?.compressed) });
    } catch { /* skip */ }
  }
  verified.sort((a, b) => (b.asset.compression?.leaf_id ?? 0) - (a.asset.compression?.leaf_id ?? 0));
  return verified;
}

export async function findRepSolanaPassportForWallet(walletAddress: string, expected?: { collectionMint?: string; merkleTree?: string }): Promise<VerifiedPassport | null> {
  const result = await getAssetsByOwner(walletAddress, 1, 100);
  let candidates = result.items.filter(isRepSolanaPassport);
  if (candidates.length === 0) return null;

  if (expected?.collectionMint) {
    const filtered = candidates.filter((c) => c.grouping?.find((g) => g.group_key === "collection")?.group_value === expected.collectionMint);
    if (filtered.length > 0) candidates = filtered;
  }
  if (expected?.merkleTree) {
    const filtered = candidates.filter((c) => c.compression?.tree === expected.merkleTree);
    if (filtered.length > 0) candidates = filtered;
  }

  const withScore = candidates.filter((c) => parseScoreFromAsset(c, null) !== null);
  const pool = withScore.length > 0 ? withScore : candidates;
  pool.sort((a, b) => (b.compression?.leaf_id ?? 0) - (a.compression?.leaf_id ?? 0));
  const asset = pool[0];

  let json: PassportJsonShape | null = null;
  try {
    if (asset.content?.json_uri && /^https?:\/\//.test(asset.content.json_uri)) {
      const r = await fetch(asset.content.json_uri, { method: "GET", headers: { Accept: "application/json" } });
      const ct = r.headers.get("content-type") ?? "";
      if (r.ok && /json/i.test(ct)) json = (await r.json()) as PassportJsonShape;
    }
  } catch { json = null; }

  const collection = asset.grouping?.find((g) => g.group_key === "collection")?.group_value ?? null;
  return { asset, json, assetId: asset.id, owner: asset.ownership?.owner, merkleTree: asset.compression?.tree, collectionMint: collection, isFrozen: Boolean(asset.ownership?.frozen), isCompressed: Boolean(asset.compression?.compressed) };
}
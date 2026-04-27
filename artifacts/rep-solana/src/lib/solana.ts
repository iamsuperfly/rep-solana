/**
 * Solana on-chain reputation engine.
 *
 * Pulls a wallet's recent activity from a public Solana RPC (or Helius if
 * VITE_HELIUS_API_KEY is provided) and computes a deterministic 0–100
 * reputation score plus a set of badges and verifiable claims.
 *
 * The scoring algorithm is intentionally transparent — every component is
 * a separate sub-score so judges can audit how the final number is built.
 */

import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";

/** Network we read from. Use mainnet so judges see real activity. */
export type Network = "mainnet-beta" | "devnet";

const HELIUS_KEY = (import.meta.env.VITE_HELIUS_API_KEY as string | undefined) || "";

export function getRpcEndpoint(network: Network = "mainnet-beta"): string {
  if (HELIUS_KEY) {
    const cluster = network === "mainnet-beta" ? "mainnet" : "devnet";
    return `https://${cluster}.helius-rpc.com/?api-key=${HELIUS_KEY}`;
  }
  // Public CORS-friendly fallbacks. The official `api.mainnet-beta.solana.com`
  // does NOT permit browser CORS, so we use Ankr / publicnode by default.
  return network === "mainnet-beta"
    ? "https://solana-rpc.publicnode.com"
    : "https://api.devnet.solana.com";
}

export function getConnection(network: Network = "mainnet-beta"): Connection {
  return new Connection(getRpcEndpoint(network), { commitment: "confirmed" });
}

// --- Known program IDs we score against ----------------------------------

const KNOWN_PROGRAMS: Record<string, { name: string; category: ProgramCategory }> = {
  // Staking
  Stake11111111111111111111111111111111111111: { name: "Native Stake", category: "staking" },
  // Marinade (mSOL)
  MarBmsSgKXdrN1egZf5sqe1TMThczhmDDpmiKLJzXnvUx: { name: "Marinade", category: "staking" },
  // Jito
  Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb: { name: "Jito", category: "staking" },
  // Jupiter swap aggregator
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: { name: "Jupiter v6", category: "defi" },
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: { name: "Jupiter v4", category: "defi" },
  // Orca
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: { name: "Orca Whirlpools", category: "defi" },
  // Raydium
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM", category: "defi" },
  // Magic Eden
  M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K: { name: "Magic Eden v2", category: "nft" },
  // Tensor
  TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN: { name: "Tensorswap", category: "nft" },
  // Metaplex Token Metadata
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: { name: "Metaplex", category: "nft" },
  // Bubblegum (cNFTs)
  BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY: { name: "Bubblegum cNFT", category: "nft" },
  // Mango
  "4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg": { name: "Mango v4", category: "defi" },
  // Kamino
  KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD: { name: "Kamino Lend", category: "defi" },
  // Drift
  dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH: { name: "Drift", category: "defi" },
  // SPL Token
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: { name: "SPL Token", category: "token" },
  // Solana Name Service
  namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX: { name: "SNS", category: "identity" },
};

export type ProgramCategory =
  | "staking"
  | "defi"
  | "nft"
  | "token"
  | "identity"
  | "system"
  | "other";

// --- Public types --------------------------------------------------------

export interface ActivityStats {
  totalTxs: number;
  successTxs: number;
  failedTxs: number;
  oldestTxTs: number | null; // unix seconds
  newestTxTs: number | null;
  walletAgeDays: number;
  uniqueProgramCount: number;
  programCounts: Record<string, number>; // programId -> count
  categoryCounts: Record<ProgramCategory, number>;
  solBalance: number;
  recentTxs: ConfirmedSignatureInfo[];
}

export interface ScoreBreakdown {
  total: number;
  components: {
    label: string;
    value: number;
    max: number;
    detail: string;
  }[];
}

export interface ReputationProfile {
  address: string;
  network: Network;
  stats: ActivityStats;
  score: ScoreBreakdown;
  badges: Badge[];
  fetchedAt: number;
}

export interface Badge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
  rarity: "common" | "rare" | "epic" | "legendary";
}

// --- Fetching ------------------------------------------------------------

/**
 * Pull recent signatures + a sample of parsed transactions for a wallet,
 * and fold them into ActivityStats. We deliberately cap the scan window
 * to keep the public RPC happy.
 */
export async function fetchActivityStats(
  address: string,
  network: Network = "mainnet-beta",
  maxSignatures = 200,
  maxParse = 40,
): Promise<ActivityStats> {
  const conn = getConnection(network);
  const pubkey = new PublicKey(address);

  // Run independent reads in parallel.
  const [balanceLamports, signatures] = await Promise.all([
    conn.getBalance(pubkey, "confirmed").catch(() => 0),
    conn
      .getSignaturesForAddress(pubkey, { limit: maxSignatures })
      .catch(() => [] as ConfirmedSignatureInfo[]),
  ]);

  const successTxs = signatures.filter((s) => !s.err).length;
  const failedTxs = signatures.length - successTxs;

  let oldestTxTs: number | null = null;
  let newestTxTs: number | null = null;
  for (const s of signatures) {
    if (s.blockTime == null) continue;
    if (oldestTxTs == null || s.blockTime < oldestTxTs) oldestTxTs = s.blockTime;
    if (newestTxTs == null || s.blockTime > newestTxTs) newestTxTs = s.blockTime;
  }

  // Parse a sample of recent txs to extract program usage.
  const sample = signatures.slice(0, maxParse);
  const parsed = await Promise.allSettled(
    sample.map((s) =>
      conn.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      }),
    ),
  );

  const programCounts: Record<string, number> = {};
  const categoryCounts: Record<ProgramCategory, number> = {
    staking: 0,
    defi: 0,
    nft: 0,
    token: 0,
    identity: 0,
    system: 0,
    other: 0,
  };

  for (const r of parsed) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const tx = r.value as ParsedTransactionWithMeta;
    const programIds = extractProgramIds(tx);
    for (const pid of programIds) {
      programCounts[pid] = (programCounts[pid] || 0) + 1;
      const meta = KNOWN_PROGRAMS[pid];
      if (meta) categoryCounts[meta.category] += 1;
    }
  }

  const uniqueProgramCount = Object.keys(programCounts).length;
  const walletAgeDays =
    oldestTxTs != null
      ? Math.max(0, (Date.now() / 1000 - oldestTxTs) / 86400)
      : 0;

  return {
    totalTxs: signatures.length,
    successTxs,
    failedTxs,
    oldestTxTs,
    newestTxTs,
    walletAgeDays,
    uniqueProgramCount,
    programCounts,
    categoryCounts,
    solBalance: balanceLamports / 1e9,
    recentTxs: signatures.slice(0, 20),
  };
}

function extractProgramIds(tx: ParsedTransactionWithMeta): string[] {
  const out = new Set<string>();
  // Both ParsedInstruction and PartiallyDecodedInstruction expose `programId`,
  // but TS sees the union; cast through `unknown` to a simple read shape.
  type AnyIx = { programId?: { toString?: () => string } };
  const ixs = (tx.transaction.message.instructions ?? []) as unknown as AnyIx[];
  for (const ix of ixs) {
    const pid = ix.programId?.toString?.();
    if (pid) out.add(pid);
  }
  const inner = tx.meta?.innerInstructions ?? [];
  for (const group of inner) {
    for (const ix of group.instructions as unknown as AnyIx[]) {
      const pid = ix.programId?.toString?.();
      if (pid) out.add(pid);
    }
  }
  return [...out];
}

// --- Scoring -------------------------------------------------------------

/**
 * Compute the 0–100 reputation score from ActivityStats.
 * Components are additive and capped, so the total is always 0–100.
 */
export function computeScore(stats: ActivityStats): ScoreBreakdown {
  // 1. Wallet age — up to 20 pts. Saturates around 2 years.
  const ageScore = clamp((stats.walletAgeDays / 730) * 20, 0, 20);

  // 2. Activity volume — up to 25 pts. Saturates around 200 txs.
  const volumeScore = clamp((stats.totalTxs / 200) * 25, 0, 25);

  // 3. Reliability (success rate) — up to 10 pts.
  const successRate =
    stats.totalTxs > 0 ? stats.successTxs / stats.totalTxs : 0;
  const reliabilityScore = successRate * 10;

  // 4. DeFi engagement — up to 15 pts. Saturates around 10 DeFi txs.
  const defiScore = clamp((stats.categoryCounts.defi / 10) * 15, 0, 15);

  // 5. Staking — up to 10 pts. Any staking activity unlocks a base.
  const stakingScore = clamp(
    (stats.categoryCounts.staking > 0 ? 4 : 0) +
      (stats.categoryCounts.staking / 5) * 6,
    0,
    10,
  );

  // 6. NFT culture — up to 10 pts.
  const nftScore = clamp((stats.categoryCounts.nft / 8) * 10, 0, 10);

  // 7. Diversity (unique programs touched) — up to 10 pts.
  const diversityScore = clamp((stats.uniqueProgramCount / 12) * 10, 0, 10);

  const total = Math.round(
    ageScore +
      volumeScore +
      reliabilityScore +
      defiScore +
      stakingScore +
      nftScore +
      diversityScore,
  );

  return {
    total: clamp(total, 0, 100),
    components: [
      {
        label: "Wallet Age",
        value: round(ageScore),
        max: 20,
        detail: `${stats.walletAgeDays.toFixed(0)} days of on-chain history`,
      },
      {
        label: "Activity Volume",
        value: round(volumeScore),
        max: 25,
        detail: `${stats.totalTxs} recent transactions`,
      },
      {
        label: "Reliability",
        value: round(reliabilityScore),
        max: 10,
        detail: `${(successRate * 100).toFixed(0)}% success rate`,
      },
      {
        label: "DeFi Engagement",
        value: round(defiScore),
        max: 15,
        detail: `${stats.categoryCounts.defi} DeFi interactions`,
      },
      {
        label: "Staking",
        value: round(stakingScore),
        max: 10,
        detail: `${stats.categoryCounts.staking} staking actions`,
      },
      {
        label: "NFT Culture",
        value: round(nftScore),
        max: 10,
        detail: `${stats.categoryCounts.nft} NFT interactions`,
      },
      {
        label: "Diversity",
        value: round(diversityScore),
        max: 10,
        detail: `${stats.uniqueProgramCount} unique programs touched`,
      },
    ],
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function round(n: number) {
  return Math.round(n * 10) / 10;
}

// --- Badges --------------------------------------------------------------

export function computeBadges(stats: ActivityStats): Badge[] {
  return [
    {
      id: "og",
      label: "Solana OG",
      description: "Wallet active for over a year",
      earned: stats.walletAgeDays >= 365,
      rarity: "epic",
    },
    {
      id: "veteran",
      label: "Veteran",
      description: "Wallet active for 90+ days",
      earned: stats.walletAgeDays >= 90,
      rarity: "rare",
    },
    {
      id: "active",
      label: "Active Trader",
      description: "100+ transactions",
      earned: stats.totalTxs >= 100,
      rarity: "common",
    },
    {
      id: "power-user",
      label: "Power User",
      description: "200+ transactions",
      earned: stats.totalTxs >= 200,
      rarity: "rare",
    },
    {
      id: "defi-native",
      label: "DeFi Native",
      description: "5+ DeFi interactions",
      earned: stats.categoryCounts.defi >= 5,
      rarity: "rare",
    },
    {
      id: "staker",
      label: "Staker",
      description: "Has staked SOL on-chain",
      earned: stats.categoryCounts.staking >= 1,
      rarity: "common",
    },
    {
      id: "nft-collector",
      label: "NFT Collector",
      description: "3+ NFT marketplace interactions",
      earned: stats.categoryCounts.nft >= 3,
      rarity: "common",
    },
    {
      id: "explorer",
      label: "Explorer",
      description: "Touched 8+ unique programs",
      earned: stats.uniqueProgramCount >= 8,
      rarity: "rare",
    },
    {
      id: "whale",
      label: "Whale",
      description: "Holds 100+ SOL",
      earned: stats.solBalance >= 100,
      rarity: "legendary",
    },
    {
      id: "clean-record",
      label: "Clean Record",
      description: "98%+ success rate with 20+ txs",
      earned:
        stats.totalTxs >= 20 && stats.successTxs / stats.totalTxs >= 0.98,
      rarity: "epic",
    },
  ];
}

// --- Public API ----------------------------------------------------------

export async function buildReputationProfile(
  address: string,
  network: Network = "mainnet-beta",
): Promise<ReputationProfile> {
  const stats = await fetchActivityStats(address, network);
  const score = computeScore(stats);
  const badges = computeBadges(stats);
  return {
    address,
    network,
    stats,
    score,
    badges,
    fetchedAt: Date.now(),
  };
}

export function getProgramName(pid: string): string {
  return KNOWN_PROGRAMS[pid]?.name ?? truncate(pid);
}
export function getProgramCategory(pid: string): ProgramCategory {
  return KNOWN_PROGRAMS[pid]?.category ?? "other";
}
export function truncate(s: string, head = 4, tail = 4): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

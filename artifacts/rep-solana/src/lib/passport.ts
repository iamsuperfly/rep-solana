/**
 * Passport persistence + "minting".
 *
 * Real production: this would call Metaplex Bubblegum's mintToCollectionV1
 * against a Merkle tree owned by the RepSolana mint authority, producing a
 * compressed soulbound NFT (`isMutable: false`, no transfer authority).
 *
 * For the hackathon demo we:
 *   1. Build a fully Metaplex-compatible metadata JSON (score + badges +
 *      claims) — exactly what would be uploaded to Arweave.
 *   2. Ask the user's wallet to sign that metadata as proof of intent
 *      (real wallet pop-up, real signature stored with the passport).
 *   3. Store the resulting "passport" in localStorage so the profile page
 *      and dashboard reflect a minted state.
 *
 * Swapping this out for real on-chain mints is a single file change.
 */

import bs58 from "bs58";
import type { ReputationProfile } from "./solana";

export interface PassportMetadata {
  // Metaplex / cNFT standard fields
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  attributes: { trait_type: string; value: string | number }[];
  properties: {
    category: string;
    creators: { address: string; share: number }[];
    files: { uri: string; type: string }[];
  };
  // RepSolana-specific verifiable claims
  repsolana: {
    version: "1.0";
    address: string;
    score: number;
    badges: string[];
    breakdown: { label: string; value: number; max: number }[];
    issuedAt: number;
    soulbound: true;
  };
}

export interface MintedPassport {
  id: string;                    // deterministic passport ID
  address: string;               // owner wallet
  network: "mainnet-beta" | "devnet";
  metadata: PassportMetadata;
  signatureBase58: string;       // proof-of-intent signature from owner
  mintedAt: number;
  privacy: "public" | "private";
  endorsements: Endorsement[];
}

export interface Endorsement {
  from: string;
  amountSol: number;
  txSignature: string;
  message?: string;
  ts: number;
}

const STORAGE_KEY = "repsolana:passports:v1";

function readStore(): Record<string, MintedPassport> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MintedPassport>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, MintedPassport>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  // Notify listeners in the same tab.
  window.dispatchEvent(new CustomEvent("repsolana:passport-changed"));
}

export function getPassport(address: string): MintedPassport | null {
  return readStore()[address] ?? null;
}

export function listPassports(): MintedPassport[] {
  return Object.values(readStore()).sort((a, b) => b.mintedAt - a.mintedAt);
}

export function buildMetadata(profile: ReputationProfile): PassportMetadata {
  const earnedBadges = profile.badges.filter((b) => b.earned).map((b) => b.label);
  return {
    name: `RepSolana Passport — ${profile.address.slice(0, 4)}…${profile.address.slice(-4)}`,
    symbol: "REPSOL",
    description:
      "Soulbound, compressed reputation passport on Solana. Score and badges " +
      "are derived from on-chain activity at mint time and updated via " +
      "RepSolana refresh proofs.",
    image: passportImageDataUri(profile),
    external_url: `${typeof window !== "undefined" ? window.location.origin : ""}/p/${profile.address}`,
    attributes: [
      { trait_type: "Score", value: profile.score.total },
      { trait_type: "Wallet Age (days)", value: Math.round(profile.stats.walletAgeDays) },
      { trait_type: "Total Txs", value: profile.stats.totalTxs },
      { trait_type: "DeFi Interactions", value: profile.stats.categoryCounts.defi },
      { trait_type: "Staking Actions", value: profile.stats.categoryCounts.staking },
      { trait_type: "NFT Interactions", value: profile.stats.categoryCounts.nft },
      { trait_type: "Unique Programs", value: profile.stats.uniqueProgramCount },
      ...earnedBadges.map((b) => ({ trait_type: "Badge", value: b })),
    ],
    properties: {
      category: "image",
      creators: [{ address: profile.address, share: 100 }],
      files: [{ uri: passportImageDataUri(profile), type: "image/svg+xml" }],
    },
    repsolana: {
      version: "1.0",
      address: profile.address,
      score: profile.score.total,
      badges: earnedBadges,
      breakdown: profile.score.components.map((c) => ({
        label: c.label,
        value: c.value,
        max: c.max,
      })),
      issuedAt: Date.now(),
      soulbound: true,
    },
  };
}

/**
 * Mints (or upgrades) the passport for the connected wallet.
 *
 * @param signMessage  Wallet signMessage callback. We sign the canonical
 *                     metadata so the stored passport carries an owner
 *                     proof — verifiable later off-chain by anyone.
 */
export async function mintPassport(
  profile: ReputationProfile,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<MintedPassport> {
  const metadata = buildMetadata(profile);
  const canonical = new TextEncoder().encode(
    JSON.stringify({
      address: metadata.repsolana.address,
      score: metadata.repsolana.score,
      badges: metadata.repsolana.badges,
      issuedAt: metadata.repsolana.issuedAt,
    }),
  );
  const sig = await signMessage(canonical);
  const passport: MintedPassport = {
    id: `repsol_${profile.address.slice(0, 8)}_${metadata.repsolana.issuedAt}`,
    address: profile.address,
    network: profile.network,
    metadata,
    signatureBase58: bs58.encode(sig),
    mintedAt: Date.now(),
    privacy: "public",
    endorsements: getPassport(profile.address)?.endorsements ?? [],
  };
  const store = readStore();
  store[profile.address] = passport;
  writeStore(store);
  return passport;
}

export function setPrivacy(address: string, privacy: "public" | "private") {
  const store = readStore();
  const p = store[address];
  if (!p) return;
  p.privacy = privacy;
  store[address] = p;
  writeStore(store);
}

export function addEndorsement(address: string, e: Endorsement) {
  const store = readStore();
  const p = store[address];
  if (!p) return;
  p.endorsements = [e, ...p.endorsements].slice(0, 50);
  store[address] = p;
  writeStore(store);
}

/**
 * Build an inline SVG passport "card" used as the cNFT image.
 * Self-contained so the metadata is portable.
 */
export function passportImageDataUri(profile: ReputationProfile): string {
  const score = profile.score.total;
  const short = `${profile.address.slice(0, 4)}…${profile.address.slice(-4)}`;
  const badges = profile.badges.filter((b) => b.earned).slice(0, 3).map((b) => b.label).join(" · ");
  const tier = scoreTier(score);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0717"/><stop offset="1" stop-color="#180a32"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9945FF"/><stop offset=".5" stop-color="#19C2FF"/><stop offset="1" stop-color="#14F195"/>
    </linearGradient>
  </defs>
  <rect width="600" height="380" rx="22" fill="url(#bg)"/>
  <rect x="1" y="1" width="598" height="378" rx="21" fill="none" stroke="url(#ring)" stroke-width="2"/>
  <text x="32" y="50" fill="#A492C9" font-family="Inter, sans-serif" font-size="13" letter-spacing="3">REPSOLANA · PASSPORT</text>
  <text x="32" y="86" fill="#fff" font-family="Inter, sans-serif" font-weight="700" font-size="28">${tier.label}</text>
  <text x="32" y="112" fill="#9CA3AF" font-family="JetBrains Mono, monospace" font-size="13">${short}</text>
  <g transform="translate(380,40)">
    <circle cx="90" cy="90" r="80" fill="none" stroke="#1f1535" stroke-width="14"/>
    <circle cx="90" cy="90" r="80" fill="none" stroke="url(#ring)" stroke-width="14"
      stroke-dasharray="${(score / 100) * 502} 502" stroke-linecap="round"
      transform="rotate(-90 90 90)"/>
    <text x="90" y="95" text-anchor="middle" fill="#fff" font-family="Inter, sans-serif" font-weight="800" font-size="42">${score}</text>
    <text x="90" y="120" text-anchor="middle" fill="#9CA3AF" font-family="Inter, sans-serif" font-size="11">/ 100</text>
  </g>
  <text x="32" y="300" fill="#A492C9" font-family="Inter, sans-serif" font-size="12" letter-spacing="2">EARNED BADGES</text>
  <text x="32" y="326" fill="#fff" font-family="Inter, sans-serif" font-size="15">${escapeXml(badges) || "Building reputation…"}</text>
  <text x="32" y="356" fill="#6b6488" font-family="JetBrains Mono, monospace" font-size="10">SOULBOUND · COMPRESSED · cNFT</text>
</svg>`.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

export function scoreTier(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: "Legendary", tone: "from-fuchsia-400 to-amber-300" };
  if (score >= 70) return { label: "Trusted", tone: "from-purple-400 to-cyan-300" };
  if (score >= 50) return { label: "Active", tone: "from-cyan-400 to-emerald-300" };
  if (score >= 30) return { label: "Emerging", tone: "from-emerald-400 to-teal-300" };
  return { label: "New", tone: "from-slate-400 to-slate-300" };
}

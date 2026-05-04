/**
 * Mint button — fully on-chain driven.
 *
 * Source of truth for "does this wallet have a passport?" and "what is its
 * score?" is the Solana DAS indexer (Helius), NOT browser localStorage.
 * localStorage is only used as a write-through cache so the rest of the
 * app (profile page, dashboard) renders without an extra round-trip.
 *
 * UX states (in order):
 *   1. DAS round-trip in flight  → "Checking on-chain…" (disabled).
 *   2. No passport on chain      → "Mint Soulbound Passport cNFT".
 *   3. Passport on chain, score ≈ live score (|delta| ≤ UPDATE_THRESHOLD)
 *      → disabled "Passport up to date · score N".
 *   4. Passport on chain, score has drifted
 *      → "Update Passport to latest score".
 *
 * All mints go into the single official RepSolana collection + Merkle tree.
 * The one-time "Setup Soulbound Collection" step is no longer needed for
 * end users — the collection is already live on devnet.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getPassport,
  persistRealMintedPassport,
  type MintedPassport,
} from "@/lib/passport";
import {
  mintRealPassport,
  getDevnetConfig,
  explorerTx,
  type DevnetCollectionConfig,
} from "@/lib/bubblegum";
import {
  findRepSolanaPassportForWallet,
  hasDasRpc,
  parseScoreFromAsset,
  type VerifiedPassport,
} from "@/lib/das";
import type { ReputationProfile } from "@/lib/solana";
import {
  CheckCircle2,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

/** Re-mint only when the live score drifts more than this many points. */
const UPDATE_THRESHOLD = 5;

/**
 * sessionStorage cache for the per-wallet DAS lookup. We hit Helius the
 * first time the user visits in a session, then short-cache the answer so
 * tab-switching, route changes and Dashboard re-mounts don't re-spinner.
 */
const DAS_CACHE_KEY = "repsolana:das-cache:v1";
const DAS_CACHE_TTL_MS = 60_000;

interface DasCacheEntry {
  hasPassport: boolean;
  score: number | null;
  assetId: string | null;
  fetchedAt: number;
}

function readDasCache(address: string): DasCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DAS_CACHE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, DasCacheEntry>;
    const entry = store[address];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > DAS_CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeDasCache(address: string, entry: DasCacheEntry) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(DAS_CACHE_KEY);
    const store = (raw ? JSON.parse(raw) : {}) as Record<string, DasCacheEntry>;
    store[address] = entry;
    window.sessionStorage.setItem(DAS_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* sessionStorage may be unavailable (private browsing); UI still works */
  }
}

/**
 * Persist a synthetic devnet config from a chain-discovered passport so
 * downstream UI (e.g. DevnetSetupCard) shows the collection + tree
 * addresses without requiring the user to re-run setup.
 */
function persistConfigFromChain(address: string, found: VerifiedPassport) {
  if (!found.merkleTree) return;
  if (getDevnetConfig(address)) return;
  const cfgFromChain: DevnetCollectionConfig = {
    owner: address,
    collectionMint: found.collectionMint ?? "",
    merkleTree: found.merkleTree,
    createdAt: Date.now(),
  };
  const KEY = "repsolana:devnet-config:v1";
  try {
    const raw = window.localStorage.getItem(KEY);
    const store = raw ? JSON.parse(raw) : {};
    store[address] = cfgFromChain;
    window.localStorage.setItem(KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("repsolana:devnet-config-changed"));
  } catch {
    /* ignore — DAS still drives the UI even if the cache write fails */
  }
}

export function MintPassportButton({
  profile,
  size = "lg",
  liveLoading = false,
}: {
  profile: ReputationProfile;
  size?: "default" | "lg";
  /**
   * True while the parent's reputation hook is still resolving the live
   * profile. We MUST avoid showing "Update Passport" during this window —
   * the live score reads as 0 → we'd compare it against the on-chain
   * score and flag a phantom delta that confuses the user.
   */
  liveLoading?: boolean;
}) {
  const wallet = useWallet();
  const { toast } = useToast();
  const dasAvailable = hasDasRpc();
  const [, navigate] = useLocation();

  // ── Local-cache state (fallback when no DAS) ──────────────────────────
  const [existing, setExisting] = useState<MintedPassport | null>(() =>
    getPassport(profile.address),
  );

  // ── Authoritative on-chain state (source of truth when DAS is up) ─────
  const cachedDas = readDasCache(profile.address);
  const [chainScore, setChainScore] = useState<number | null>(
    cachedDas?.score ?? null,
  );
  const [chainHasPassport, setChainHasPassport] = useState<boolean | null>(
    cachedDas?.hasPassport ?? null,
  );
  const [chainAssetId, setChainAssetId] = useState<string | null>(
    cachedDas?.assetId ?? null,
  );
  const [hydrating, setHydrating] = useState(dasAvailable && !cachedDas);

  // ── Action state ──────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);

  // Listen for in-app store changes (e.g. post-mint update).
  useEffect(() => {
    function refresh() {
      setExisting(getPassport(profile.address));
    }
    refresh();
    window.addEventListener("repsolana:passport-changed", refresh);
    return () => {
      window.removeEventListener("repsolana:passport-changed", refresh);
    };
  }, [profile.address]);

  // ── On-chain hydration ─────────────────────────────────────────────────
  async function hydrateFromChain(
    silent = false,
    preferAssetId?: string,
  ): Promise<void> {
    if (!dasAvailable) {
      setHydrating(false);
      return;
    }
    if (!silent) setHydrating(true);
    try {
      const cfg = getDevnetConfig(profile.address);
      const found = await findRepSolanaPassportForWallet(profile.address, {
        collectionMint: cfg.collectionMint,
        merkleTree: cfg.merkleTree,
      });
      if (!found) {
        if (preferAssetId) return;
        setChainHasPassport(false);
        setChainScore(null);
        setChainAssetId(null);
        writeDasCache(profile.address, {
          hasPassport: false,
          score: null,
          assetId: null,
          fetchedAt: Date.now(),
        });
        return;
      }
      if (preferAssetId && found.assetId !== preferAssetId) return;
      const score = parseScoreFromAsset(found.asset, found.json);
      setChainHasPassport(true);
      setChainScore(score);
      setChainAssetId(found.assetId);
      writeDasCache(profile.address, {
        hasPassport: true,
        score,
        assetId: found.assetId,
        fetchedAt: Date.now(),
      });
      persistConfigFromChain(profile.address, found);
      const cached = getPassport(profile.address);
      const scoreForCache =
        score ?? cached?.metadata.repsolana.score ?? profile.score.total;
      persistRealMintedPassport(
        { ...profile, score: { ...profile.score, total: scoreForCache } },
        {
          assetId: found.assetId,
          mintSignature: cached?.cnft?.mintSignature ?? "",
          metadataUri: found.asset.content?.json_uri ?? "",
          collectionMint: found.collectionMint ?? "",
          merkleTree: found.merkleTree ?? "",
          network: "devnet",
          standard: "metaplex-bubblegum-v2",
        },
        { preserveTimestamps: true },
      );
    } catch {
      // DAS errors are non-fatal — fall back to local cache.
    } finally {
      setHydrating(false);
    }
  }

  useEffect(() => {
    void hydrateFromChain(Boolean(cachedDas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.address, dasAvailable]);

  async function handleMint() {
    if (!wallet.connected || !wallet.publicKey) {
      toast({ title: "Connect a wallet first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await mintRealPassport(wallet, profile);
      persistRealMintedPassport(profile, {
        assetId: result.assetId,
        mintSignature: result.mintSignature,
        freezeSignature: result.freezeSignature,
        metadataUri: result.metadataUri,
        collectionMint: result.collectionMint,
        merkleTree: result.merkleTree,
        network: "devnet",
        standard: "metaplex-bubblegum-v2",
      });
      setChainHasPassport(true);
      setChainScore(profile.score.total);
      toast({
        title: chainHasPassport
          ? "Passport updated on-chain"
          : "Soulbound passport minted!",
        description: `Asset ${result.assetId.slice(0, 6)}… · view on Explorer`,
        action: (
          <a
            href={explorerTx(result.mintSignature, "devnet")}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-primary"
          >
            Explorer
          </a>
        ) as any,
      });
      const tryAssetId = result.assetId;
      [6_000, 15_000, 30_000].forEach((ms) =>
        window.setTimeout(() => {
          void hydrateFromChain(true, tryAssetId);
        }, ms),
      );
      navigate(`/p/${profile.address}`);
    } catch (err) {
      const e = err as Error;
      toast({
        title: "Mint failed",
        description: e.message ?? "User rejected the transaction.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // 1) Hydrating
  if (dasAvailable && hydrating) {
    return (
      <Button
        size={size}
        disabled
        variant="outline"
        className="border-secondary/30 text-muted-foreground font-semibold gap-2 w-full"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Checking on-chain for existing passport…
      </Button>
    );
  }

  // ── Decide "do they have a passport?" ──────────────────────────────────
  const hasPassport =
    chainHasPassport === true ||
    (chainHasPassport === null && Boolean(existing?.cnft));

  // 2) No passport on chain → mint directly into the official collection.
  if (!hasPassport) {
    return (
      <Button
        size={size}
        onClick={handleMint}
        disabled={!wallet.connected || busy}
        className="bg-gradient-solana text-white border-0 hover:opacity-90 font-semibold gap-2 shadow-xl glow-purple w-full"
      >
        {busy ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Sparkles className="w-5 h-5" />
        )}
        {busy ? "Minting on-chain…" : "Mint Soulbound Passport cNFT"}
        {!busy && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/30 ml-1">
            <ShieldCheck className="w-3 h-3" /> devnet
          </span>
        )}
      </Button>
    );
  }

  // 3) Legacy v2 passport — score unrecoverable, offer migrate.
  if (chainScore === null && chainHasPassport === true) {
    return (
      <div className="space-y-2 w-full">
        <Button
          size={size}
          onClick={handleMint}
          disabled={!wallet.connected || busy || liveLoading}
          className="bg-gradient-solana text-white border-0 hover:opacity-90 font-semibold gap-2 shadow-xl glow-purple w-full"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <RefreshCcw className="w-5 h-5" />
          )}
          {busy
            ? "Migrating on-chain…"
            : liveLoading
              ? "Loading live score…"
              : "Migrate Passport (record score on-chain)"}
          {!busy && !liveLoading && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/30 ml-1">
              <ShieldCheck className="w-3 h-3" /> devnet
            </span>
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Your existing passport was minted in the v2 format — Solana's
          32-byte name limit silently dropped the score field. Re-mint once
          to upgrade to v3 (`RepSolana #N · Tier`) so the score is part of
          the on-chain commitment.
        </p>
      </div>
    );
  }

  // 4/5) Passport on chain — compare on-chain score vs live score.
  const onChainScore =
    chainScore ?? existing?.metadata.repsolana.score ?? 0;
  const liveScore = profile.score.total;
  const delta = liveScore - onChainScore;
  const absDelta = Math.abs(delta);
  const needsUpdate = !liveLoading && absDelta > UPDATE_THRESHOLD;

  if (!needsUpdate) {
    const storedUri = existing?.cnft?.metadataUri ?? '';
    const hasBrokenUri = Boolean(storedUri) && !storedUri.includes('/api/meta');

    return (
      <div className="space-y-2 w-full">
        <Button
          size={size}
          disabled
          variant="outline"
          className="border-secondary/40 text-secondary font-semibold gap-2 w-full cursor-default opacity-90"
        >
          <CheckCircle2 className="w-5 h-5" />
          {liveLoading
            ? `Passport on-chain · score ${onChainScore}`
            : `Passport up to date · score ${onChainScore}`}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          {liveLoading ? (
            <>Loading live score to compare against on-chain value…</>
          ) : (
            <>
              Live score is {liveScore} — only {absDelta} pts off-chain. We
              re-mint when the gap is more than {UPDATE_THRESHOLD} pts to
              avoid unnecessary mints.
            </>
          )}
        </p>

        {hasBrokenUri && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
            <p className="text-[11px] text-amber-400 font-semibold">
              Image not showing in Phantom / Backpack?
            </p>
            <p className="text-[11px] text-muted-foreground">
              Your passport was minted before a metadata fix — the old URI
              points at the app&apos;s HTML page instead of JSON, so wallets
              show a blank image. Re-mint once (tiny SOL fee) to bake the
              correct <span className="font-mono">/api/meta</span> URL into
              the cNFT leaf.
            </p>
            <Button
              size="sm"
              onClick={handleMint}
              disabled={!wallet.connected || busy}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2 w-full"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCcw className="w-4 h-4" />
              )}
              {busy ? 'Re-minting…' : 'Re-mint to fix wallet image'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 w-full">
      <Button
        size={size}
        onClick={handleMint}
        disabled={!wallet.connected || busy}
        className="bg-gradient-solana text-white border-0 hover:opacity-90 font-semibold gap-2 shadow-xl glow-purple w-full"
      >
        {busy ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <RefreshCcw className="w-5 h-5" />
        )}
        {busy ? "Minting on-chain…" : "Update Passport to latest score"}
        {!busy && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/30 ml-1">
            <ShieldCheck className="w-3 h-3" /> devnet
          </span>
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        On-chain score: <strong>{onChainScore}</strong> · Live score:{" "}
        <strong>{liveScore}</strong> · {delta > 0 ? "+" : ""}{delta} pts since
        last mint.
      </p>
    </div>
  );
}

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
 *   2. No passport on chain, no devnet config locally
 *      → "Setup Soulbound Collection (devnet)" — one-time init.
 *   3. No passport on chain, devnet config exists
 *      → "Mint Soulbound Passport cNFT".
 *   4. Passport on chain, on-chain score ≈ live score
 *      (|delta| ≤ UPDATE_THRESHOLD)
 *      → disabled "Passport up to date · score N".
 *   5. Passport on chain, on-chain score has drifted from live score
 *      → "Update Passport to latest score".
 *
 * Scope of "on-chain":
 *   The on-chain score is derived from the cNFT's `name` field (which is
 *   stored in the leaf hash and therefore part of the on-chain
 *   commitment), with the off-chain JSON's `repsolana.score` and the
 *   indexer-populated `Score` attribute as fallbacks. See
 *   `parseScoreFromAsset` in `lib/das.ts`.
 *
 * Fallback when no DAS RPC is configured:
 *   We degrade to the previous localStorage-only flow so the app still
 *   works on plain devnet RPC (e.g. preview without a Helius key).
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
  initializeDevnetCollection,
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
  Wrench,
} from "lucide-react";
import { useLocation } from "wouter";

/** Re-mint only when the live score drifts more than this many points. */
const UPDATE_THRESHOLD = 5;

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
}: {
  profile: ReputationProfile;
  size?: "default" | "lg";
}) {
  const wallet = useWallet();
  const { toast } = useToast();
  const dasAvailable = hasDasRpc();
  const [, navigate] = useLocation();

  // ── Local-cache state (still used as a fallback when no DAS) ──────────
  const [cfg, setCfg] = useState<DevnetCollectionConfig | null>(() =>
    getDevnetConfig(profile.address),
  );
  const [existing, setExisting] = useState<MintedPassport | null>(() =>
    getPassport(profile.address),
  );

  // ── Authoritative on-chain state (source of truth when DAS is up) ─────
  const [chainScore, setChainScore] = useState<number | null>(null);
  const [chainHasPassport, setChainHasPassport] = useState<boolean | null>(
    null,
  ); // null = unknown / loading
  const [hydrating, setHydrating] = useState(dasAvailable);

  // ── Action state ──────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);

  // Listen for in-app store changes (e.g. setup card or post-mint update).
  useEffect(() => {
    function refresh() {
      setCfg(getDevnetConfig(profile.address));
      setExisting(getPassport(profile.address));
    }
    refresh();
    window.addEventListener("repsolana:devnet-config-changed", refresh);
    window.addEventListener("repsolana:passport-changed", refresh);
    return () => {
      window.removeEventListener("repsolana:devnet-config-changed", refresh);
      window.removeEventListener("repsolana:passport-changed", refresh);
    };
  }, [profile.address]);

  // ── On-chain hydration: this is the source of truth ────────────────────
  // Runs whenever the connected wallet changes. We DON'T re-run on every
  // live-score recompute because that would hammer DAS unnecessarily — the
  // chain score only changes when the user mints/updates.
  async function hydrateFromChain(): Promise<void> {
    if (!dasAvailable) {
      setHydrating(false);
      return;
    }
    setHydrating(true);
    try {
      const found = await findRepSolanaPassportForWallet(profile.address);
      if (!found) {
        setChainHasPassport(false);
        setChainScore(null);
        return;
      }
      const score = parseScoreFromAsset(found.asset, found.json);
      setChainHasPassport(true);
      setChainScore(score);
      // Mirror to localStorage so the profile page renders fully offline.
      persistConfigFromChain(profile.address, found);
      persistRealMintedPassport(
        { ...profile, score: { ...profile.score, total: score } },
        {
          assetId: found.assetId,
          mintSignature: existing?.cnft?.mintSignature ?? "",
          metadataUri: found.asset.content?.json_uri ?? "",
          collectionMint: found.collectionMint ?? "",
          merkleTree: found.merkleTree ?? "",
          network: "devnet",
          standard: "metaplex-bubblegum-v2",
        },
      );
    } catch {
      // DAS errors are non-fatal — fall back to local cache for this render.
      setChainHasPassport(null);
    } finally {
      setHydrating(false);
    }
  }

  useEffect(() => {
    void hydrateFromChain();
    // We intentionally only re-run when the wallet changes, not on every
    // profile recompute — to avoid hammering DAS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.address, dasAvailable]);

  async function handleInit() {
    if (!wallet.connected || !wallet.publicKey) {
      toast({ title: "Connect a wallet first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await initializeDevnetCollection(wallet);
      toast({
        title: "Soulbound collection ready",
        description: `Collection ${res.collectionMint.slice(0, 6)}…  ·  Tree ${res.merkleTree.slice(0, 6)}…`,
      });
    } catch (err) {
      const e = err as Error;
      toast({
        title: "Setup failed",
        description: e.message ?? "Try claiming devnet SOL and retry.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

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
      // Optimistically reflect the new on-chain state — we just minted
      // with the live score, so chain == live until DAS re-indexes.
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
      // Re-query DAS in the background to pick up the freshly-minted asset
      // (gives us the canonical leaf id / asset id from chain).
      window.setTimeout(() => {
        void hydrateFromChain();
      }, 6000);
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

  // 1) Hydrating — only show when DAS will tell us something authoritative.
  //    Without a DAS RPC we'd block on a request that never resolves, so we
  //    skip this state entirely in that case.
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
  // Prefer DAS truth; fall back to localStorage when DAS isn't configured
  // (or transiently failed and returned `null`).
  const hasPassport =
    chainHasPassport === true ||
    (chainHasPassport === null && Boolean(existing?.cnft));

  // 2/3) No passport on chain → setup or mint flow.
  if (!hasPassport) {
    if (!cfg) {
      return (
        <Button
          size={size}
          onClick={handleInit}
          disabled={!wallet.connected || busy}
          className="bg-gradient-solana text-white border-0 hover:opacity-90 font-semibold gap-2 shadow-xl glow-purple w-full"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Wrench className="w-5 h-5" />
          )}
          {busy ? "Setting up…" : "Setup Soulbound Collection (devnet)"}
        </Button>
      );
    }
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

  // 4/5) Passport on chain — compare on-chain score vs live score.
  // Prefer the chain-derived score; fall back to the local cache only when
  // DAS isn't available at all.
  const onChainScore =
    chainScore ?? existing?.metadata.repsolana.score ?? 0;
  const liveScore = profile.score.total;
  const delta = liveScore - onChainScore;
  const absDelta = Math.abs(delta);
  const needsUpdate = absDelta > UPDATE_THRESHOLD;

  if (!needsUpdate) {
    return (
      <div className="space-y-2 w-full">
        <Button
          size={size}
          disabled
          variant="outline"
          className="border-secondary/40 text-secondary font-semibold gap-2 w-full cursor-default opacity-90"
        >
          <CheckCircle2 className="w-5 h-5" />
          Passport up to date · score {onChainScore}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Live score is {liveScore} — only {absDelta} pts off-chain. We
          re-mint when the gap is more than {UPDATE_THRESHOLD} pts to avoid
          unnecessary mints.
        </p>
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
        <strong>{liveScore}</strong> ·{" "}
        <span
          className={
            delta > 0
              ? "text-secondary font-semibold"
              : "text-destructive font-semibold"
          }
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>{" "}
        pts drift — re-mint to refresh.
      </p>
    </div>
  );
}

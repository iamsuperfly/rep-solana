/**
 * Mint button — wired to the real on-chain Bubblegum V2 cNFT flow.
 *
 * UX states (in order):
 *   1. No devnet collection yet
 *      → "Setup Soulbound Collection (devnet)" — one-time init.
 *   2. Collection ready, no passport for this wallet yet
 *      → "Mint Soulbound Passport cNFT".
 *   3. Collection + passport already minted, on-chain score ≈ live score
 *      (|delta| ≤ UPDATE_THRESHOLD)
 *      → disabled "Passport up to date" pill — prevents needless re-mints.
 *   4. Collection + passport already minted, on-chain score has drifted
 *      from the live score by more than UPDATE_THRESHOLD points
 *      → "Update Passport to latest score" — re-mints a fresh cNFT
 *        with the new score, badges and activity summary.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getPassport, persistRealMintedPassport } from "@/lib/passport";
import {
  initializeDevnetCollection,
  mintRealPassport,
  getDevnetConfig,
  explorerTx,
  type DevnetCollectionConfig,
} from "@/lib/bubblegum";
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

export function MintPassportButton({
  profile,
  size = "lg",
}: {
  profile: ReputationProfile;
  size?: "default" | "lg";
}) {
  const wallet = useWallet();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();

  const [cfg, setCfg] = useState<DevnetCollectionConfig | null>(() =>
    getDevnetConfig(profile.address),
  );
  const [existing, setExisting] = useState(() => getPassport(profile.address));

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
      toast({
        title: existing?.cnft
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

  // 1) No collection yet → setup flow.
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

  // 2) Already minted? Decide between "up to date" and "update".
  const cnftRecord = existing?.cnft;
  if (cnftRecord) {
    const onChainScore = existing.metadata.repsolana.score;
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
              delta > 0 ? "text-secondary font-semibold" : "text-destructive font-semibold"
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

  // 3) Fresh wallet, collection ready → first mint.
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

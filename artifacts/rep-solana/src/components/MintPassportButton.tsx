/**
 * Mint button — now wired to the real on-chain Bubblegum V2 cNFT flow.
 *
 * UX:
 *  - If the user has not yet initialised their devnet collection + tree,
 *    we show "Setup Soulbound Collection (devnet)" as a one-time step.
 *  - After init, the button becomes "Mint Passport cNFT" → calls real
 *    Bubblegum V2 mintV2 + setNonTransferableV2.
 *  - Mint result is persisted in localStorage with the cNFT asset id and
 *    a deep link to Solana Explorer (devnet).
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
import { Loader2, Sparkles, RefreshCcw, ShieldCheck, Wrench } from "lucide-react";
import { useLocation } from "wouter";

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
  const existing = getPassport(profile.address);
  const [cfg, setCfg] = useState<DevnetCollectionConfig | null>(() =>
    getDevnetConfig(profile.address),
  );

  useEffect(() => {
    function refresh() {
      setCfg(getDevnetConfig(profile.address));
    }
    refresh();
    window.addEventListener("repsolana:devnet-config-changed", refresh);
    return () =>
      window.removeEventListener("repsolana:devnet-config-changed", refresh);
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
        description: e.message ?? "Try airdropping devnet SOL and retry.",
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
        title: existing?.cnft ? "Passport re-minted on-chain" : "Soulbound passport minted!",
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

  const hasCnft = !!existing?.cnft;
  return (
    <Button
      size={size}
      onClick={handleMint}
      disabled={!wallet.connected || busy}
      className="bg-gradient-solana text-white border-0 hover:opacity-90 font-semibold gap-2 shadow-xl glow-purple w-full"
    >
      {busy ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : hasCnft ? (
        <RefreshCcw className="w-5 h-5" />
      ) : (
        <Sparkles className="w-5 h-5" />
      )}
      {busy
        ? "Minting on-chain…"
        : hasCnft
          ? "Re-mint Passport cNFT"
          : "Mint Soulbound Passport cNFT"}
      {!busy && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/30 ml-1">
          <ShieldCheck className="w-3 h-3" /> devnet
        </span>
      )}
    </Button>
  );
}

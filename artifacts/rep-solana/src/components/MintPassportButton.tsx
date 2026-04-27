/**
 * One-click "Mint Passport" button. Asks the wallet to sign the canonical
 * passport metadata so the resulting passport carries a verifiable owner
 * proof. See lib/passport.ts for the demo-vs-mainnet swap discussion.
 */
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { mintPassport, getPassport } from "@/lib/passport";
import type { ReputationProfile } from "@/lib/solana";
import { Loader2, Sparkles, RefreshCcw } from "lucide-react";
import { useLocation } from "wouter";

export function MintPassportButton({
  profile,
  size = "lg",
}: {
  profile: ReputationProfile;
  size?: "default" | "lg";
}) {
  const { signMessage, connected } = useWallet();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();
  const existing = getPassport(profile.address);

  async function handleMint() {
    if (!signMessage) {
      toast({
        title: "Wallet doesn't support message signing",
        description: "Try Phantom or Solflare.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const passport = await mintPassport(profile, signMessage);
      toast({
        title: existing ? "Passport refreshed!" : "Passport minted!",
        description: `Score ${passport.metadata.repsolana.score}/100 — soulbound to your wallet.`,
      });
      navigate(`/p/${profile.address}`);
    } catch (err) {
      const e = err as Error;
      toast({
        title: "Mint failed",
        description: e.message ?? "User rejected the signature.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size={size}
      onClick={handleMint}
      disabled={!connected || busy}
      className="bg-gradient-solana text-white border-0 hover:opacity-90 font-semibold gap-2 shadow-xl glow-purple"
    >
      {busy ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : existing ? (
        <RefreshCcw className="w-5 h-5" />
      ) : (
        <Sparkles className="w-5 h-5" />
      )}
      {busy
        ? "Minting…"
        : existing
          ? "Refresh Passport"
          : "Mint Passport"}
    </Button>
  );
}

/**
 * Devnet status panel — shows the official RepSolana collection +
 * merkle tree, devnet SOL balance, and a one-click airdrop helper so
 * judges can fund a fresh wallet without leaving the page.
 *
 * The collection and Merkle tree are now the single official addresses
 * shared by all users — no per-wallet initialization needed.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getDevnetConfig,
  getDevnetBalance,
  explorerAddress,
  OFFICIAL_COLLECTION_MINT,
  OFFICIAL_MERKLE_TREE,
} from "@/lib/bubblegum";
import { Coins, ExternalLink, RefreshCcw, ShieldCheck } from "lucide-react";
import { shortAddress } from "@/lib/format";

export function DevnetSetupCard({ address }: { address: string }) {
  const cfg = getDevnetConfig(address);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBal, setLoadingBal] = useState(false);

  async function refreshBalance() {
    setLoadingBal(true);
    try {
      const bal = await getDevnetBalance(address);
      setBalance(bal);
    } catch {
      setBalance(null);
    } finally {
      setLoadingBal(false);
    }
  }

  useEffect(() => {
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <Card className="border-secondary/30 bg-secondary/5">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-secondary" />
          Devnet on-chain mint
          <span className="text-[10px] font-mono uppercase tracking-wider text-secondary/80 border border-secondary/40 rounded-full px-2 py-0.5">
            Bubblegum V2
          </span>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshBalance}
          disabled={loadingBal}
          className="gap-1.5 text-xs"
        >
          <RefreshCcw className={`w-3 h-3 ${loadingBal ? "animate-spin" : ""}`} />
          {balance != null ? `${balance.toFixed(3)} SOL` : "—"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1.5 text-xs">
          <Field
            label="Core collection"
            value={cfg.collectionMint}
            href={explorerAddress(cfg.collectionMint, "devnet")}
          />
          <Field
            label="Merkle tree"
            value={cfg.merkleTree}
            href={explorerAddress(cfg.merkleTree, "devnet")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
          >
            <a
              href="https://faucet.solana.com"
              target="_blank"
              rel="noreferrer noopener"
            >
              <Coins className="w-3 h-3" />
              Claim devnet SOL (opens faucet)
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs hover:text-secondary inline-flex items-center gap-1"
      >
        {shortAddress(value, 6, 6)}
        <ExternalLink className="w-3 h-3 opacity-60" />
      </a>
    </div>
  );
}

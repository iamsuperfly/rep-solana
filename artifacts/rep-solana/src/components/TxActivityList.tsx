import type { ConfirmedSignatureInfo } from "@solana/web3.js";
import { Card } from "@/components/ui/card";
import { ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { shortAddress, timeAgo } from "@/lib/format";

export function TxActivityList({
  txs,
  network,
}: {
  txs: ConfirmedSignatureInfo[];
  network: "mainnet-beta" | "devnet";
}) {
  if (txs.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        No on-chain activity found yet.
      </Card>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="max-h-[360px] overflow-y-auto scrollbar-thin divide-y divide-border/40">
        {txs.map((tx) => {
          const ok = !tx.err;
          const url = `https://solscan.io/tx/${tx.signature}${
            network === "devnet" ? "?cluster=devnet" : ""
          }`;
          return (
            <a
              key={tx.signature}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors group"
            >
              {ok ? (
                <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs truncate">
                  {shortAddress(tx.signature, 10, 10)}
                </div>
                {tx.memo && (
                  <div className="text-xs text-muted-foreground truncate">{tx.memo}</div>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {timeAgo(tx.blockTime)}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

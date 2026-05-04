import { useWallet } from "@solana/wallet-adapter-react";
import { useReputation } from "@/hooks/use-reputation";
import { usePassport } from "@/hooks/use-passport";
import { useOnChainLeaderboard } from "@/hooks/use-leaderboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/ScoreGauge";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { BadgeGrid } from "@/components/BadgeGrid";
import { TxActivityList } from "@/components/TxActivityList";
import { CollateralDemo } from "@/components/CollateralDemo";
import { MintPassportButton } from "@/components/MintPassportButton";
import { DevnetSetupCard } from "@/components/DevnetSetupCard";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { explorerTx, solscanAsset } from "@/lib/bubblegum";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setPrivacy } from "@/lib/passport";
import {
  RefreshCcw, AlertCircle, Wallet, Eye, EyeOff,
  Share2, ExternalLink, Loader2, Radio,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const { data, loading, error, refresh } = useReputation(address, "mainnet-beta");
  const passport = usePassport(address);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const {
    entries: leaderboard,
    loading: boardLoading,
    isOnChain,
    reload: reloadBoard,
  } = useOnChainLeaderboard();

  if (!connected || !address) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <Wallet className="w-12 h-12 mx-auto text-muted-foreground" />
        <h1 className="mt-6 text-2xl font-bold">Connect a wallet to view your reputation</h1>
        <p className="mt-2 text-muted-foreground">
          We'll read your on-chain history straight from RPC. Nothing leaves your wallet.
        </p>
        <div className="mt-8 flex justify-center">
          <WalletConnectButton size="lg" />
        </div>
      </div>
    );
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      toast({ title: "Score refreshed from chain" });
    } finally {
      setRefreshing(false);
    }
  }

  function copyShare() {
    if (!address) return;
    const url = `${window.location.origin}/p/${address}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Share link copied", description: url });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Your reputation</div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading} className="gap-2">
            <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={copyShare} className="gap-2">
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <div className="font-semibold text-sm text-destructive">Couldn't reach RPC</div>
              <div className="text-xs text-muted-foreground mt-0.5">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[420px] rounded-2xl lg:col-span-1" />
          <Skeleton className="h-[420px] rounded-2xl lg:col-span-2" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Score column */}
            <Card className="border-gradient-solana lg:col-span-1 overflow-hidden">
              <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center">
                <ScoreGauge score={data.score.total} />
                <div className="mt-6 w-full">
                  <MintPassportButton profile={data} liveLoading={loading} />
                </div>
                {passport?.cnft && (
                  <div className="mt-4 w-full text-left rounded-lg border border-secondary/30 bg-secondary/5 p-3 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-secondary font-mono">
                      Soulbound cNFT live on devnet
                    </div>
                    <a href={solscanAsset(passport.cnft.assetId, "devnet")} target="_blank" rel="noreferrer"
                      className="block text-xs font-mono break-all text-foreground hover:text-secondary">
                      {passport.cnft.assetId}
                    </a>
                    <a href={explorerTx(passport.cnft.mintSignature, "devnet")} target="_blank" rel="noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                      View mint tx <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                {passport && (
                  <Link href={`/p/${address}`}
                    className="mt-3 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    View public passport <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Stats + breakdown */}
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="SOL Balance" value={data.stats.solBalance.toFixed(2)} />
                <StatCard label="Wallet Age" value={`${Math.round(data.stats.walletAgeDays)}d`} />
                <StatCard label="Total Txs" value={data.stats.totalTxs.toString()} />
                <StatCard label="Success Rate" value={data.stats.totalTxs > 0 ? `${((data.stats.successTxs / data.stats.totalTxs) * 100).toFixed(0)}%` : "—"} />
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base">Score breakdown</CardTitle></CardHeader>
                <CardContent><ScoreBreakdown breakdown={data.score} /></CardContent>
              </Card>
            </div>
          </div>

          {/* Badges */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Badges</CardTitle>
              <span className="text-xs text-muted-foreground">
                {data.badges.filter((b) => b.earned).length} of {data.badges.length} earned
              </span>
            </CardHeader>
            <CardContent><BadgeGrid badges={data.badges} /></CardContent>
          </Card>

          {/* ── On-chain leaderboard ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                Leaderboard
                {isOnChain && (
                  <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-secondary border border-secondary/40 rounded-full px-2 py-0.5">
                    <Radio className="w-2.5 h-2.5" />live on-chain
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {isOnChain ? "All passport holders in the official collection" : "Ranked by score"}
                </span>
                <Button variant="ghost" size="sm" onClick={reloadBoard} disabled={boardLoading}
                  className="h-7 w-7 p-0" title="Refresh leaderboard">
                  <RefreshCcw className={`w-3 h-3 ${boardLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {boardLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Fetching on-chain passports…
                </div>
              ) : !isOnChain ? (
                <div className="py-8 text-center text-sm text-muted-foreground space-y-1">
                  <p>Live leaderboard requires a Helius RPC endpoint.</p>
                  <p className="text-xs">Set <code className="font-mono">VITE_HELIUS_API_KEY</code> to enable.</p>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No passports minted yet — be the first!
                </div>
              ) : (
                leaderboard.slice(0, 10).map((entry, index) => {
                  const isYou = entry.address === address;
                  return (
                    <div key={entry.address}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${isYou ? "border-secondary/50 bg-secondary/5" : "border-border/60"}`}>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          <span className="text-muted-foreground tabular-nums w-6">#{index + 1}</span>
                          {isYou ? (
                            <span className="text-secondary font-semibold">You</span>
                          ) : (
                            <span className="font-mono">{entry.address.slice(0, 4)}…{entry.address.slice(-4)}</span>
                          )}
                          {entry.tier && (
                            <span className="text-[10px] text-muted-foreground border border-border/60 rounded-full px-1.5 py-0.5">
                              {entry.tier}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground pl-8">Score {entry.score}</div>
                      </div>
                      <Link href={`/p/${entry.address}`} className="text-xs text-secondary hover:underline shrink-0">
                        View profile
                      </Link>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Devnet on-chain mint config */}
          <DevnetSetupCard address={address} />

          {/* Activity + collateral */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Recent on-chain activity</CardTitle></CardHeader>
              <CardContent><TxActivityList txs={data.stats.recentTxs} network={data.network} /></CardContent>
            </Card>
            <CollateralDemo score={data.score.total} />
          </div>

          {/* Privacy */}
          <Card>
            <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                {passport?.privacy === "private" ? (
                  <EyeOff className="w-5 h-5 text-muted-foreground mt-0.5" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground mt-0.5" />
                )}
                <div>
                  <div className="font-medium text-sm">Public passport profile</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    When off, your /p/&lt;wallet&gt; page only shows tier and badges — never raw txs or balance.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="priv" className="text-xs text-muted-foreground">
                  {passport?.privacy === "private" ? "Private" : "Public"}
                </Label>
                <Switch id="priv" checked={passport?.privacy !== "private"} disabled={!passport}
                  onCheckedChange={(v) => { if (!address || !passport) return; setPrivacy(address, v ? "public" : "private"); }} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
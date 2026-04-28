/**
 * Public, wallet-connection-free verification page.
 *
 * URL:  /verify           → empty search box
 *       /verify/:address  → auto-runs the lookup
 *
 * Anyone can paste a wallet address and independently confirm:
 *   • The wallet has a RepSolana cNFT in our Core collection on devnet
 *   • The cNFT is compressed (Bubblegum V2) AND soulbound (frozen)
 *   • The on-chain score / tier / badges / breakdown
 *   • Direct deep-links to Solana Explorer + Solscan for the asset,
 *     merkle tree and Core collection so the verifier never has to
 *     trust our UI.
 *
 * No wallet connection required. All data is fetched live via the
 * Helius DAS API (`getAssetsByOwner`) — see lib/das.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { PublicKey } from "@solana/web3.js";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge as UIBadge } from "@/components/ui/badge";
import { ShareOnX } from "@/components/ShareOnX";
import { ScoreGauge } from "@/components/ScoreGauge";

import { explorerAddress, explorerTx, solscanAsset } from "@/lib/bubblegum";
import {
  findRepSolanaPassportForWallet,
  getDasRpcUrl,
  hasDasRpc,
  type VerifiedPassport,
} from "@/lib/das";
import { shortAddress } from "@/lib/format";

function isValidAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

export function VerifyPage() {
  const [, params] = useRoute("/verify/:address");
  const [, navigate] = useLocation();
  const initialAddress = params?.address ?? "";

  const [input, setInput] = useState(initialAddress);
  const [target, setTarget] = useState<string | null>(
    initialAddress && isValidAddress(initialAddress) ? initialAddress : null,
  );
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VerifiedPassport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Run the lookup whenever `target` changes.
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    findRepSolanaPassportForWallet(target)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        if (!res) {
          setError(
            "No RepSolana passport cNFT found for this wallet on devnet. " +
              "If you just minted it, give the indexer ~10 seconds.",
          );
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const msg = err?.message ?? "Verification failed";
        // Friendly hints for the common failure mode.
        if (/method not found|getAssetsByOwner/i.test(msg)) {
          setError(
            "The configured RPC does not implement the DAS API. " +
              "Set VITE_HELIUS_API_KEY (or pass ?heliusKey=… in the URL) and retry.",
          );
        } else if (/HTTP 401|unauthorized/i.test(msg)) {
          setError("RPC rejected the request (auth). Check your Helius key.");
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!isValidAddress(trimmed)) {
      setError("That doesn't look like a valid Solana wallet address.");
      return;
    }
    setError(null);
    setTarget(trimmed);
    navigate(`/verify/${trimmed}`);
  }

  const dasReady = hasDasRpc();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="gap-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </Button>
        <UIBadge variant="outline" className="text-[10px] uppercase font-mono">
          Public verification · devnet
        </UIBadge>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5" /> Independent verifier
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Verify a{" "}
          <span className="bg-gradient-to-r from-primary via-cyan-400 to-secondary bg-clip-text text-transparent">
            RepSolana passport
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste any Solana wallet address and we'll re-fetch their soulbound
          reputation passport directly from the Solana DAS indexer — no wallet
          connection required, no trust in our UI.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Search form                                                        */}
      {/* ------------------------------------------------------------------ */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Solana wallet address (e.g. 4Nd1mY…vXp9)"
              className="pl-9 font-mono text-sm h-11"
              data-testid="input-verify-address"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            disabled={!input.trim()}
            className="h-11 gap-2 bg-gradient-solana text-white border-0"
            data-testid="button-verify-submit"
          >
            Verify
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </form>

      {!dasReady && (
        <Card className="border-amber-500/40 bg-amber-500/5 max-w-2xl mx-auto">
          <CardContent className="py-4 text-sm flex gap-3 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-amber-400">
                DAS-capable RPC not configured
              </div>
              <p className="text-muted-foreground text-xs mt-1">
                Verification calls <code className="font-mono">getAssetsByOwner</code> which the
                public devnet RPC doesn't implement. Set{" "}
                <code className="font-mono">VITE_HELIUS_API_KEY</code> in your env, or append{" "}
                <code className="font-mono">?heliusKey=YOUR_KEY</code> to the URL for a one-off
                check.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Result                                                             */}
      {/* ------------------------------------------------------------------ */}
      {loading && (
        <div className="space-y-4 max-w-3xl mx-auto">
          <Skeleton className="h-[260px] rounded-2xl" />
          <Skeleton className="h-[180px] rounded-2xl" />
        </div>
      )}

      {error && !loading && (
        <Card className="border-destructive/40 bg-destructive/5 max-w-2xl mx-auto">
          <CardContent className="py-4 text-sm text-destructive flex gap-3 items-start">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {!loading && data && target && <VerifyResult data={data} wallet={target} />}

      {!target && !loading && (
        <div className="text-center text-xs text-muted-foreground max-w-md mx-auto pt-2">
          We query the Solana DAS API ({getDasRpcUrl().replace(/\?api-key=.*/, "?api-key=…")}) and
          show only assets whose on-chain symbol is <code className="font-mono">REPSOL</code>{" "}
          and whose collection is the RepSolana Core collection.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panel
// ---------------------------------------------------------------------------

function VerifyResult({
  data,
  wallet,
}: {
  data: VerifiedPassport;
  wallet: string;
}) {
  const meta = data.asset.content?.metadata;
  const json = data.json?.repsolana;

  const score = useMemo(() => {
    if (typeof json?.score === "number") return json.score;
    const attr = meta?.attributes?.find((a) => a.trait_type === "Score");
    return attr ? Number(attr.value) : null;
  }, [json, meta]);

  const tier =
    json?.tier ??
    (meta?.attributes?.find((a) => a.trait_type === "Tier")?.value as string | undefined) ??
    "Unknown";

  const badges = json?.badges ??
    (meta?.attributes
      ?.filter((a) => a.trait_type === "Badge")
      .map((a) => String(a.value)) ?? []);

  const breakdown = json?.breakdown ?? [];
  const activity = json?.activitySummary;

  const isMatchingOwner = data.owner === wallet;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 max-w-3xl mx-auto"
    >
      {/* Hero */}
      <Card className="border-secondary/40 bg-gradient-to-br from-secondary/5 to-primary/5 overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6 items-center">
            {score != null && <ScoreGauge score={score} size={170} />}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border border-secondary/40 bg-secondary/10 text-secondary mb-3">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified on-chain
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {tier} · {meta?.name ?? "RepSolana Passport"}
              </h2>
              <p className="font-mono text-xs text-muted-foreground mt-1 break-all">
                Owner: {shortAddress(data.owner, 8, 8)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 items-center justify-center sm:justify-start">
                <GuaranteePill icon={<Snowflake className="w-3 h-3" />} label="Soulbound" ok={data.isFrozen} />
                <GuaranteePill icon={<Sparkles className="w-3 h-3" />} label="Compressed (Bubblegum V2)" ok={data.isCompressed} />
                <GuaranteePill icon={<Lock className="w-3 h-3" />} label="Owner match" ok={isMatchingOwner} />
              </div>
              <div className="mt-5 flex items-center gap-2 justify-center sm:justify-start">
                <ShareOnX
                  address={wallet}
                  score={score ?? undefined}
                  tier={tier}
                  badges={badges}
                  shareKind="verify"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badges */}
      {badges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Earned badges</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b}
                  className="text-xs font-medium px-2.5 py-1 rounded-full border border-secondary/40 bg-secondary/10 text-secondary"
                >
                  {b}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score breakdown */}
      {breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score breakdown (from on-chain metadata)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {breakdown.map((c) => (
              <div key={c.label}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{c.label}</span>
                  <span className="font-mono text-muted-foreground">
                    {c.value} / {c.max}
                  </span>
                </div>
                <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-solana"
                    style={{ width: `${Math.min(100, (c.value / Math.max(1, c.max)) * 100)}%` }}
                  />
                </div>
                {c.detail && (
                  <p className="text-[11px] text-muted-foreground mt-1">{c.detail}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Activity summary */}
      {activity && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity at mint time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="Wallet age" value={`${activity.walletAgeDays ?? 0}d`} />
              <Stat label="Total txs" value={String(activity.totalTxs ?? 0)} />
              <Stat
                label="Success rate"
                value={`${Math.round((activity.successRate ?? 0) * 100)}%`}
              />
              <Stat label="Unique programs" value={String(activity.uniqueProgramCount ?? 0)} />
              <Stat label="DeFi" value={String(activity.defi ?? 0)} />
              <Stat label="Staking" value={String(activity.staking ?? 0)} />
              <Stat label="NFT" value={String(activity.nft ?? 0)} />
              <Stat
                label="SOL balance"
                value={`${(activity.solBalance ?? 0).toFixed(2)}`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* On-chain proof links */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-secondary" />
            On-chain proof
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ProofRow
            label="cNFT asset"
            value={data.assetId}
            href={solscanAsset(data.assetId, "devnet")}
          />
          <ProofRow
            label="Merkle tree"
            value={data.merkleTree}
            href={explorerAddress(data.merkleTree, "devnet")}
          />
          {data.collectionMint && (
            <ProofRow
              label="Core collection"
              value={data.collectionMint}
              href={explorerAddress(data.collectionMint, "devnet")}
            />
          )}
          {data.asset.content?.json_uri && (
            <ProofRow
              label="Off-chain metadata"
              value={data.asset.content.json_uri}
              href={data.asset.content.json_uri}
            />
          )}
          {data.asset.compression?.asset_hash && (
            <ProofRow
              label="Asset hash"
              value={data.asset.compression.asset_hash}
              href={explorerTx(data.asset.compression.asset_hash, "devnet")}
            />
          )}
          <p className="text-[11px] text-muted-foreground pt-2">
            "Soulbound" is enforced by the collection-level{" "}
            <code className="font-mono">PermanentFreezeDelegate</code> plugin on
            the Core collection above. Any attempt to transfer this cNFT will
            revert at the program level.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function GuaranteePill({
  icon,
  label,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border",
        ok
          ? "border-secondary/40 bg-secondary/10 text-secondary"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      ].join(" ")}
    >
      {icon}
      {label}
    </span>
  );
}

function ProofRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm py-1 items-start">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="col-span-2 font-mono text-xs break-all hover:text-secondary inline-flex items-start gap-1"
      >
        <span className="break-all">{value}</span>
        <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
      </a>
    </div>
  );
}

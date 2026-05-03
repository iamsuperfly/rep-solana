/**
 * Public, shareable passport profile page.
 * URL: /p/<wallet-address>
 */
import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useReputation } from "@/hooks/use-reputation";
import { usePassport } from "@/hooks/use-passport";
import { PassportCard } from "@/components/PassportCard";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { BadgeGrid } from "@/components/BadgeGrid";
import { EndorseDialog } from "@/components/EndorseDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { shortAddress, timeAgo } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  Share2,
  Copy,
  Check,
  Heart,
  ExternalLink,
  ShieldAlert,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { ShareOnX } from "@/components/ShareOnX";
import { scoreTier, getEndorsementView } from "@/lib/passport";
import { getLeaderboardEntries } from "@/lib/passport";
import { explorerTx, explorerAddress, solscanAsset } from "@/lib/bubblegum";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

export function PassportProfilePage() {
  const [, params] = useRoute("/p/:address");
  const [, navigate] = useLocation();
  const address = params?.address ?? null;
  const { toast } = useToast();
  const { publicKey } = useWallet();

  const validAddress = useValidatedAddress(address);
  const { data, loading, error } = useReputation(validAddress, "mainnet-beta");
  const passport = usePassport(validAddress);
  const [copied, setCopied] = useState(false);

  if (!address || !validAddress) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="w-10 h-10 mx-auto text-destructive" />
        <h1 className="mt-4 text-xl font-bold">Invalid wallet address</h1>
        <p className="mt-2 text-sm text-muted-foreground">{address}</p>
        <Button variant="outline" className="mt-6 gap-2" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4" /> Back home
        </Button>
      </div>
    );
  }

  function copyShare() {
    if (!validAddress) return;
    navigator.clipboard.writeText(`${window.location.origin}/p/${validAddress}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: "Share link copied" });
  }

  const isPrivate = passport?.privacy === "private";
  const isOwner = publicKey?.toBase58() === validAddress;
  const earnedBadgeLabels =
    data?.badges.filter((b) => b.earned).map((b) => b.label) ?? [];
  const tierLabel = data ? scoreTier(data.score.total).label : undefined;
  const leaderboard = getLeaderboardEntries();
  const currentRank = leaderboard.findIndex((entry) => entry.address === validAddress) + 1;
  const endorsementView = getEndorsementView(validAddress);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Home
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <ShareOnX
            address={validAddress}
            score={data?.score.total}
            tier={tierLabel}
            badges={earnedBadgeLabels}
            shareKind="passport"
            variant="outline"
          />
          <Button variant="outline" size="sm" onClick={copyShare} className="gap-2">
            {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a
            href={`https://solscan.io/account/${validAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-3.5 h-3.5" />
              Solscan
            </Button>
          </a>
          {!isOwner && passport && (
            <EndorseDialog recipientAddress={validAddress} network={passport.network} />
          )}
        </div>
      </div>

      {loading && !data && <Skeleton className="h-[400px] rounded-2xl" />}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && (
        <>
          <PassportCard profile={data} minted={!!passport} />

          {!passport && (
            <Card className="border-dashed">
              <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">No passport minted yet</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      This wallet has activity but hasn't claimed a soulbound passport.
                    </div>
                  </div>
                </div>
                {isOwner && (
                  <Button
                    onClick={() => navigate("/dashboard")}
                    className="bg-gradient-solana text-white border-0 gap-2"
                  >
                    Mint your passport
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentRank > 0 && (
                <div className="text-xs text-muted-foreground">
                  Current rank: #{currentRank} of {leaderboard.length}
                </div>
              )}
              {leaderboard.length === 0 ? (
                <div className="text-sm text-muted-foreground">No passports minted yet.</div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.slice(0, 10).map((entry, index) => (
                    <div
                      key={entry.address}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
                    >
                      <div>
                        <div className="font-medium text-sm">
                          #{index + 1} {shortAddress(entry.address, 6, 6)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Score {entry.score} · Endorsements {entry.endorsementCount} · Weight{" "}
                          {entry.endorsementWeight.toFixed(2)}
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a href={`/p/${entry.address}`}>View</a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isPrivate && !isOwner ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                <ShieldAlert className="w-6 h-6 mx-auto mb-2" />
                This passport is private. Only the tier and earned badges are public.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Score breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScoreBreakdown breakdown={data.score} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Who Endorsed Me</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {endorsementView.received.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        <Heart className="w-6 h-6 mx-auto mb-2 opacity-40" />
                        No endorsements yet.
                        {!isOwner && " Be the first."}
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {endorsementView.received.map((e) => (
                          <li
                            key={e.txSignature}
                            className="flex items-start gap-3 text-sm border-b border-border/40 last:border-0 pb-3 last:pb-0"
                          >
                            <Heart className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link href={`/p/${e.from}`} className="font-mono text-xs hover:underline">
                                  {shortAddress(e.from)}
                                </Link>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-secondary font-semibold">
                                  +{e.amountSol} SOL
                                </span>
                                {e.fromScore !== undefined && (
                                  <>
                                    <span className="text-xs text-muted-foreground">·</span>
                                    <span className="text-xs text-primary font-semibold">
                                      Endorser score: {e.fromScore}
                                    </span>
                                  </>
                                )}
                                <span className="text-xs text-muted-foreground">{timeAgo(e.ts / 1000)}</span>
                              </div>
                              {e.message && (
                                <div className="text-xs text-muted-foreground mt-1">"{e.message}"</div>
                              )}
                              <a
                                href={`https://solscan.io/tx/${e.txSignature}${
                                  passport?.network === "devnet" ? "?cluster=devnet" : ""
                                }`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                              >
                                View tx <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {isOwner && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Who I've Endorsed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {endorsementView.sent.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-6 text-center">
                          <Heart className="w-6 h-6 mx-auto mb-2 opacity-40" />
                          You haven't endorsed anyone yet.
                        </div>
                      ) : (
                        <ul className="space-y-3">
                          {endorsementView.sent.map((item) => (
                            <li
                              key={item.endorsement.txSignature}
                              className="flex items-start gap-3 text-sm border-b border-border/40 last:border-0 pb-3 last:pb-0"
                            >
                              <Heart className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Link href={`/p/${item.to}`} className="font-mono text-xs hover:underline">
                                    {shortAddress(item.to)}
                                  </Link>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-xs text-secondary font-semibold">
                                    +{item.endorsement.amountSol} SOL
                                  </span>
                                  {item.recipientScore !== undefined && (
                                    <>
                                      <span className="text-xs text-muted-foreground">·</span>
                                      <span className="text-xs text-primary font-semibold">
                                        Their score: {item.recipientScore}
                                      </span>
                                    </>
                                  )}
                                  <span className="text-xs text-muted-foreground">{timeAgo(item.endorsement.ts / 1000)}</span>
                                </div>
                                {item.endorsement.message && (
                                  <div className="text-xs text-muted-foreground mt-1">"{item.endorsement.message}"</div>
                                )}
                                <a
                                  href={`https://solscan.io/tx/${item.endorsement.txSignature}${
                                    passport?.network === "devnet" ? "?cluster=devnet" : ""
                                  }`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                                >
                                  View tx <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Badges</CardTitle>
                </CardHeader>
                <CardContent>
                  <BadgeGrid badges={data.badges} />
                </CardContent>
              </Card>

              {passport?.cnft && (
                <Card className="border-secondary/40 bg-secondary/5">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-secondary" />
                      Soulbound cNFT — live on devnet
                      <span className="text-[10px] uppercase font-mono text-secondary border border-secondary/40 rounded-full px-2 py-0.5">
                        Bubblegum V2
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ExternalField
                      label="cNFT asset"
                      value={passport.cnft.assetId}
                      href={solscanAsset(passport.cnft.assetId, "devnet")}
                    />
                    <ExternalField
                      label="Mint tx"
                      value={passport.cnft.mintSignature}
                      href={explorerTx(passport.cnft.mintSignature, "devnet")}
                    />
                    {passport.cnft.freezeSignature && (
                      <ExternalField
                        label="setNonTransferableV2 tx"
                        value={passport.cnft.freezeSignature}
                        href={explorerTx(passport.cnft.freezeSignature, "devnet")}
                      />
                    )}
                    <ExternalField
                      label="Core collection"
                      value={passport.cnft.collectionMint}
                      href={explorerAddress(passport.cnft.collectionMint, "devnet")}
                    />
                    <ExternalField
                      label="Merkle tree"
                      value={passport.cnft.merkleTree}
                      href={explorerAddress(passport.cnft.merkleTree, "devnet")}
                    />
                    {passport.cnft.metadataUri && (
                      <ExternalField
                        label="Off-chain metadata"
                        value={passport.cnft.metadataUri}
                        href={passport.cnft.metadataUri}
                      />
                    )}
                  </CardContent>
                </Card>
              )}

              {passport && (
                <Card className="border-border/40 bg-card/40">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      Verifiable claim
                      <span className="text-[10px] uppercase font-mono text-secondary border border-secondary/40 rounded-full px-2 py-0.5">
                        {passport.cnft ? "on-chain + cached" : "off-chain proof"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Field label="Passport ID" value={passport.id} mono />
                    <Field label="Owner" value={passport.address} mono />
                    <Field label="Issued" value={new Date(passport.mintedAt).toLocaleString()} />
                    <Field
                      label={passport.cnft ? "Mint signature" : "Owner signature"}
                      value={shortAddress(passport.signatureBase58, 16, 16)}
                      mono
                    />
                    <details className="mt-3">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        View raw metadata JSON
                      </summary>
                      <pre className="mt-2 text-[11px] font-mono p-3 rounded bg-background/60 border border-border overflow-x-auto scrollbar-thin max-h-60">
{JSON.stringify(passport.metadata.repsolana, null, 2)}
                      </pre>
                    </details>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Card>
            <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <Share2 className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Share this passport</div>
                  <div className="text-xs text-muted-foreground">
                    /p/{shortAddress(validAddress)}
                  </div>
                </div>
              </div>
              <Button variant="outline" onClick={copyShare} className="gap-2">
                {copied ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy share link"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm py-1">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <span className={`col-span-2 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function ExternalField({
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

function useValidatedAddress(addr: string | null): string | null {
  const [valid, setValid] = useState<string | null>(null);
  useEffect(() => {
    if (!addr) {
      setValid(null);
      return;
    }
    try {
      new PublicKey(addr);
      setValid(addr);
    } catch {
      setValid(null);
    }
  }, [addr]);
  return valid;
}

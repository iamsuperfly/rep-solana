/**
 * The shareable passport card. Used inline on the profile page and as the
 * preview before minting. Visual matches the SVG embedded in metadata.
 */
import type { ReputationProfile } from "@/lib/solana";
import { scoreTier } from "@/lib/passport";
import { ScoreGauge } from "./ScoreGauge";
import { shortAddress } from "@/lib/format";
import { Sparkles, ShieldCheck } from "lucide-react";

export function PassportCard({
  profile,
  minted,
}: {
  profile: ReputationProfile;
  minted?: boolean;
}) {
  const tier = scoreTier(profile.score.total);
  const earnedBadges = profile.badges.filter((b) => b.earned);

  return (
    <div className="relative rounded-2xl overflow-hidden border-gradient-solana p-6 sm:p-8 shadow-2xl">
      {/* Background flourish */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            <span className="w-6 h-px bg-current" />
            RepSolana · Passport
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight">
            <span className={`bg-gradient-to-r ${tier.tone} bg-clip-text text-transparent`}>
              {tier.label}
            </span>
          </h2>
          <p className="mt-1 text-xs font-mono text-muted-foreground">
            {shortAddress(profile.address, 6, 6)}
          </p>
        </div>
        {minted && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border border-secondary/40 bg-secondary/10 text-secondary">
            <ShieldCheck className="w-3.5 h-3.5" />
            Minted
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-8">
        <ScoreGauge score={profile.score.total} size={200} />

        <div className="flex-1 space-y-4 w-full">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Wallet Age" value={`${Math.round(profile.stats.walletAgeDays)}d`} />
            <Stat label="Total Txs" value={profile.stats.totalTxs.toString()} />
            <Stat label="DeFi" value={profile.stats.categoryCounts.defi.toString()} />
            <Stat label="NFTs" value={profile.stats.categoryCounts.nft.toString()} />
          </div>
          {earnedBadges.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Top badges
              </div>
              <div className="flex flex-wrap gap-1.5">
                {earnedBadges.slice(0, 6).map((b) => (
                  <span
                    key={b.id}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-border bg-muted/40"
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
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

/**
 * "Use as Collateral" — a demo simulator that shows how a passport could
 * unlock under-collateralized lending on Kamino / MarginFi based on
 * reputation tier. We don't move funds; we just illustrate the LTV /
 * borrow-cap improvement that a verified RepSolana passport would
 * produce on partner protocols.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Lock } from "lucide-react";

interface Props {
  score: number;
}

type Protocol = "kamino" | "marginfi";

function tierForScore(score: number) {
  if (score >= 85) return { ltvBoost: 0.18, label: "Legendary", apyDiscount: 1.4 };
  if (score >= 70) return { ltvBoost: 0.12, label: "Trusted", apyDiscount: 0.9 };
  if (score >= 50) return { ltvBoost: 0.07, label: "Active", apyDiscount: 0.5 };
  if (score >= 30) return { ltvBoost: 0.03, label: "Emerging", apyDiscount: 0.2 };
  return { ltvBoost: 0, label: "New", apyDiscount: 0 };
}

const BASE_LTV: Record<Protocol, number> = { kamino: 0.65, marginfi: 0.6 };
const BASE_APR: Record<Protocol, number> = { kamino: 6.8, marginfi: 7.4 };

export function CollateralDemo({ score }: Props) {
  const [protocol, setProtocol] = useState<Protocol>("kamino");
  const [collateral, setCollateral] = useState(50);

  const tier = useMemo(() => tierForScore(score), [score]);
  const baseLtv = BASE_LTV[protocol];
  const boostedLtv = Math.min(0.92, baseLtv + tier.ltvBoost);
  const baseBorrow = collateral * baseLtv;
  const boostedBorrow = collateral * boostedLtv;
  const baseApr = BASE_APR[protocol];
  const boostedApr = Math.max(1.5, baseApr - tier.apyDiscount);

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4" /> Use as Collateral
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Simulate the borrowing improvement your passport unlocks on partner protocols.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">Demo</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs value={protocol} onValueChange={(v) => setProtocol(v as Protocol)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="kamino">Kamino</TabsTrigger>
            <TabsTrigger value="marginfi">MarginFi</TabsTrigger>
          </TabsList>
        </Tabs>

        <div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-xs text-muted-foreground">Collateral</span>
            <span className="text-sm font-mono tabular-nums">{collateral} SOL</span>
          </div>
          <Slider
            value={[collateral]}
            onValueChange={(v) => setCollateral(v[0])}
            min={1}
            max={500}
            step={1}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60 p-3 bg-background/50">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">No passport</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
              {baseBorrow.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">USDC</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {(baseLtv * 100).toFixed(0)}% LTV · {baseApr.toFixed(1)}% APR
            </div>
          </div>
          <div className="rounded-lg border-gradient-solana p-3">
            <div className="text-[10px] uppercase tracking-wider text-secondary flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> With RepSolana
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1 text-gradient-solana">
              {boostedBorrow.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">USDC</span>
            </div>
            <div className="text-[11px] text-secondary/90 mt-1">
              {(boostedLtv * 100).toFixed(0)}% LTV · {boostedApr.toFixed(1)}% APR
            </div>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
          Your <span className="text-foreground font-semibold">{tier.label}</span> tier
          unlocks +{(tier.ltvBoost * 100).toFixed(0)}% LTV and
          −{tier.apyDiscount.toFixed(1)}% APR. Real protocol integration
          requires the partner to whitelist the RepSolana cNFT collection.
        </div>
      </CardContent>
    </Card>
  );
}

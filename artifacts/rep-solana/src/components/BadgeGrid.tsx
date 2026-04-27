import type { Badge } from "@/lib/solana";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Award,
  Crown,
  Flame,
  Gem,
  Layers,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";

const ICON_MAP: Record<string, typeof Award> = {
  og: Crown,
  veteran: ShieldCheck,
  active: Flame,
  "power-user": Rocket,
  "defi-native": Layers,
  staker: Wallet,
  "nft-collector": Sparkles,
  explorer: Star,
  whale: Gem,
  "clean-record": Award,
};

const RARITY_STYLES: Record<Badge["rarity"], string> = {
  common: "border-slate-500/40 from-slate-500/10 to-slate-500/0",
  rare: "border-cyan-400/50 from-cyan-400/15 to-cyan-400/0",
  epic: "border-fuchsia-400/50 from-fuchsia-500/15 to-fuchsia-500/0",
  legendary: "border-amber-300/60 from-amber-400/20 to-amber-400/0",
};

export function BadgeGrid({ badges }: { badges: Badge[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {badges.map((badge, i) => {
        const Icon = ICON_MAP[badge.id] ?? Award;
        return (
          <motion.div
            key={badge.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.4 }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={[
                    "relative aspect-square rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 border bg-gradient-to-br transition-all cursor-default",
                    badge.earned
                      ? `${RARITY_STYLES[badge.rarity]} hover:scale-[1.03]`
                      : "border-border/60 from-muted/30 to-transparent opacity-40 grayscale",
                  ].join(" ")}
                >
                  <Icon
                    className={`w-6 h-6 ${
                      badge.earned ? "text-foreground" : "text-muted-foreground"
                    }`}
                    strokeWidth={1.6}
                  />
                  <span className="text-[11px] font-semibold text-center leading-tight">
                    {badge.label}
                  </span>
                  {badge.earned && (
                    <span
                      className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                        badge.rarity === "legendary"
                          ? "bg-amber-300 shadow-[0_0_6px] shadow-amber-300"
                          : badge.rarity === "epic"
                            ? "bg-fuchsia-400 shadow-[0_0_6px] shadow-fuchsia-400"
                            : badge.rarity === "rare"
                              ? "bg-cyan-400 shadow-[0_0_6px] shadow-cyan-400"
                              : "bg-slate-400"
                      }`}
                    />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                <p className="font-semibold">{badge.label}</p>
                <p className="text-xs text-muted-foreground">{badge.description}</p>
                <p className="text-[10px] uppercase tracking-wider mt-1">
                  {badge.rarity} · {badge.earned ? "Earned" : "Locked"}
                </p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        );
      })}
    </div>
  );
}

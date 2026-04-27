import type { ScoreBreakdown as ScoreBreakdownT } from "@/lib/solana";
import { motion } from "framer-motion";

export function ScoreBreakdown({ breakdown }: { breakdown: ScoreBreakdownT }) {
  return (
    <div className="space-y-3">
      {breakdown.components.map((c, i) => {
        const pct = (c.value / c.max) * 100;
        return (
          <div key={c.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <div>
                <span className="text-sm font-medium">{c.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.detail}</span>
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {c.value} <span className="opacity-50">/ {c.max}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-solana rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: i * 0.06, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

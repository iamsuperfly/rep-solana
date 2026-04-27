/**
 * Animated radial score gauge — the centerpiece of the dashboard and
 * passport profile. Animates from previous value to new value with
 * framer-motion's spring tween.
 */
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { scoreTier } from "@/lib/passport";

export function ScoreGauge({
  score,
  size = 220,
  thickness = 14,
  label,
}: {
  score: number;
  size?: number;
  thickness?: number;
  label?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const motionValue = useMotionValue(0);
  const dashOffset = useTransform(motionValue, (v) => circumference * (1 - v / 100));
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, score, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplayed(Math.round(v)),
    });
    return () => controls.stop();
  }, [score, motionValue]);

  const tier = scoreTier(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Soft outer pulse ring */}
      <div
        className="absolute inset-0 rounded-full bg-gradient-solana opacity-20 blur-2xl pulse-ring"
        aria-hidden="true"
      />
      <svg width={size} height={size} className="relative -rotate-90">
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(270 95% 65%)" />
            <stop offset="50%" stopColor="hsl(195 100% 60%)" />
            <stop offset="100%" stopColor="hsl(165 95% 55%)" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={thickness}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth={thickness}
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
          strokeLinecap="round"
          filter="drop-shadow(0 0 12px hsl(270 95% 65% / 0.4))"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
          {label ?? "Reputation"}
        </span>
        <span className="text-6xl font-extrabold tabular-nums text-gradient-solana leading-none">
          {displayed}
        </span>
        <span className="text-xs text-muted-foreground mt-1">/ 100</span>
        <span className="mt-3 text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-border/80 bg-background/60">
          {tier.label}
        </span>
      </div>
    </div>
  );
}

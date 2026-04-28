/**
 * "Share on X" button — opens a pre-filled tweet intent in a new tab.
 *
 * Used on the public passport profile page (/p/<wallet>) and the verify
 * page (/verify/<wallet>) so passport holders + verifiers can amplify
 * their reputation in one click.
 */
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

const X_LOGO = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="w-3.5 h-3.5"
    fill="currentColor"
  >
    <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.86l-5.36-6.99L4.6 22H1.34l8.04-9.18L1 2h7.04l4.84 6.4L18.244 2zm-1.2 18h1.9L7.06 4h-2L17.044 20z" />
  </svg>
);

const HASHTAGS = ["Solana", "ColosseumFrontier", "RepSolana"];

export interface ShareOnXProps {
  /** Wallet whose passport is being shared. */
  address: string;
  /** Score 0..100 (when known). */
  score?: number;
  /** Tier label, e.g. "Trusted". */
  tier?: string;
  /** Earned badge labels (we use up to 3 in the tweet). */
  badges?: string[];
  /** Where to point the verifier — defaults to the public passport URL. */
  shareKind?: "passport" | "verify";
  className?: string;
  /** Visual size — matches shadcn button sizes. */
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

function buildShareUrl(address: string, kind: ShareOnXProps["shareKind"]) {
  if (typeof window === "undefined") return "";
  const base = window.location.origin;
  if (kind === "verify") return `${base}/verify/${address}`;
  return `${base}/p/${address}`;
}

function buildTweetText(opts: ShareOnXProps): string {
  const parts: string[] = [];
  if (typeof opts.score === "number") {
    parts.push(`I just minted my on-chain reputation passport on Solana 🔥`);
    parts.push(`Score: ${opts.score}/100${opts.tier ? ` · Tier: ${opts.tier}` : ""}`);
  } else {
    parts.push(`Check out this on-chain reputation passport on Solana 🔥`);
  }
  if (opts.badges && opts.badges.length) {
    const top = opts.badges.slice(0, 3).join(" · ");
    parts.push(`Badges earned: ${top}`);
  }
  parts.push(
    opts.shareKind === "verify"
      ? "Verify it independently:"
      : "View / verify the soulbound cNFT:",
  );
  return parts.join("\n");
}

export function ShareOnX(props: ShareOnXProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const url = buildShareUrl(props.address, props.shareKind);
  const text = buildTweetText(props);
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}&hashtags=${encodeURIComponent(HASHTAGS.join(","))}`;

  const handleClick = () => {
    if (typeof window === "undefined") return;
    window.open(intent, "_blank", "noopener,noreferrer,width=600,height=700");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      toast({ title: "Tweet copied", description: "Paste into X / threads / Farcaster" });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${props.className ?? ""}`}>
      <Button
        size={props.size ?? "sm"}
        variant={props.variant ?? "default"}
        onClick={handleClick}
        className={`gap-2 ${
          (props.variant ?? "default") === "default"
            ? "bg-black text-white hover:bg-black/90 border border-white/10"
            : ""
        }`}
        data-testid="button-share-x"
      >
        {X_LOGO}
        Share on X
      </Button>
      <Button
        size="icon"
        variant="outline"
        onClick={handleCopy}
        className="h-8 w-8"
        title="Copy tweet text"
        data-testid="button-copy-tweet"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

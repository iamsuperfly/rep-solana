import { motion } from "framer-motion";
import { Link } from "wouter";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ShieldCheck,
  Activity,
  Layers,
  Eye,
  Github,
  ArrowRight,
  Zap,
  Lock,
} from "lucide-react";

export function LandingPage() {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-20 pb-28 sm:pt-32 sm:pb-40 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute top-1/4 left-10 w-72 h-72 rounded-full bg-secondary/15 blur-[100px] float" />
          <div className="absolute top-2/3 right-10 w-72 h-72 rounded-full bg-accent/15 blur-[100px] float" style={{ animationDelay: "2s" }} />
        </div>

        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs font-medium text-primary"
          >
            <Zap className="w-3.5 h-3.5" />
            Built for Colosseum Frontier Hackathon · Solana
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 text-5xl sm:text-7xl font-extrabold tracking-tight leading-[1.05]"
          >
            Your reputation,
            <br />
            <span className="text-gradient-solana">portable on Solana.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground"
          >
            RepSolana reads your on-chain history, computes a live 0–100
            reputation score, and mints a soulbound compressed NFT passport
            you can take to every dApp.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            {connected ? (
              <Link href="/dashboard">
                <Button
                  size="lg"
                  className="bg-gradient-solana text-white border-0 font-semibold gap-2 shadow-xl glow-purple"
                >
                  Open Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <WalletConnectButton size="lg" />
            )}
            <Link href="/verify">
              <Button size="lg" variant="outline" className="gap-2 border-border/80" data-testid="link-landing-verify">
                <ShieldCheck className="w-4 h-4" />
                Verify a passport
              </Button>
            </Link>
            <a
              href="https://github.com/iamsuperfly/rep-solana"
              target="_blank"
              rel="noreferrer"
            >
              <Button size="lg" variant="outline" className="gap-2 border-border/80">
                <Github className="w-4 h-4" />
                View on GitHub
              </Button>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-secondary" /> Phantom + Solflare</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> Compressed NFTs</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent" /> Helius RPC ready</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" /> Open source</span>
          </motion.div>
        </div>

        {/* Hero passport mock */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4 }}
          className="relative mx-auto max-w-3xl mt-16 px-4"
        >
          <FloatingPassportPreview />
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-border/40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-center max-w-2xl mx-auto leading-tight">
            One passport. Every Solana dApp.
          </h2>
          <p className="mt-3 text-muted-foreground text-center max-w-xl mx-auto">
            Built around four primitives that turn anonymous wallets into trusted citizens.
          </p>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FeatureCard
              icon={Activity}
              title="Live On-Chain Score"
              body="Your wallet age, DeFi usage, staking, NFT culture, and reliability fold into one transparent 0–100 number — recomputed from RPC every visit."
            />
            <FeatureCard
              icon={Sparkles}
              title="Soulbound cNFT Passport"
              body="One click → Metaplex compressed NFT, minted to you and only you. Score, badges, and verifiable claims live in the metadata."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="On-Chain Endorsements"
              body="Anyone can endorse a passport with a real 0.001 SOL transfer + signed memo. Endorsements compound — your network is your collateral."
            />
            <FeatureCard
              icon={Lock}
              title="Use as Collateral"
              body="Plug into Kamino & MarginFi. Higher reputation → higher LTV, lower APR. Reputation finally pays."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 border-t border-border/40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-center">How it works</h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step
              n={1}
              title="Connect"
              body="Phantom, Solflare, Backpack — instant. We read your transaction history live from a public RPC (or Helius if configured)."
            />
            <Step
              n={2}
              title="Score"
              body="Seven transparent components — wallet age, volume, reliability, DeFi, staking, NFT culture, diversity — fold into a 0–100 score."
            />
            <Step
              n={3}
              title="Mint"
              body="Sign once and your soulbound passport is yours. Share /p/<wallet> anywhere. Refresh anytime to lock in a new proof."
            />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 border-t border-border/40">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <Eye className="w-10 h-10 text-primary mx-auto" />
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold">
            Stop being a stranger to every dApp you touch.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Connect your wallet and mint your first passport in under 30 seconds.
          </p>
          <div className="mt-8 flex justify-center">
            {connected ? (
              <Link href="/dashboard">
                <Button size="lg" className="bg-gradient-solana text-white border-0 gap-2 shadow-xl glow-purple">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <WalletConnectButton size="lg" />
            )}
          </div>
        </div>
      </section>

      <footer className="py-10 border-t border-border/40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>RepSolana — built for the Colosseum Frontier Hackathon · Open source · MIT</div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/iamsuperfly/rep-solana" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
            <span>·</span>
            <span>Solana Mainnet & Devnet</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="border-gradient-solana p-5"
    >
      <div className="w-9 h-9 rounded-lg bg-gradient-solana flex items-center justify-center mb-4 shadow-lg">
        <Icon className="w-4 h-4 text-white" strokeWidth={2.2} />
      </div>
      <h3 className="font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </motion.div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="relative rounded-xl p-6 border border-border/60 bg-card/40">
      <div className="text-5xl font-extrabold text-gradient-solana opacity-40 leading-none">
        0{n}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function FloatingPassportPreview() {
  return (
    <div className="relative aspect-[16/9] sm:aspect-[16/8] w-full rounded-3xl border-gradient-solana overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0c0719] via-[#160a32] to-[#080514]" />
      <div className="absolute inset-0 opacity-50">
        <div className="absolute top-10 right-20 w-72 h-72 rounded-full bg-primary/40 blur-3xl" />
        <div className="absolute bottom-10 left-20 w-72 h-72 rounded-full bg-secondary/30 blur-3xl" />
      </div>
      <div className="relative p-6 sm:p-10 h-full flex items-center justify-between gap-8">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">RepSolana · Passport</div>
          <div className="mt-3 text-3xl sm:text-5xl font-extrabold text-gradient-solana">Trusted</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">7Pdh…XL3z</div>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {["Solana OG", "DeFi Native", "Staker", "Explorer"].map((b) => (
              <span key={b} className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-border bg-muted/50">{b}</span>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-gradient-solana blur-2xl opacity-50 pulse-ring" />
          <svg width="180" height="180" viewBox="0 0 180 180" className="relative -rotate-90">
            <defs>
              <linearGradient id="heroRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#9945FF"/><stop offset=".5" stopColor="#19C2FF"/><stop offset="1" stopColor="#14F195"/>
              </linearGradient>
            </defs>
            <circle cx="90" cy="90" r="76" fill="none" stroke="hsl(var(--muted))" strokeWidth="12"/>
            <circle cx="90" cy="90" r="76" fill="none" stroke="url(#heroRing)" strokeWidth="12"
              strokeDasharray={`${(78 / 100) * 477} 477`} strokeLinecap="round"/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center -rotate-0">
            <span className="text-5xl font-extrabold text-gradient-solana">78</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

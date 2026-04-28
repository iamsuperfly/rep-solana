import { Link, useLocation } from "wouter";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { Sparkles, ShieldCheck } from "lucide-react";

export function Navbar() {
  const [loc] = useLocation();
  const { connected, publicKey } = useWallet();

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/60 border-b border-border/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-solana flex items-center justify-center font-bold text-white text-sm shadow-lg group-hover:scale-105 transition-transform">
            R
            <span className="absolute inset-0 rounded-lg bg-gradient-solana blur opacity-40 group-hover:opacity-60 transition-opacity -z-10" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-sm">RepSolana</span>
            <span className="text-[10px] text-muted-foreground tracking-wider uppercase">Reputation Passport</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-md transition-colors ${loc === "/" ? "text-foreground bg-muted/60" : "text-muted-foreground hover:text-foreground"}`}
          >
            Home
          </Link>
          {connected && (
            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded-md transition-colors ${loc === "/dashboard" ? "text-foreground bg-muted/60" : "text-muted-foreground hover:text-foreground"}`}
            >
              Dashboard
            </Link>
          )}
          {connected && publicKey && (
            <Link
              href={`/p/${publicKey.toBase58()}`}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${loc.startsWith("/p/") ? "text-foreground bg-muted/60" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              My Passport
            </Link>
          )}
          <Link
            href="/verify"
            data-testid="link-nav-verify"
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${loc.startsWith("/verify") ? "text-foreground bg-muted/60" : "text-muted-foreground hover:text-foreground"}`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Verify
          </Link>
          <a
            href="https://github.com/iamsuperfly/rep-solana"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <WalletConnectButton />
        </div>
      </div>
    </header>
  );
}

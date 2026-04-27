/**
 * Custom-styled wallet connect button. Wraps the wallet-adapter modal but
 * uses our shadcn button so it matches the rest of the UI.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortAddress } from "@/lib/format";
import { Wallet, Copy, LogOut, ChevronDown, Check } from "lucide-react";
import { useState } from "react";

export function WalletConnectButton({ size = "default" as "default" | "lg" }) {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);

  if (!connected || !publicKey) {
    return (
      <Button
        size={size}
        onClick={() => setVisible(true)}
        className="bg-gradient-solana text-white border-0 hover:opacity-90 font-semibold gap-2 shadow-lg glow-purple"
      >
        <Wallet className="w-4 h-4" />
        Connect Wallet
      </Button>
    );
  }

  const addr = publicKey.toBase58();

  async function copy() {
    await navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant="outline"
          className="font-mono gap-2 border-border/80 bg-card/60"
        >
          <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px] shadow-secondary" />
          {shortAddress(addr)}
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={copy} className="gap-2">
          {copied ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy address"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setVisible(true)}
          className="gap-2"
        >
          <Wallet className="w-4 h-4" />
          Switch wallet
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={disconnect} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

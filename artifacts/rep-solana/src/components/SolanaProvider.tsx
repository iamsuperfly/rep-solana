/**
 * Wallet adapter root.
 *
 * We deliberately use the lightweight Phantom + Solflare + Backpack set so
 * the bundle stays small and we don't pull in wallets that depend on
 * react-native or unmaintained polyfills. Adding more wallets later is a
 * one-line change.
 */
import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { getRpcEndpoint, type Network } from "@/lib/solana";

export function SolanaProvider({
  children,
  network = "mainnet-beta",
}: {
  children: ReactNode;
  network?: Network;
}) {
  const endpoint = useMemo(() => getRpcEndpoint(network), [network]);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

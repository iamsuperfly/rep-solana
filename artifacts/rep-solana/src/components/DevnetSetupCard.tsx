/**
 * Devnet status panel — shows the official RepSolana collection +
 * Merkle tree, live capacity, devnet SOL balance, and a one-click
 * airdrop helper.
 *
 * New in this version:
 *   • Tree Capacity bar — visible to everyone, shows X/32 mints used.
 *   • "Setup New Merkle Tree" button — shown only to the wallet whose
 *     public key matches the VITE_TREE_DELEGATE_SECRET authority.
 *   • Migration note — wallets with passports from old collections are
 *     not blocked; the DAS lookup already filters by official collection
 *     so old holders simply see the standard "Mint" button.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getDevnetConfig,
  getDevnetBalance,
  explorerAddress,
  explorerTx,
  TREE_MAX_CAPACITY,
  getTreeMintCount,
  getTreeDelegatePublicKey,
  createNewMerkleTree,
} from "@/lib/bubblegum";
import {
  Coins,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { shortAddress } from "@/lib/format";

export function DevnetSetupCard({ address }: { address: string }) {
  const cfg = getDevnetConfig(address);
  const wallet = useWallet();
  const { toast } = useToast();

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBal, setLoadingBal] = useState(false);

  // Capacity state — null means "not yet loaded" or "DAS unavailable"
  const [mintCount, setMintCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [capacityChecked, setCapacityChecked] = useState(false);

  // New-tree flow (authority only)
  const [settingUpTree, setSettingUpTree] = useState(false);
  const [newTreeResult, setNewTreeResult] = useState<{
    merkleTree: string;
    treeSignature: string;
  } | null>(null);

  // Derive authority public key from the bundled env var (no RPC call needed)
  const authorityPubkey = getTreeDelegatePublicKey();
  const isAuthority =
    authorityPubkey !== null && address === authorityPubkey;

  // ── Data loaders ────────────────────────────────────────────────────────

  async function loadBalance() {
    setLoadingBal(true);
    try {
      setBalance(await getDevnetBalance(address));
    } catch {
      setBalance(null);
    } finally {
      setLoadingBal(false);
    }
  }

  async function loadMintCount() {
    setLoadingCount(true);
    try {
      const count = await getTreeMintCount();
      setMintCount(count);
    } catch {
      setMintCount(null);
    } finally {
      setLoadingCount(false);
      setCapacityChecked(true);
    }
  }

  async function handleRefreshAll() {
    await Promise.all([loadBalance(), loadMintCount()]);
  }

  useEffect(() => {
    void handleRefreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // ── New tree handler (authority only) ───────────────────────────────────

  async function handleSetupNewTree() {
    if (!wallet.connected || !wallet.publicKey) {
      toast({ title: "Connect wallet first", variant: "destructive" });
      return;
    }
    setSettingUpTree(true);
    try {
      const result = await createNewMerkleTree(wallet);
      setNewTreeResult(result);
      toast({
        title: "New Merkle tree created!",
        description: `${result.merkleTree.slice(0, 8)}… — copy the address and update OFFICIAL_MERKLE_TREE in bubblegum.ts`,
      });
    } catch (err) {
      toast({
        title: "Tree creation failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSettingUpTree(false);
    }
  }

  // ── Capacity derived values ─────────────────────────────────────────────

  const slotsUsed = mintCount ?? 0;
  const slotsLeft = TREE_MAX_CAPACITY - slotsUsed;
  const capacityPct = Math.min(100, (slotsUsed / TREE_MAX_CAPACITY) * 100);
  const capacityKnown = mintCount !== null;
  const barColor =
    capacityPct >= 90
      ? "hsl(var(--destructive))"
      : capacityPct >= 70
        ? "#f59e0b"
        : "hsl(var(--secondary))";

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Card className="border-secondary/30 bg-secondary/5">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-secondary" />
          Devnet on-chain mint
          <span className="text-[10px] font-mono uppercase tracking-wider text-secondary/80 border border-secondary/40 rounded-full px-2 py-0.5">
            Bubblegum V2
          </span>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefreshAll}
          disabled={loadingBal || loadingCount}
          className="gap-1.5 text-xs"
        >
          <RefreshCcw
            className={`w-3 h-3 ${loadingBal || loadingCount ? "animate-spin" : ""}`}
          />
          {balance != null ? `${balance.toFixed(3)} SOL` : "—"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {/* Collection + Tree addresses */}
        <div className="space-y-1.5 text-xs">
          <Field
            label="Core collection"
            value={cfg.collectionMint}
            href={explorerAddress(cfg.collectionMint, "devnet")}
          />
          <Field
            label="Merkle tree"
            value={cfg.merkleTree}
            href={explorerAddress(cfg.merkleTree, "devnet")}
          />
        </div>

        {/* ── Capacity indicator — visible to everyone ────────────────── */}
        <div className="rounded-md border border-secondary/20 bg-secondary/5 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tree Capacity
            </span>

            {loadingCount ? (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                loading…
              </span>
            ) : capacityKnown ? (
              <span className="font-mono text-xs font-semibold text-secondary">
                {slotsUsed}&nbsp;/&nbsp;{TREE_MAX_CAPACITY} mints used
                &nbsp;·&nbsp;
                <span
                  className={
                    slotsLeft <= 4 ? "text-destructive" : "text-secondary/80"
                  }
                >
                  {slotsLeft} slot{slotsLeft !== 1 ? "s" : ""} left
                </span>
              </span>
            ) : capacityChecked ? (
              <span className="text-muted-foreground text-[10px]">
                requires Helius RPC
              </span>
            ) : null}
          </div>

          {capacityKnown && (
            <div className="w-full h-1.5 rounded-full bg-secondary/20 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${capacityPct}%`, background: barColor }}
              />
            </div>
          )}

          {capacityKnown && slotsLeft <= 4 && slotsLeft > 0 && (
            <p className="text-[10px] text-amber-400">
              Tree almost full — the collection authority should create a new
              Merkle tree soon.
            </p>
          )}

          {capacityKnown && slotsLeft === 0 && (
            <p className="text-[10px] text-destructive font-semibold">
              Tree is full — no new mints possible until a new tree is set up.
            </p>
          )}
        </div>

        {/* ── Actions row ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Faucet */}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
          >
            <a
              href="https://faucet.solana.com"
              target="_blank"
              rel="noreferrer noopener"
            >
              <Coins className="w-3 h-3" />
              Claim devnet SOL
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          </Button>

          {/* Setup New Merkle Tree — authority wallet only */}
          {isAuthority && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              onClick={handleSetupNewTree}
              disabled={settingUpTree || !wallet.connected}
            >
              {settingUpTree ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              {settingUpTree ? "Creating tree…" : "Setup New Merkle Tree"}
            </Button>
          )}
        </div>

        {/* ── New tree result ──────────────────────────────────────────── */}
        {newTreeResult && (
          <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2.5 space-y-1.5 text-xs">
            <p className="text-green-400 font-semibold">
              New Merkle tree created!
            </p>
            <p className="text-muted-foreground">
              Copy this address and update{" "}
              <code className="font-mono text-[11px]">
                OFFICIAL_MERKLE_TREE
              </code>{" "}
              in{" "}
              <code className="font-mono text-[11px]">bubblegum.ts</code>:
            </p>
            <div className="flex items-center gap-2 rounded bg-black/30 px-2 py-1.5">
              <code className="font-mono text-[11px] text-green-300 break-all flex-1">
                {newTreeResult.merkleTree}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0 hover:bg-green-500/20"
                onClick={() =>
                  void navigator.clipboard.writeText(newTreeResult.merkleTree)
                }
                title="Copy address"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <a
              href={explorerTx(newTreeResult.treeSignature, "devnet")}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-secondary/70 hover:text-secondary inline-flex items-center gap-1"
            >
              View tx on Explorer
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs hover:text-secondary inline-flex items-center gap-1"
      >
        {shortAddress(value, 6, 6)}
        <ExternalLink className="w-3 h-3 opacity-60" />
      </a>
    </div>
  );
}

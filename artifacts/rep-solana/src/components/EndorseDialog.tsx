/**
 * Endorse-a-passport flow.
 *
 * Sends a real 0.001 SOL transfer from the connected wallet to the
 * passport owner with an attached memo. The signature is stored on the
 * passport so anyone viewing the profile can verify the endorsement.
 *
 * Uses devnet by default for hackathon (no SOL cost).
 * Network is passed in from parent to match the passport's network.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { addEndorsement, type Endorsement } from "@/lib/passport";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2 } from "lucide-react";
import { useReputation } from "@/hooks/use-reputation";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const ENDORSE_MIN_SCORE = 50;

export function EndorseDialog({
  recipientAddress,
  network,
}: {
  recipientAddress: string;
  network: "mainnet-beta" | "devnet";
}) {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();
  const { data: endorserProfile } = useReputation(publicKey?.toBase58() ?? null, network);

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const isSelf = publicKey?.toBase58() === recipientAddress;
  const endorserScore = endorserProfile?.score.total ?? 0;
  const canEndorse = connected && !isSelf && endorserScore >= ENDORSE_MIN_SCORE;

  async function handleEndorse() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const recipient = new PublicKey(recipientAddress);
      const lamports = Math.floor(0.001 * LAMPORTS_PER_SOL);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipient,
          lamports,
        }),
      );

      if (message.trim()) {
        tx.add(
          new TransactionInstruction({
            keys: [],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(`RepSolana endorse: ${message.slice(0, 140)}`, "utf8"),
          }),
        );
      }

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      const endorsement: Endorsement = {
        from: publicKey.toBase58(),
        amountSol: 0.001,
        txSignature: signature,
        message: message.trim() || undefined,
        ts: Date.now(),
        fromScore: endorserScore,
      };
      addEndorsement(recipientAddress, endorsement);

      toast({
        title: "Endorsement sent!",
        description: "0.001 SOL transferred. Thanks for boosting trust on Solana.",
      });
      setOpen(false);
      setMessage("");
    } catch (err) {
      const e = err as Error;
      toast({
        title: "Endorsement failed",
        description: e.message ?? "Transaction was rejected.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-secondary/40 text-secondary hover:text-secondary"
          disabled={!connected || isSelf}
          title={isSelf ? "You can't endorse your own passport" : undefined}
        >
          <Heart className="w-4 h-4" />
          Endorse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Endorse this passport</DialogTitle>
          <DialogDescription>
            Send 0.001 SOL on {network === "mainnet-beta" ? "mainnet" : "devnet"} as a
            verifiable on-chain endorsement. Your signature is recorded forever.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Recipient</Label>
            <div className="font-mono text-xs mt-1 p-2 rounded bg-muted/50 break-all">
              {recipientAddress}
            </div>
          </div>
          <div>
            <Label htmlFor="msg" className="text-xs">
              Optional message (stored on-chain via memo)
            </Label>
            <Input
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={140}
              placeholder="Great trader, paid me back on time…"
              className="mt-1"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              {message.length}/140 — written to the Solana memo program
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={handleEndorse}
          disabled={busy || !canEndorse}
            className="bg-gradient-solana text-white border-0 gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? "Sending…" : "Send 0.001 SOL"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

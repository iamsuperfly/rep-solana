/**
 * Real on-chain Metaplex Bubblegum V2 compressed NFT (cNFT) integration.
 *
 * Targets devnet for the Colosseum Frontier hackathon demo.
 *
 * Soulbound model:
 *   1. We create an MPL Core collection with the PermanentFreezeDelegate
 *      plugin set to `frozen: true`. Every cNFT minted into this
 *      collection inherits the freeze → no transfer is possible.
 *   2. After mintV2 we additionally call setNonTransferableV2 — belt &
 *      braces: the leaf flag is flipped on-chain so even the indexer
 *      reports the asset as non-transferable.
 *
 * All mints use the single official RepSolana collection + Merkle tree.
 * The "initialize" flow is no longer exposed to end users.
 */

import {
  createUmi,
} from "@metaplex-foundation/umi-bundle-defaults";
import {
  walletAdapterIdentity,
  type WalletAdapter,
} from "@metaplex-foundation/umi-signer-wallet-adapters";
import {
  mplBubblegum,
  createTreeV2,
  mintV2,
  parseLeafFromMintV2Transaction,
  findLeafAssetIdPda,
  burnV2,
  TokenStandard,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  mplCore,
  createCollection,
} from "@metaplex-foundation/mpl-core";
import {
  createSignerFromKeypair,
  generateSigner,
  publicKey as toPublicKey,
  some,
  none,
  type Umi,
  type PublicKey as UmiPublicKey,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import bs58 from "bs58";
import type { ReputationProfile } from "./solana";
import { buildOnChainMetadata, uploadMetadataJSON } from "./passport-metadata";

// ---------------------------------------------------------------------------
// Official RepSolana collection — all mints go here, no new trees/collections
// ---------------------------------------------------------------------------

export const OFFICIAL_COLLECTION_MINT =
  "2mLLJrgkntYd4i9UgFgtRQc7sXNAWVJxoQhyNZ5QN4ev";

export const OFFICIAL_MERKLE_TREE =
  "9CJRE5PWiy2PFZNrf6DecBqdBqDDNYVLsMHUi47BJPni";

/** Devnet RPC. Honours VITE_HELIUS_RPC_URL if the user provides one. */
export function getDevnetRpcUrl(): string {
  const override = (import.meta.env.VITE_HELIUS_RPC_URL as string | undefined) || "";
  if (override) return override;
  const heliusKey = (import.meta.env.VITE_HELIUS_API_KEY as string | undefined) || "";
  if (heliusKey) return `https://devnet.helius-rpc.com/?api-key=${heliusKey}`;
  return "https://api.devnet.solana.com";
}

/** Build a Umi instance pointed at devnet, signed by the connected wallet. */
export function buildUmi(walletAdapter: WalletAdapter): Umi {
  const umi = createUmi(getDevnetRpcUrl())
    .use(mplBubblegum())
    .use(mplCore())
    .use(walletAdapterIdentity(walletAdapter));
  return umi;
}

// ---------------------------------------------------------------------------
// Per-wallet config — always returns the official collection + tree
// ---------------------------------------------------------------------------

export interface DevnetCollectionConfig {
  owner: string;
  collectionMint: string;
  merkleTree: string;
  createdAt: number;
  verifiedCollectionAt?: number;
  verifiedCollectionSignature?: string;
}

/**
 * Always returns the official RepSolana collection config.
 * No per-wallet initialization needed — all wallets share the same
 * collection and Merkle tree.
 */
export function getDevnetConfig(owner: string): DevnetCollectionConfig {
  return {
    owner,
    collectionMint: OFFICIAL_COLLECTION_MINT,
    merkleTree: OFFICIAL_MERKLE_TREE,
    createdAt: 0,
  };
}

/** No-op: kept for API compatibility. Use getDevnetConfig() — it always returns the official config. */
export function clearDevnetConfig(_owner: string): void {
  // No-op: config is now global (official collection), not per-wallet.
}

// ---------------------------------------------------------------------------
// Initialize: kept for collection-authority use only — not exposed to end users
// ---------------------------------------------------------------------------

export interface InitResult {
  collectionMint: string;
  merkleTree: string;
  collectionSignature: string;
  treeSignature: string;
}

const TREE_MAX_DEPTH = 5;
const TREE_MAX_BUFFER = 8;

/**
 * One-time setup for the collection authority only.
 * End users should never call this — the official collection + tree are
 * already created and hardcoded above.
 */
export async function initializeDevnetCollection(
  walletAdapter: WalletAdapter,
): Promise<InitResult> {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }
  const umi = buildUmi(walletAdapter);

  const collectionSigner = generateSigner(umi);
  const collectionTxBuilder = createCollection(umi, {
    collection: collectionSigner,
    name: "RepSolana Soulbound Reputation Passport",
    uri: "https://repsolana.app/collection.json",
    plugins: [
      { type: "BubblegumV2" },
      { type: "PermanentFreezeDelegate", frozen: true },
    ],
  });

  const collectionRes = await collectionTxBuilder.sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });

  const merkleTreeSigner = generateSigner(umi);
  const treeBuilder = await createTreeV2(umi, {
    merkleTree: merkleTreeSigner,
    maxDepth: TREE_MAX_DEPTH,
    maxBufferSize: TREE_MAX_BUFFER,
    public: false,
  });
  const treeRes = await treeBuilder.sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });

  return {
    collectionMint: collectionSigner.publicKey,
    merkleTree: merkleTreeSigner.publicKey,
    collectionSignature: base58.deserialize(collectionRes.signature)[0],
    treeSignature: base58.deserialize(treeRes.signature)[0],
  };
}

// ---------------------------------------------------------------------------
// Mint: real on-chain compressed soulbound passport
// ---------------------------------------------------------------------------

export interface MintResult {
  assetId: string;
  mintSignature: string;
  freezeSignature?: string;
  metadataUri: string;
  collectionMint: string;
  merkleTree: string;
  network: "devnet";
}

/**
 * Mint the user's RepSolana passport as a real, on-chain, compressed,
 * soulbound NFT into the official RepSolana collection + Merkle tree.
 *
 * The official Merkle tree was created with `public: false`, so
 * treeCreatorOrDelegate must cosign every mintV2 call.  We load that
 * keypair from VITE_TREE_DELEGATE_SECRET (base58-encoded 64-byte Solana
 * keypair of the dev wallet that owns the tree).  The connected user
 * wallet is still the leaf owner and fee payer — it just doesn't need
 * to be the tree authority.
 */
export async function mintRealPassport(
  walletAdapter: WalletAdapter,
  profile: ReputationProfile,
): Promise<MintResult> {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }
  const owner = walletAdapter.publicKey.toBase58();

  // Always use the official collection + tree — no per-wallet config needed.
  const collectionMintAddr = OFFICIAL_COLLECTION_MINT;
  const merkleTreeAddr = OFFICIAL_MERKLE_TREE;

  const umi = buildUmi(walletAdapter);
  const collectionPk = toPublicKey(collectionMintAddr);
  const merkleTreePk = toPublicKey(merkleTreeAddr);

  const fullMetadata = buildOnChainMetadata(profile, {
    collectionMint: collectionMintAddr,
    merkleTree: merkleTreeAddr,
  });
  const metadataUri = await uploadMetadataJSON(fullMetadata);

  const ownerPk = toPublicKey(owner);

  // ── Tree-authority cosigner ───────────────────────────────────────────────
  // The official tree was created with public=false, so mintV2 requires
  // the tree creator / delegate to cosign.  VITE_TREE_DELEGATE_SECRET holds
  // the base58-encoded 64-byte keypair of the dev wallet that owns the tree.
  // This env var is bundled at build time (Vite VITE_ prefix) — never logged.
  const delegateSecret =
    (import.meta.env.VITE_TREE_DELEGATE_SECRET as string | undefined) ?? "";

  let treeDelegateSigner: ReturnType<typeof createSignerFromKeypair> | undefined;
  if (delegateSecret) {
    try {
      const secretBytes = bs58.decode(delegateSecret);
      const umiKeypair = umi.eddsa.createKeypairFromSecretKey(
        new Uint8Array(secretBytes),
      );
      treeDelegateSigner = createSignerFromKeypair(umi, umiKeypair);
    } catch {
      // Key parsing failed — mintV2 will fall back to umi.identity and
      // will surface TreeAuthorityIncorrect if the tree is non-public.
    }
  }

  const mintBuilder = mintV2(umi, {
    leafOwner: ownerPk,
    leafDelegate: ownerPk,
    merkleTree: merkleTreePk,
    coreCollection: collectionPk,
    ...(treeDelegateSigner
      ? { treeCreatorOrDelegate: treeDelegateSigner }
      : {}),
    metadata: {
      name: fullMetadata.name,
      symbol: "REPSOL",
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      primarySaleHappened: false,
      isMutable: true,
      tokenStandard: some(TokenStandard.NonFungible),
      collection: some(collectionPk),
      creators: [
        {
          address: ownerPk,
          verified: false,
          share: 100,
        },
      ],
    },
    assetData: none(),
    assetDataSchema: none(),
  });

  const mintRes = await mintBuilder.sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });
  const mintSignature = base58.deserialize(mintRes.signature)[0];

  const leaf = await parseLeafWithRetry(umi, mintRes.signature);
  const [assetIdPda] = findLeafAssetIdPda(umi, {
    merkleTree: merkleTreePk,
    leafIndex: leaf.nonce,
  });

  return {
    assetId: assetIdPda.toString(),
    mintSignature,
    freezeSignature: undefined as string | undefined,
    metadataUri,
    collectionMint: collectionMintAddr,
    merkleTree: merkleTreeAddr,
    network: "devnet",
  };
}

/**
 * Burn an old passport cNFT on-chain using Bubblegum V2 burnV2 instruction.
 * Requires DAS compression data to construct the proof.
 */
export async function burnPassportOnChain(
  walletAdapter: WalletAdapter,
  merkleTree: string,
  leafIndex: number,
  leafOwner: string,
  compressionData: {
    dataHash: Uint8Array;
    creatorHash: Uint8Array;
    root: Uint8Array;
  },
): Promise<string> {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }

  const umi = buildUmi(walletAdapter);
  const merkleTreePk = toPublicKey(merkleTree);
  const leafOwnerPk = toPublicKey(leafOwner);

  const burnBuilder = burnV2(umi, {
    merkleTree: merkleTreePk,
    root: compressionData.root,
    index: leafIndex,
    nonce: leafIndex,
    dataHash: compressionData.dataHash,
    creatorHash: compressionData.creatorHash,
    leafOwner: leafOwnerPk,
    leafDelegate: leafOwnerPk,
  });

  const burnRes = await burnBuilder.sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });

  return base58.deserialize(burnRes.signature)[0];
}

async function parseLeafWithRetry(
  umi: Umi,
  signature: Uint8Array,
  attempts = 12,
): Promise<{ nonce: bigint }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const tx = await umi.rpc.getTransaction(signature);
      if (tx) {
        return await parseLeafFromMintV2Transaction(umi, signature);
      }
    } catch (err) {
      lastErr = err;
      const msg = (err as Error)?.message ?? "";
      if (!/Could not get transaction|getTransaction|fetch/i.test(msg)) {
        throw err;
      }
    }
    const wait = Math.min(1500, 400 + i * 200);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(
    "Mint landed on-chain but the RPC indexer is lagging — refresh the page in a few seconds to see your passport. " +
      ((lastErr as Error)?.message ?? ""),
  );
}

export async function requestDevnetAirdrop(
  walletAdapter: WalletAdapter,
  amountSol = 1,
): Promise<string> {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const umi = buildUmi(walletAdapter);
  await umi.rpc.airdrop(toPublicKey(walletAdapter.publicKey.toBase58()), {
    basisPoints: BigInt(Math.round(amountSol * 1_000_000_000)),
    identifier: "SOL",
    decimals: 9,
  });
  return "ok";
}

export async function getDevnetBalance(address: string): Promise<number> {
  const umi = createUmi(getDevnetRpcUrl());
  const lamports = await umi.rpc.getBalance(toPublicKey(address));
  return Number(lamports.basisPoints) / 1e9;
}

export function explorerTx(sig: string, network: "devnet" | "mainnet-beta" = "devnet") {
  const cluster = network === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/tx/${sig}${cluster}`;
}

export function explorerAddress(addr: string, network: "devnet" | "mainnet-beta" = "devnet") {
  const cluster = network === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/address/${addr}${cluster}`;
}

export function solscanAsset(assetId: string, network: "devnet" | "mainnet-beta" = "devnet") {
  const cluster = network === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/token/${assetId}${cluster}`;
}

export type { UmiPublicKey };

/**
 * Real on-chain Metaplex Bubblegum V2 compressed NFT (cNFT) integration.
 *
 * All mints use the single official RepSolana collection + Merkle tree.
 * The "initialize" flow is no longer exposed to end users.
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
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
import { mplCore, createCollection } from "@metaplex-foundation/mpl-core";
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

/**
 * Maximum leaf capacity of the current Merkle tree.
 * Tree was created with maxDepth=5, so 2^5 = 32 slots total.
 */
export const TREE_MAX_CAPACITY = 32;

// ---------------------------------------------------------------------------
// RPC / Umi helpers
// ---------------------------------------------------------------------------

/** Devnet RPC. Honours VITE_HELIUS_RPC_URL if the user provides one. */
export function getDevnetRpcUrl(): string {
  const override =
    (import.meta.env.VITE_HELIUS_RPC_URL as string | undefined) || "";
  if (override) return override;
  const heliusKey =
    (import.meta.env.VITE_HELIUS_API_KEY as string | undefined) || "";
  if (heliusKey)
    return `https://devnet.helius-rpc.com/?api-key=${heliusKey}`;
  return "https://api.devnet.solana.com";
}

/** Build a Umi instance pointed at devnet, signed by the connected wallet. */
export function buildUmi(walletAdapter: WalletAdapter): Umi {
  return createUmi(getDevnetRpcUrl())
    .use(mplBubblegum())
    .use(mplCore())
    .use(walletAdapterIdentity(walletAdapter));
}

// ---------------------------------------------------------------------------
// Authority helpers
// ---------------------------------------------------------------------------

/**
 * Derive the public key from VITE_TREE_DELEGATE_SECRET without needing a
 * wallet connection or any RPC call. Used to show/hide the "Setup New
 * Merkle Tree" button — it is only shown when the connected wallet matches
 * the tree authority.
 *
 * Returns null if the env var is absent or unparseable.
 */
export function getTreeDelegatePublicKey(): string | null {
  const secret =
    (import.meta.env.VITE_TREE_DELEGATE_SECRET as string | undefined) ?? "";
  if (!secret) return null;
  try {
    const umi = createUmi(getDevnetRpcUrl());
    const secretBytes = bs58.decode(secret);
    const keypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(secretBytes),
    );
    // UmiPublicKey is a branded string — toString() gives the base58 address.
    return keypair.publicKey.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Capacity: count mints in the official collection via DAS
// ---------------------------------------------------------------------------

/**
 * Query total number of passports minted into the official collection.
 * Requires a DAS-capable RPC (Helius). Returns null on the public devnet
 * RPC or on any network error.
 */
export async function getTreeMintCount(): Promise<number | null> {
  const rpcUrl = getDevnetRpcUrl();
  // The vanilla devnet endpoint does not support DAS methods.
  if (/api\.devnet\.solana\.com/.test(rpcUrl)) return null;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "repsolana-capacity",
        method: "getAssetsByGroup",
        params: {
          groupKey: "collection",
          groupValue: OFFICIAL_COLLECTION_MINT,
          limit: 1,
          page: 1,
        },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { total?: number } };
    return typeof json.result?.total === "number" ? json.result.total : null;
  } catch {
    return null;
  }
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
 * No per-wallet initialization needed.
 */
export function getDevnetConfig(owner: string): DevnetCollectionConfig {
  return {
    owner,
    collectionMint: OFFICIAL_COLLECTION_MINT,
    merkleTree: OFFICIAL_MERKLE_TREE,
    createdAt: 0,
  };
}

/** No-op: kept for API compatibility. */
export function clearDevnetConfig(_owner: string): void {}

// ---------------------------------------------------------------------------
// Initialize: collection-authority use only — not exposed to end users
// ---------------------------------------------------------------------------

export interface InitResult {
  collectionMint: string;
  merkleTree: string;
  collectionSignature: string;
  treeSignature: string;
}

const TREE_MAX_DEPTH = 5;
const TREE_MAX_BUFFER = 8;

/** One-time setup for the collection authority only. */
export async function initializeDevnetCollection(
  walletAdapter: WalletAdapter,
): Promise<InitResult> {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const umi = buildUmi(walletAdapter);

  const collectionSigner = generateSigner(umi);
  const collectionRes = await createCollection(umi, {
    collection: collectionSigner,
    name: "RepSolana Soulbound Reputation Passport",
    uri: "https://repsolana.app/collection.json",
    plugins: [
      { type: "BubblegumV2" },
      { type: "PermanentFreezeDelegate", frozen: true },
    ],
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

  const merkleTreeSigner = generateSigner(umi);
  const treeRes = await (
    await createTreeV2(umi, {
      merkleTree: merkleTreeSigner,
      maxDepth: TREE_MAX_DEPTH,
      maxBufferSize: TREE_MAX_BUFFER,
      public: false,
    })
  ).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

  return {
    collectionMint: collectionSigner.publicKey.toString(),
    merkleTree: merkleTreeSigner.publicKey.toString(),
    collectionSignature: base58.deserialize(collectionRes.signature)[0],
    treeSignature: base58.deserialize(treeRes.signature)[0],
  };
}

// ---------------------------------------------------------------------------
// Create a new Merkle tree — authority only, called when current tree fills
// ---------------------------------------------------------------------------

export interface NewTreeResult {
  merkleTree: string;
  treeSignature: string;
}

/**
 * Create a fresh Merkle tree under the same official collection.
 * Only the tree authority (VITE_TREE_DELEGATE_SECRET wallet) should
 * call this. After creation, update OFFICIAL_MERKLE_TREE in this file.
 */
export async function createNewMerkleTree(
  walletAdapter: WalletAdapter,
): Promise<NewTreeResult> {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const umi = buildUmi(walletAdapter);

  const merkleTreeSigner = generateSigner(umi);
  const treeRes = await (
    await createTreeV2(umi, {
      merkleTree: merkleTreeSigner,
      maxDepth: TREE_MAX_DEPTH,
      maxBufferSize: TREE_MAX_BUFFER,
      public: false,
    })
  ).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

  return {
    merkleTree: merkleTreeSigner.publicKey.toString(),
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
 * Mint the user's RepSolana passport as a real on-chain compressed soulbound
 * NFT into the official RepSolana collection + Merkle tree.
 *
 * The official Merkle tree was created with `public: false`, so
 * treeCreatorOrDelegate must cosign every mintV2 call. We load that
 * keypair from VITE_TREE_DELEGATE_SECRET (base58-encoded 64-byte Solana
 * keypair of the dev wallet that owns the tree). The connected user wallet
 * is still the leaf owner and fee payer.
 *
 * Wallets that previously minted into a different (non-official) collection
 * are treated as new minters — the DAS lookup filters by official collection,
 * so old passports don't block a fresh mint here.
 */
export async function mintRealPassport(
  walletAdapter: WalletAdapter,
  profile: ReputationProfile,
): Promise<MintResult> {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const owner = walletAdapter.publicKey.toBase58();

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
  // the tree creator / delegate to cosign. VITE_TREE_DELEGATE_SECRET holds
  // the base58-encoded 64-byte keypair of the dev wallet that owns the tree.
  const delegateSecret =
    (import.meta.env.VITE_TREE_DELEGATE_SECRET as string | undefined) ?? "";

  let treeDelegateSigner:
    | ReturnType<typeof createSignerFromKeypair>
    | undefined;
  if (delegateSecret) {
    try {
      const secretBytes = bs58.decode(delegateSecret);
      const umiKeypair = umi.eddsa.createKeypairFromSecretKey(
        new Uint8Array(secretBytes),
      );
      treeDelegateSigner = createSignerFromKeypair(umi, umiKeypair);
    } catch {
      // Fall through — mintV2 will use umi.identity and surface
      // TreeAuthorityIncorrect if the tree is non-public.
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
      creators: [{ address: ownerPk, verified: false, share: 100 }],
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

// ---------------------------------------------------------------------------
// Burn
// ---------------------------------------------------------------------------

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
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const umi = buildUmi(walletAdapter);
  const burnRes = await burnV2(umi, {
    merkleTree: toPublicKey(merkleTree),
    root: compressionData.root,
    index: leafIndex,
    nonce: leafIndex,
    dataHash: compressionData.dataHash,
    creatorHash: compressionData.creatorHash,
    leafOwner: toPublicKey(leafOwner),
    leafDelegate: toPublicKey(leafOwner),
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return base58.deserialize(burnRes.signature)[0];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function parseLeafWithRetry(
  umi: Umi,
  signature: Uint8Array,
  attempts = 12,
): Promise<{ nonce: bigint }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const tx = await umi.rpc.getTransaction(signature);
      if (tx) return await parseLeafFromMintV2Transaction(umi, signature);
    } catch (err) {
      lastErr = err;
      const msg = (err as Error)?.message ?? "";
      if (!/Could not get transaction|getTransaction|fetch/i.test(msg))
        throw err;
    }
    await new Promise((r) =>
      setTimeout(r, Math.min(1500, 400 + i * 200)),
    );
  }
  throw new Error(
    "Mint landed on-chain but the RPC indexer is lagging — refresh the page in a few seconds to see your passport. " +
      ((lastErr as Error)?.message ?? ""),
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

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

export function explorerTx(
  sig: string,
  network: "devnet" | "mainnet-beta" = "devnet",
) {
  return `https://explorer.solana.com/tx/${sig}${network === "devnet" ? "?cluster=devnet" : ""}`;
}

export function explorerAddress(
  addr: string,
  network: "devnet" | "mainnet-beta" = "devnet",
) {
  return `https://explorer.solana.com/address/${addr}${network === "devnet" ? "?cluster=devnet" : ""}`;
}

export function solscanAsset(
  assetId: string,
  network: "devnet" | "mainnet-beta" = "devnet",
) {
  return `https://solscan.io/token/${assetId}${network === "devnet" ? "?cluster=devnet" : ""}`;
}

export type { UmiPublicKey };

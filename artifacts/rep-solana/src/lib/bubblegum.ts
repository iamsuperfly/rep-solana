import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity, type WalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { mplBubblegum, createTreeV2, mintV2, parseLeafFromMintV2Transaction, findLeafAssetIdPda, burnV2, TokenStandard } from "@metaplex-foundation/mpl-bubblegum";
import { mplCore, createCollection } from "@metaplex-foundation/mpl-core";
import { createSignerFromKeypair, generateSigner, publicKey as toPublicKey, some, none, type Umi, type PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import bs58 from "bs58";
import type { ReputationProfile } from "./solana";
import { buildOnChainMetadata, uploadMetadataJSON } from "./passport-metadata";

// ---------------------------------------------------------------------------
// Official RepSolana collection — all mints go here
// ---------------------------------------------------------------------------
export const OFFICIAL_COLLECTION_MINT = "2mLLJrgkntYd4i9UgFgtRQc7sXNAWVJxoQhyNZ5QN4ev";
export const OFFICIAL_MERKLE_TREE = "9CJRE5PWiy2PFZNrf6DecBqdBqDDNYVLsMHUi47BJPni";

/** 2^TREE_MAX_DEPTH = 32 leaf slots in the current Merkle tree. */
export const TREE_MAX_CAPACITY = 32;

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------
export function getDevnetRpcUrl(): string {
  const override = (import.meta.env.VITE_HELIUS_RPC_URL as string | undefined) || "";
  if (override) return override;
  const heliusKey = (import.meta.env.VITE_HELIUS_API_KEY as string | undefined) || "";
  if (heliusKey) return `https://devnet.helius-rpc.com/?api-key=${heliusKey}`;
  return "https://api.devnet.solana.com";
}

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
 * Derive the public key of the tree authority from VITE_TREE_DELEGATE_SECRET.
 * No RPC call needed — used to show/hide the "Setup New Merkle Tree" button.
 */
export function getTreeDelegatePublicKey(): string | null {
  const secret = (import.meta.env.VITE_TREE_DELEGATE_SECRET as string | undefined) ?? "";
  if (!secret) return null;
  try {
    const umi = createUmi(getDevnetRpcUrl());
    const secretBytes = bs58.decode(secret);
    const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretBytes));
    return keypair.publicKey.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Capacity: count minted passports in the official collection via DAS
// ---------------------------------------------------------------------------

/**
 * Query total mints in the official collection using getAssetsByGroup.
 * Returns null if no DAS-capable RPC is configured.
 */
export async function getTreeMintCount(): Promise<number | null> {
  const rpcUrl = getDevnetRpcUrl();
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

export function getDevnetConfig(owner: string): DevnetCollectionConfig {
  return { owner, collectionMint: OFFICIAL_COLLECTION_MINT, merkleTree: OFFICIAL_MERKLE_TREE, createdAt: 0 };
}

export function clearDevnetConfig(_owner: string): void {}

// ---------------------------------------------------------------------------
// One-time collection init (authority only)
// ---------------------------------------------------------------------------
export interface InitResult {
  collectionMint: string;
  merkleTree: string;
  collectionSignature: string;
  treeSignature: string;
}

const TREE_MAX_DEPTH = 5;
const TREE_MAX_BUFFER = 8;

export async function initializeDevnetCollection(walletAdapter: WalletAdapter): Promise<InitResult> {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const umi = buildUmi(walletAdapter);
  const collectionSigner = generateSigner(umi);
  const collectionRes = await createCollection(umi, {
    collection: collectionSigner,
    name: "RepSolana Soulbound Reputation Passport",
    uri: "https://repsolana.app/collection.json",
    plugins: [{ type: "BubblegumV2" }, { type: "PermanentFreezeDelegate", frozen: true }],
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
// Create a NEW Merkle tree — authority only, called when tree fills up
// ---------------------------------------------------------------------------
export interface NewTreeResult {
  merkleTree: string;
  treeSignature: string;
}

/**
 * Create a fresh tree under the existing official collection.
 * After creation, update OFFICIAL_MERKLE_TREE in this file and redeploy.
 */
export async function createNewMerkleTree(walletAdapter: WalletAdapter): Promise<NewTreeResult> {
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
// Mint
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

export async function mintRealPassport(
  walletAdapter: WalletAdapter,
  profile: ReputationProfile,
): Promise<MintResult> {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const owner = walletAdapter.publicKey.toBase58();
  const umi = buildUmi(walletAdapter);
  const collectionPk = toPublicKey(OFFICIAL_COLLECTION_MINT);
  const merkleTreePk = toPublicKey(OFFICIAL_MERKLE_TREE);
  const fullMetadata = buildOnChainMetadata(profile, {
    collectionMint: OFFICIAL_COLLECTION_MINT,
    merkleTree: OFFICIAL_MERKLE_TREE,
  });
  const metadataUri = await uploadMetadataJSON(fullMetadata);
  const ownerPk = toPublicKey(owner);

  const delegateSecret = (import.meta.env.VITE_TREE_DELEGATE_SECRET as string | undefined) ?? "";
  let treeDelegateSigner: ReturnType<typeof createSignerFromKeypair> | undefined;
  if (delegateSecret) {
    try {
      const secretBytes = bs58.decode(delegateSecret);
      const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretBytes));
      treeDelegateSigner = createSignerFromKeypair(umi, umiKeypair);
    } catch { /* fall through */ }
  }

  const mintBuilder = mintV2(umi, {
    leafOwner: ownerPk,
    leafDelegate: ownerPk,
    merkleTree: merkleTreePk,
    coreCollection: collectionPk,
    ...(treeDelegateSigner ? { treeCreatorOrDelegate: treeDelegateSigner } : {}),
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

  const mintRes = await mintBuilder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  const mintSignature = base58.deserialize(mintRes.signature)[0];
  const leaf = await parseLeafWithRetry(umi, mintRes.signature);
  const [assetIdPda] = findLeafAssetIdPda(umi, { merkleTree: merkleTreePk, leafIndex: leaf.nonce });

  return { assetId: assetIdPda.toString(), mintSignature, freezeSignature: undefined, metadataUri, collectionMint: OFFICIAL_COLLECTION_MINT, merkleTree: OFFICIAL_MERKLE_TREE, network: "devnet" };
}

// ---------------------------------------------------------------------------
// Burn
// ---------------------------------------------------------------------------
export async function burnPassportOnChain(
  walletAdapter: WalletAdapter,
  merkleTree: string,
  leafIndex: number,
  leafOwner: string,
  compressionData: { dataHash: Uint8Array; creatorHash: Uint8Array; root: Uint8Array },
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
async function parseLeafWithRetry(umi: Umi, signature: Uint8Array, attempts = 12): Promise<{ nonce: bigint }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const tx = await umi.rpc.getTransaction(signature);
      if (tx) return await parseLeafFromMintV2Transaction(umi, signature);
    } catch (err) {
      lastErr = err;
      const msg = (err as Error)?.message ?? "";
      if (!/Could not get transaction|getTransaction|fetch/i.test(msg)) throw err;
    }
    await new Promise((r) => setTimeout(r, Math.min(1500, 400 + i * 200)));
  }
  throw new Error("Mint landed on-chain but the RPC indexer is lagging — refresh in a few seconds. " + ((lastErr as Error)?.message ?? ""));
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export async function requestDevnetAirdrop(walletAdapter: WalletAdapter, amountSol = 1): Promise<string> {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  const umi = buildUmi(walletAdapter);
  await umi.rpc.airdrop(toPublicKey(walletAdapter.publicKey.toBase58()), { basisPoints: BigInt(Math.round(amountSol * 1_000_000_000)), identifier: "SOL", decimals: 9 });
  return "ok";
}

export async function getDevnetBalance(address: string): Promise<number> {
  const umi = createUmi(getDevnetRpcUrl());
  const lamports = await umi.rpc.getBalance(toPublicKey(address));
  return Number(lamports.basisPoints) / 1e9;
}

export function explorerTx(sig: string, network: "devnet" | "mainnet-beta" = "devnet") {
  return `https://explorer.solana.com/tx/${sig}${network === "devnet" ? "?cluster=devnet" : ""}`;
}
export function explorerAddress(addr: string, network: "devnet" | "mainnet-beta" = "devnet") {
  return `https://explorer.solana.com/address/${addr}${network === "devnet" ? "?cluster=devnet" : ""}`;
}
export function solscanAsset(assetId: string, network: "devnet" | "mainnet-beta" = "devnet") {
  return `https://solscan.io/token/${assetId}${network === "devnet" ? "?cluster=devnet" : ""}`;
}

export type { UmiPublicKey };
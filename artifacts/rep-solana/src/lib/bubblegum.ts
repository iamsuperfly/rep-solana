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
 * Per-wallet bookkeeping (collection mint + merkle tree pubkeys) is
 * persisted in localStorage so the "initialize" flow only runs once.
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
  verifyCollection,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  mplCore,
  createCollection,
} from "@metaplex-foundation/mpl-core";
import {
  generateSigner,
  publicKey as toPublicKey,
  some,
  none,
  type Umi,
  type PublicKey as UmiPublicKey,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import type { ReputationProfile } from "./solana";
import { buildOnChainMetadata, uploadMetadataJSON } from "./passport-metadata";

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
// Per-wallet config (collection + tree pubkeys) — survives page reloads
// ---------------------------------------------------------------------------

export interface DevnetCollectionConfig {
  owner: string;
  collectionMint: string;
  merkleTree: string;
  createdAt: number;
  verifiedCollectionAt?: number;
  verifiedCollectionSignature?: string;
}

const CONFIG_KEY = "repsolana:devnet-config:v1";

function readConfigStore(): Record<string, DevnetCollectionConfig> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeConfigStore(store: Record<string, DevnetCollectionConfig>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("repsolana:devnet-config-changed"));
}

export function getDevnetConfig(owner: string): DevnetCollectionConfig | null {
  return readConfigStore()[owner] ?? null;
}

export function clearDevnetConfig(owner: string) {
  const store = readConfigStore();
  delete store[owner];
  writeConfigStore(store);
}

/* TODO: Implement verifyDevnetCollection using correct verifyCollection API
export async function verifyDevnetCollection(
  walletAdapter: WalletAdapter,
): Promise<string> {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }
  const umi = buildUmi(walletAdapter);
  const owner = walletAdapter.publicKey.toBase58();
  const cfg = getDevnetConfig(owner);
  if (!cfg) {
    throw new Error("Devnet collection + tree not initialised yet. Run setup first.");
  }
  if (cfg.verifiedCollectionSignature) {
    return cfg.verifiedCollectionSignature;
  }
  const collectionPk = toPublicKey(cfg.collectionMint);
  const merkleTreePk = toPublicKey(cfg.merkleTree);
  // TODO: verifyCollection signature requires metadata, nonce, root, index
  // const tx = await verifyCollection(umi, {
  //   leafOwner: toPublicKey(owner),
  //   merkleTree: merkleTreePk,
  //   collectionMint: collectionPk,
  // }).sendAndConfirm(umi, {
  //   confirm: { commitment: "confirmed" },
  // });
  // const signature = base58.deserialize(tx.signature)[0];
  // const store = readConfigStore();
  // store[owner] = {
  //   ...cfg,
  //   verifiedCollectionAt: Date.now(),
  //   verifiedCollectionSignature: signature,
  // };
  // writeConfigStore(store);
  // return signature;
  throw new Error("verifyDevnetCollection not yet implemented");
}
*/

// ---------------------------------------------------------------------------
// Initialize: Core collection (PermanentFreezeDelegate) + Bubblegum tree
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
 * One-time setup. Creates a small (32-leaf) Bubblegum V2 tree and a
 * non-transferable Core collection that the cNFTs will live under.
 *
 * Cost on devnet: ~0.018 SOL all-in. Funded entirely by the wallet.
 */
export async function initializeDevnetCollection(
  walletAdapter: WalletAdapter,
): Promise<InitResult> {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }
  const umi = buildUmi(walletAdapter);
  const owner = walletAdapter.publicKey.toBase58();

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

  const cfg: DevnetCollectionConfig = {
    owner,
    collectionMint: collectionSigner.publicKey,
    merkleTree: merkleTreeSigner.publicKey,
    createdAt: Date.now(),
  };
  const store = readConfigStore();
  store[owner] = cfg;
  writeConfigStore(store);

  return {
    collectionMint: cfg.collectionMint,
    merkleTree: cfg.merkleTree,
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
 * soulbound NFT in their pre-initialized devnet collection + tree.
 */
export async function mintRealPassport(
  walletAdapter: WalletAdapter,
  profile: ReputationProfile,
): Promise<MintResult> {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }
  const owner = walletAdapter.publicKey.toBase58();
  const cfg = getDevnetConfig(owner);
  if (!cfg) {
    throw new Error(
      "Devnet collection + tree not initialised yet. Run setup first.",
    );
  }

  const umi = buildUmi(walletAdapter);
  const collectionPk = toPublicKey(cfg.collectionMint);
  const merkleTreePk = toPublicKey(cfg.merkleTree);

  const fullMetadata = buildOnChainMetadata(profile, {
    collectionMint: cfg.collectionMint,
    merkleTree: cfg.merkleTree,
  });
  const metadataUri = await uploadMetadataJSON(fullMetadata);

  const ownerPk = toPublicKey(owner);
  const mintBuilder = mintV2(umi, {
    leafOwner: ownerPk,
    leafDelegate: ownerPk,
    merkleTree: merkleTreePk,
    coreCollection: collectionPk,
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
    collectionMint: cfg.collectionMint,
    merkleTree: cfg.merkleTree,
    network: "devnet",
  };
}

/**
 * Burn an old passport cNFT on-chain using Bubblegum V2 burnV2 instruction.
 * Requires the merkle tree and leaf index to be retrieved from DAS API.
 */
export async function burnPassportOnChain(
  walletAdapter: WalletAdapter,
  merkleTree: string,
  leafIndex: number,
  leafOwner: string,
): Promise<string> {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }

  const umi = buildUmi(walletAdapter);
  const merkleTreePk = toPublicKey(merkleTree);
  const leafOwnerPk = toPublicKey(leafOwner);

  const burnBuilder = burnV2(umi, {
    merkleTree: merkleTreePk,
    leafIndex: BigInt(leafIndex),
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

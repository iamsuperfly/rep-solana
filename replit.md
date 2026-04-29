# RepSolana — Dynamic On-Chain Reputation Passport

Solana dApp built for the Colosseum Frontier Hackathon. Wallets connect, the
app reads their on-chain history live, computes a 0–100 reputation score,
and lets them mint a soulbound compressed-NFT passport that's shareable
anywhere.

## Stack

- React 19 + TypeScript + Vite (single artifact at `artifacts/rep-solana`, served at `/`)
- Wallet adapter: `@solana/wallet-adapter-react` (+ Phantom, Solflare)
- Solana RPC: `@solana/web3.js` against a CORS-friendly public endpoint
  (`solana-rpc.publicnode.com`). Override via `VITE_HELIUS_API_KEY` env var.
- Routing: `wouter` (uses `import.meta.env.BASE_URL` for the base path)
- UI: shadcn/ui + Tailwind v4 + framer-motion
- Polyfills: `vite-plugin-node-polyfills` provides Buffer/process/crypto for
  Solana web3 in the browser.

## Why React+Vite (not Next.js)

The original spec called for Next.js 14 + Privy. We pivoted to React+Vite
because the entire app is client-side (RPC reads + wallet signing) — no SSR
benefit, faster builds, no notorious Next.js + web3 polyfill issues. The
final UX, on-chain interactions, and metadata format are unchanged.

## Architecture

```
artifacts/rep-solana/
  src/
    lib/
      solana.ts        # RPC + 7-component reputation algorithm + 10 badges
      passport.ts      # Metaplex-compatible metadata + sign-message "mint"
      format.ts        # Address shortening / time-ago helpers
    hooks/
      use-reputation.ts # Lazy RPC fetch + refresh
      use-passport.ts   # localStorage subscription
    components/
      SolanaProvider.tsx       # Wallet adapter root
      WalletConnectButton.tsx  # Custom-styled connect / dropdown
      Navbar.tsx
      ScoreGauge.tsx           # Animated radial gauge
      ScoreBreakdown.tsx       # Per-component bars
      BadgeGrid.tsx            # 10 badges with rarity tiers
      PassportCard.tsx         # Shareable passport hero
      TxActivityList.tsx       # Recent on-chain activity
      EndorseDialog.tsx        # Real 0.001 SOL transfer + memo
      CollateralDemo.tsx       # Kamino / MarginFi LTV simulator
      MintPassportButton.tsx   # SignMessage-based mint
    pages/
      Landing.tsx             # Hero + features + CTA
      Dashboard.tsx           # Connected user view
      PassportProfile.tsx     # /p/<wallet> shareable profile
```

### Reputation scoring

Seven transparent components (each capped, sum = 0–100):

| Component        | Max | Source                         |
|------------------|-----|--------------------------------|
| Wallet age       | 20  | Oldest tx blockTime            |
| Activity volume  | 25  | Total recent txs (cap 200)     |
| Reliability      | 10  | Success rate × 10              |
| DeFi engagement  | 15  | Jupiter/Orca/Raydium/Kamino…   |
| Staking          | 10  | Native stake / Marinade / Jito |
| NFT culture      | 10  | Magic Eden / Tensor / Bubblegum|
| Diversity        | 10  | Unique program count           |

### Passport "mint"

For the demo we build the full Metaplex-compatible cNFT metadata
(score, badges, breakdown, attributes, embedded SVG image), then ask the
wallet to `signMessage` the canonical metadata. The signed passport is
stored in localStorage.

To upgrade to real on-chain mints, swap `lib/passport.ts:mintPassport`
for a Bubblegum `mintToCollectionV1` call — the metadata format is already
correct.

### Endorsements

Real `SystemProgram.transfer` of 0.001 SOL plus a Memo-program instruction
carrying the endorsement message. Defaults to mainnet via the wallet —
users can switch to devnet in Phantom/Solflare to test for free.

## Local dev

```bash
pnpm install
pnpm --filter @workspace/rep-solana dev
```

Open the preview URL (workflow `artifacts/rep-solana: web`).

## Env vars

- `VITE_HELIUS_API_KEY` (optional) — uses Helius for RPC instead of the
  public CORS-friendly endpoint. Strongly recommended for any volume.

## Deployment

Static build via `pnpm --filter @workspace/rep-solana build`. The
`vite-plugin-node-polyfills` plugin handles Buffer/process bundling for
production. Output goes to `artifacts/rep-solana/dist/public`.

## Repo hygiene

`attached_assets/` is git-ignored. Replit Agent and contributors occasionally
drop ad-hoc debug screenshots / pasted images there during a session — never
commit those files. If a screenshot is genuinely part of the product (e.g. a
README hero image) move it under `artifacts/rep-solana/public/` (or the
appropriate package's `public/`) and reference it from there.

The pnpm lockfile delta in any future PR should be limited to the package(s)
you actually changed. If you see unrelated version churn (e.g. `@noble/curves`
or `ethereum-cryptography` bouncing) it usually means a sub-dep was bumped
out of catalog — investigate before merging.

## Public verification page

`/verify` (and `/verify/<wallet>`) is the no-wallet-connection-required
public verifier. It calls Helius DAS `getAssetsByOwner`, filters down to
RepSolana cNFTs (symbol `REPSOL` + compressed + RepSolana Core collection),
re-renders the on-chain score / tier / badges / breakdown, and exposes the
asset id, merkle tree, collection mint, and metadata URI as Solana Explorer
+ Solscan deep links so any third party can independently confirm both the
soulbound (frozen at the collection) and compressed (Bubblegum V2)
guarantees. Requires a DAS-capable RPC (Helius) — set `VITE_HELIUS_API_KEY`
or pass `?heliusKey=…` in the URL for one-off checks. See
`artifacts/rep-solana/src/lib/das.ts` and `src/pages/Verify.tsx`.

## Twitter / X sharing

`<ShareOnX>` (`src/components/ShareOnX.tsx`) opens the official X intent URL
with a pre-filled tweet (score, tier, top badges, share link, Solana /
ColosseumFrontier / RepSolana hashtags). Available on the public passport
profile (`/p/<wallet>`) and on the Verify result panel.

## @noble/hashes resolution (Stage 2 cNFT minting)

The Metaplex Bubblegum/Core stack pulls in multiple @noble/hashes versions
that are mutually incompatible at the bundler level:

- `mpl-bubblegum@5` and `mpl-core@1.10` (resolved via the `_@noble+hashes@2.2.0`
  pnpm peer variant) `require("@noble/hashes/sha3")` — bare specifier that v2
  no longer exports.
- `@noble/curves@1.9` uses `require("@noble/hashes/utils")` AND calls the
  newer `ahash` export only added in v1.7+.
- `ethereum-cryptography@2.2.1` does `import assert from "@noble/hashes/_assert"`
  which only works against v1.x where `_assert` ships a default export
  (removed/deprecated in 1.7+).

`vite.config.ts` therefore aliases every bare `@noble/hashes/<sub>` specifier
to absolute file paths inside the pnpm store:

- `_assert` → `@noble+hashes@1.5.0/_assert.js` (still has the `assert` default).
- everything else (`sha2`, `sha3`, `hmac`, `utils`, etc.) →
  `@noble+hashes@1.8.0/<sub>.js` (has both `ahash` and the back-compat
  `wrapConstructor` aliases).

`@noble/hashes@1.5.0` is added as a direct dep of `@workspace/rep-solana` so
those pnpm folders are guaranteed to be installed. Do NOT add a global
`pnpm.overrides` for `@noble/hashes` — it breaks `ethereum-cryptography` and
`@noble/curves` simultaneously.

## On-chain name format (Stage 7 — v3 passport)

Solana's Bubblegum `MetadataArgsV2.name` field has a HARD 32-byte limit;
anything longer is silently truncated by the SDK and the truncated string
is what the leaf hash commits to ON-CHAIN forever. Our v2 format
(`RepSolana Passport · Active · 50` = 34 bytes) lost the score on every
mint, leaving on-chain `name = "RepSolana Passport · Active"` with no way
to recover the score from chain.

v3 uses `RepSolana #{score} · {tier}` — score appears immediately after
`#` and the entire string fits even at the worst case
(`RepSolana #100 · Legendary` = 26 bytes). `parseScoreFromAsset` reads
that as canonical truth and returns `null` (NOT `0`) when no parser
matches, so the UI can offer a one-time **Migrate Passport** flow for
v2-era passports rather than looping the user through false update
prompts.

Other Stage-7 hardenings:

- `findRepSolanaPassportForWallet(addr, expected)` filters candidates by
  the wallet's known collection/tree first, then prefers parseable scores,
  then highest leaf id — fixes "wrong asset wins" when a wallet has many
  test passports across multiple trees.
- `persistRealMintedPassport(profile, cnft, { preserveTimestamps: true })`
  keeps the original `mintedAt` and `metadata.repsolana.issuedAt` when
  hydrating from chain, so the UI no longer reissues the date on every
  wallet reconnect.
- `MintPassportButton` cold-loads from a 60s sessionStorage cache (no
  initial spinner if recent), then refreshes silently in the background.
- After a fresh mint, hydration polls DAS up to 30s for the just-minted
  asset id and ignores stale answers that would roll back the optimistic
  state during devnet indexer lag.
- The button now accepts `liveLoading` from Dashboard so it can suppress
  the "Update Passport" prompt while the live profile is still resolving.

GitHub repo: https://github.com/iamsuperfly/rep-solana

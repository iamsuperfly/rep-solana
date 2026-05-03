# RepSolana · Solana Reputation Passport

**One passport. Every Solana dApp.** Build trust on Solana with soulbound cNFTs, transparent reputation scoring, and on-chain endorsements.

Deployed live: https://rep-solana.vercel.app  
GitHub repo: https://github.com/iamsuperfly/rep-solana

---

## What is RepSolana?

RepSolana turns anonymous wallets into trusted citizens by computing a transparent reputation score (0–100) from seven on-chain signals, issuing a soulbound compressed NFT (cNFT) passport, and letting the network endorse wallets with real SOL transfers + verifiable signatures.

### Four Core Primitives

1. **Live On-Chain Score** — Wallet age, DeFi usage, staking, NFT culture, and reliability fold into a single transparent 0–100 number recomputed from RPC every visit.
2. **Soulbound cNFT Passport** — One click mints a Metaplex compressed NFT to your wallet with score, badges, and verifiable claims in the metadata.
3. **On-Chain Endorsements** — Anyone with a score ≥ 50 can endorse a wallet by sending 0.001 SOL + an optional memo. Endorsements compound your trust score.
4. **Use as Collateral** — Plug higher reputation into Kamino, MarginFi, and other protocols. Higher reputation → higher LTV, lower APR.

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- A Solana wallet (Phantom, Solflare, Backpack)

### Installation

```bash
git clone https://github.com/iamsuperfly/rep-solana.git
cd rep-solana
pnpm install
pnpm run dev
```

Visit `http://localhost:5173` (or the assigned port).

### Deploying to Vercel

```bash
vercel deploy
```

The repo includes `vercel.json` for SPA routing, so `/p/<address>` URLs work correctly.

---

## Architecture

### Frontend Stack

- **React 18** + TypeScript
- **Vite** for dev/build
- **Tailwind CSS** + shadcn/ui for styling
- **Solana Web3.js** for RPC and wallet integration
- **Metaplex Bubblegum V2** for compressed NFT minting

### Scoring Algorithm

The reputation score (0–100) is computed from:

| Component | Weight | Logic |
|-----------|--------|-------|
| **Wallet Age** | 15% | 0–4 years → 0–100 |
| **Transaction Volume** | 15% | Lifetime SOL moved (0–100k SOL) |
| **Reliability** | 15% | Successful txs / all txs attempted |
| **DeFi Activity** | 15% | Swap/lending/staking presence |
| **Staking Score** | 15% | Cumulative staked SOL (0–100k SOL) |
| **NFT Culture** | 10% | NFT count (0–100) |
| **Network Diversity** | 15% | Interaction with ≥5 unique programs |

Scores are **recomputed on every visit** from public RPC data (Mainnet and Devnet). No indexing required.

### Endorsement System

- **One active endorsement per endorser per wallet** (new endorsements replace old ones).
- **Max 5 active endorsements per wallet** (oldest drop off).
- **Minimum endorser score: 50** to send endorsements.
- **Endorsement weight = endorser score / 100** (weighted contribution to leaderboard).

Endorsements are **on-chain transfers** (0.001 SOL) with optional memo. Signatures are recorded and verifiable on Solscan.

### Soulbound cNFT Minting

- **Bubblegum V2** compressed NFT with **PermanentFreezeDelegate** plugin for soulbound enforcement.
- **Per-wallet collection setup** on devnet with verifiable collection signatures.
- **On-chain metadata** includes score, badges, and Solscan links.
- **Metadata locked to passport address** — one per wallet.

---

## Features

### Dashboard
- View your passport score and badges
- See the network leaderboard (top 10 by score → endorsement weight → count)
- Mint or refresh your soulbound cNFT passport

### Public Profiles (`/p/<address>`)
- Browse any wallet's reputation passport
- See who endorsed them + endorser scores
- Send endorsements (0.001 SOL + optional memo)
- View leaderboard rankings

### Endorsement History
- **"Who Endorsed Me"** — See all received endorsements with endorser scores and timestamps
- **"Who I've Endorsed"** — (Logged-in users) View all wallets you've endorsed and their scores

---

## Development

### Running Locally

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

### Key Files

- **`src/lib/passport.ts`** — Core scoring, endorsement, and leaderboard logic
- **`src/lib/bubblegum.ts`** — Metaplex Bubblegum cNFT minting (devnet)
- **`src/lib/reputation.ts`** — On-chain score calculation from RPC
- **`src/pages/PassportProfile.tsx`** — Public profile view with endorsement history
- **`src/pages/Dashboard.tsx`** — User dashboard with leaderboard
- **`public/api/meta.js`** — Vercel Edge function for passport metadata (cNFT)

### Supported Networks

- **Devnet** — Recommended for testing (free SOL faucet)
- **Mainnet** — Real on-chain passports and endorsements

Switch networks in the app UI. Testnet is the default for safety.

---

## Scoring & Reputation

### How Your Score Changes

- **Wallet age** increases automatically as your account ages
- **Transaction volume** grows with every SOL transfer and swap
- **Reliability** improves with confirmed txs (failed txs lower it)
- **DeFi activity** unlocked by using Serum, Kamino, Raydium, etc.
- **Staking** grows with SOL locked in validators
- **NFTs** counted from your current holdings
- **Network diversity** measured by unique program interactions

**Score is recomputed fresh every page load** from Helius RPC (configurable). No caching or delays.

### Endorsements Boost Your Leaderboard Rank

- Endorsements don't directly increase your score but rank you higher on the leaderboard
- The **leaderboard sorts by**: score → endorsement weight → endorsement count
- Your network becomes your collateral — high endorsement weight = high visibility

---

## Future Roadmap

- [ ] **On-chain indexing** — Full Solana on-chain endorsement registry with RPC subscriptions
- [ ] **Proof of history verification** — Anchor + SPL programs for verifiable passport state
- [ ] **Lending integrations** — Kamino & MarginFi collateral plugs
- [ ] **Badge marketplace** — Custom badges minted by protocols and communities
- [ ] **Multi-chain expansion** — Bring reputation to Ethereum, Polygon, etc.

---

## Contributing

We're open-sourced under MIT. PRs welcome!

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to your fork (`git push origin feature/my-feature`)
5. Open a PR against `main`

---

## License

MIT © 2025 RepSolana

---

## Resources

- [Solana Docs](https://docs.solana.com/)
- [Metaplex Bubblegum V2](https://developers.metaplex.com/bubblegum)
- [Helius RPC](https://www.helius.dev/)
- [Phantom Wallet](https://phantom.app/)
- [Solscan](https://solscan.io/)

---

Built for the **Colosseum Frontier Hackathon**. Let's rebuild trust on Solana.

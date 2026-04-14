# MealCoin

**Group 6** — Bryce Clement (Scrum Master) · Logan Sichelstiel (Product Owner) · Lucy Budde · Robert Oliver

A blockchain-backed peer-to-peer marketplace for Davidson College meal swipes. Students can buy, sell, send, and redeem meal swipes through a web app. Every transaction is enforced by smart contracts — fake listings are structurally impossible, and all swipes in circulation are backed by on-chain escrow. Unused swipes are burned at the end of each week.

**Live app:** [meal-coin.vercel.app](https://meal-coin-five.vercel.app/)  
**Network:** Base Mainnet (Chain ID 8453)

---

## Table of Contents

1. [Problem & Solution](#problem--solution)
2. [System Architecture](#system-architecture)
3. [Smart Contracts](#smart-contracts)
4. [Indexer](#indexer)
5. [Backend API](#backend-api)
6. [Frontend](#frontend)
7. [User Flows](#user-flows)
8. [Database Schema](#database-schema)
9. [Deployed Addresses](#deployed-addresses)
10. [Local Development](#local-development)

---

## Problem & Solution

Davidson College students on a meal plan receive a fixed number of swipes per week. Two problems exist simultaneously:

- Students who travel or eat off-campus accumulate **unused swipes that expire every Saturday night**.
- Students who eat on campus frequently **run out of swipes mid-week** and pay out of pocket.

MealCoin solves both sides by creating a trusted, verifiable peer-to-peer marketplace. Because every listing is backed by on-chain escrow, fake offers are structurally impossible — a seller cannot list swipes they do not hold.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  BROWSER (Next.js — Vercel)                                      │
│                                                                  │
│  /           Dashboard    Balance · Send Swipe · Send USDC       │
│  /listings   Marketplace  Browse · Post offer · Accept offer     │
│  /redeem     Redemption   Student QR code · Dining terminal scan │
│  /onboarding Auth         Davidson email verification            │
│  /history    History      Trade + redemption log                 │
│                                                                  │
│  Smart Account: Kernel (ERC-4337) via Coinbase Wallet            │
│  Gas: Sponsored by Pimlico paymaster                             │
└──────────────┬───────────────────────────────────────────────────┘
               │ REST (fetch)
┌──────────────▼───────────────────────────────────────────────────┐
│  NEXT.JS API ROUTES (same Vercel deployment)                     │
│                                                                  │
│  GET  /api/asks          GET  /api/bids                          │
│  GET  /api/trades        GET  /api/redemptions                   │
│  GET  /api/students      GET  /api/health                        │
│  POST /api/verify        GET  /api/verify/confirm                │
│  GET  /api/verify/finalize                                       │
│  GET  /api/wallet/[addr]/history                                 │
│                                                                  │
│  All reads come from Supabase. No API route writes directly.     │
└──────────────┬───────────────────────────────────────────────────┘
               │ Supabase JS client
┌──────────────▼──────────────┐    ┌─────────────────────────────┐
│  SUPABASE (PostgreSQL)      │◄───│  INDEXER (Railway)          │
│                             │    │                             │
│  students                   │    │  Node.js + Viem             │
│  offers                     │    │  Polls Alchemy every 5s     │
│  trades                     │    │  Decodes events             │
│  redemptions                │    │  Upserts to Supabase        │
│  verification_tokens        │    │  Runs Saturday cron         │
└─────────────────────────────┘    └──────────────┬──────────────┘
                                                  │ viem getLogs()
┌─────────────────────────────────────────────────▼──────────────┐
│  BASE MAINNET (via Alchemy RPC)                                 │
│                                                                 │
│  MealSwipeToken  0x32912D61e207282a2E08B56bf92a58ecDf716E92    │
│  Marketplace     0xA030C790F2509C653fd7856092eE758aB8f6b360    │
│  USDC (Circle)   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913   │
└─────────────────────────────────────────────────────────────────┘
```

### Request path for a typical action

```
Student clicks "Redeem Swipe"
  → kernelClient.writeContract()          (frontend, ERC-4337 user op)
  → Pimlico bundler sponsors gas
  → MealSwipeToken.redeemSwipe() fires    (Base mainnet)
  → SwipeRedeemed event emitted
  → Indexer polls getLogs() within 5s
  → Indexer upserts redemption row        (Supabase)
  → /api/redemptions reflects new row     (next frontend fetch)
```

---

## Smart Contracts

Contracts are written in Solidity, tested with Foundry, and deployed to Base Mainnet.

### MealSwipeToken

**Address:** `0x32912D61e207282a2E08B56bf92a58ecDf716E92`

An ERC-20-style token where balances are scoped to `(address, weekEpoch)` pairs. One week epoch = `block.timestamp / 7 days`. This means balances from prior weeks are permanently inaccessible once the week rolls over, enforcing the dining system's weekly expiry rule.

**Key design choice:** Decimals = 0. One token = one meal swipe. No fractional swipes.

#### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `mint(address, amount, week)` | Owner only | Issues swipes to a student for a given week. Max 6 per call. |
| `burnAll(uint256 week)` | Owner only | Marks a week as burned — all balances for that week become 0. Emits `SwipesBurned`. |
| `transfer(address, amount)` | Any holder | Sends swipes to another wallet for the current week. |
| `transferFrom(address, address, amount)` | Approved spender | Marketplace uses this to move swipes into escrow. |
| `approve(address, amount)` | Any holder | Grants the Marketplace (or any address) spending rights. |
| `redeemSwipe(address wallet)` | Approved dining terminals only | Burns exactly 1 swipe from the student's wallet. Called at the dining hall. |
| `approveDining(address)` | Owner only | Registers a wallet as an authorized dining terminal. |
| `revokeDining(address)` | Owner only | Removes dining authorization. |
| `balanceOf(address, week)` | View | Returns balance for a specific week. Returns 0 if the week has been burned. |
| `getCurrentWeek()` | View | Returns `block.timestamp / 7 days`. |

#### Events

| Event | When |
|-------|------|
| `Mint(to, amount, week)` | Swipes issued to a student |
| `Transfer(from, to, amount, week)` | Swipes sent peer-to-peer |
| `SwipeRedeemed(wallet, week)` | 1 swipe burned at dining hall |
| `SwipesBurned(week, totalBurned)` | Weekly epoch cleared |
| `DiningApproved(diningAddress)` | Terminal registered |
| `DiningRevoked(diningAddress)` | Terminal removed |

#### Errors

`NotOwner` · `NotApprovedDining` · `InsufficientBalance` · `InsufficientAllowance` · `InvalidAmount` · `ZeroAddress` · `EpochAlreadyBurned(week)`

---

### Marketplace

**Address:** `0xA030C790F2509C653fd7856092eE758aB8f6b360`

An escrow contract for peer-to-peer swipe trading. Both ask (sell) and bid (buy) offers are supported. Assets are held in the contract until the offer is accepted or cancelled.

**Business rules enforced on-chain:**
- Max 6 swipes per offer
- Max $12.00 USDC price per swipe (12,000,000 in 6-decimal units)
- Seller must hold swipes before listing (transferFrom at offer creation)
- Buyer must hold USDC before bidding (transferFrom at offer creation)
- Offers expire at the next Saturday 11:59 PM EST — matching the token's weekly reset

#### Offer lifecycle

```
createSellOffer / createBuyOffer
  → assets transferred to Marketplace escrow
  → OfferCreated emitted
  → status: Pending

acceptOffer(offerId)
  → atomic swap executes
  → assets transferred to counterparty
  → OfferAccepted emitted
  → status: Accepted

cancelOffer(offerId)
  → creator gets assets back
  → OfferCancelled emitted
  → status: Cancelled

claimExpiredOffer(offerId)
  → callable by anyone after expiry
  → assets returned to creator
  → OfferExpired emitted
  → status: Expired
```

#### Functions

| Function | Description |
|----------|-------------|
| `createSellOffer(swipeCount, pricePerSwipe)` | Escrows seller's swipes. Returns `offerId`. |
| `createBuyOffer(swipeCount, pricePerSwipe)` | Escrows buyer's USDC. Returns `offerId`. |
| `acceptOffer(offerId)` | Executes the swap atomically. Checks-Effects-Interactions pattern. |
| `cancelOffer(offerId)` | Creator reclaims escrowed assets. |
| `claimExpiredOffer(offerId)` | Anyone can trigger return of assets after expiry (used by the indexer cron). |
| `getOffer(offerId)` | Returns full offer struct. |

---

## Indexer

The indexer is a standalone Node.js process deployed to Railway. It is the only service that writes to Supabase — the API routes are all read-only.

### How it works

1. On startup, records the current block number
2. Every 5 seconds, polls the Alchemy RPC for new logs from both contracts
3. Fetches logs in chunks of 500 blocks
4. Decodes each log with viem and routes it to the appropriate handler
5. Each handler upserts to Supabase with retry logic (exponential backoff, up to 5 attempts)
6. Persists the last processed block to survive restarts

### Event handlers

| Event | Handler | DB Write |
|-------|---------|----------|
| `OfferCreated` | `offerCreated.ts` | Inserts row into `offers` (status=pending) |
| `OfferAccepted` | `offerAccepted.ts` | Updates `offers` status, inserts into `trades` |
| `OfferCancelled` | `offerCancelled.ts` | Updates `offers` status=cancelled |
| `OfferExpired` | `offerExpired.ts` | Updates `offers` status=expired |
| `SwipeRedeemed` | `swipeRedeemed.ts` | Inserts row into `redemptions` |
| `SwipesBurned` | `swipesBurned.ts` | Calls `db.expireAllPendingOffers()` — marks all pending offers expired |

### Saturday cron job

The indexer runs a cron job at **Sunday 04:56 UTC (11:56 PM EST Saturday)** that:
1. Queries Supabase for all pending offers where `expires_at < now`
2. Calls `claimExpiredOffer(offerId)` on the contract for each
3. Retries 3 times per offer on failure

This is what triggers `OfferExpired` events, which the indexer then catches in the normal polling loop.

---

## Backend API

All API routes are Next.js Route Handlers in `frontend/app/api/`. All reads come from Supabase. No route writes to Supabase directly.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check — queries students table |
| `GET` | `/api/asks` | Active sell offers, price ascending |
| `GET` | `/api/bids` | Active buy offers, price descending |
| `GET` | `/api/trades?wallet=` | Completed trades, optionally filtered by wallet |
| `GET` | `/api/redemptions?wallet=` | Dining hall redemptions, optionally filtered by wallet |
| `GET` | `/api/students?wallet=` | Check if a wallet address is verified |
| `GET` | `/api/wallet/[address]/history` | Combined trade + redemption history, sorted by timestamp |
| `POST` | `/api/verify` | Begin email verification (generates token, sends email) |
| `GET` | `/api/verify/confirm?token=` | Validates token, links wallet to email, returns HTML |
| `GET` | `/api/verify/finalize` | Called after email click to complete onboarding |

### Ask/Bid response shape

```json
{
  "asks": [
    {
      "offer_id": "uuid",
      "onchain_offer_id": "3",
      "seller_address": "0x...",
      "swipe_count": 2,
      "price_per_swipe": "7.50",
      "expires_at": "2025-04-05T23:59:00Z",
      "tx_hash": "0x..."
    }
  ]
}
```

---

## Frontend

Built with Next.js (App Router), React 19, Tailwind CSS v4, wagmi v3, viem v2, and shadcn/ui components.

### Smart account (ERC-4337)

Every student interacts via a **Kernel smart account** (ZeroDev SDK), not their raw EOA. This enables:
- **Gas sponsorship** — Pimlico paymaster covers gas fees; students pay nothing
- **Simplified UX** — no MetaMask gas prompts
- The smart account address is derived from the EOA and cached in localStorage

```
User's Coinbase Wallet (EOA)
  → SmartAccountContext builds Kernel account
  → kernelClient.writeContract() wraps calls as ERC-4337 UserOperations
  → Pimlico bundler submits to Base mainnet
  → Gas sponsored by Pimlico paymaster
```

### Pages

#### `/` — Dashboard

- **BalanceCard:** Reads `balanceOf(smartAddress, currentWeek)` from the token contract. Displays available swipes.
- **ExpiryCountdown:** Counts down to the next Saturday 11:59 PM reset.
- **SendSwipeModal:** Calls `transfer(to, amount)` on MealSwipeToken to send swipes peer-to-peer.
- **SendUSDCModal:** Calls USDC `transfer(to, amount)` to send USDC to another wallet.

#### `/listings` — Marketplace

- Fetches active asks from `/api/asks` and bids from `/api/bids`
- **Create offer modal:** User selects Ask or Bid, enters swipe count and price. Requires prior `approve()` call to the Marketplace contract.
  - Sell offer: calls `createSellOffer(swipeCount, pricePerSwipe)` — swipes move to escrow
  - Buy offer: calls `createBuyOffer(swipeCount, pricePerSwipe)` — USDC moves to escrow
- **Accept offer:** calls `acceptOffer(offerId)` — executes atomic swap
- **Cancel offer:** calls `cancelOffer(offerId)` — returns assets to creator
- Filter options: by swipe count, price range, offer type

#### `/redeem` — QR Code Redemption

The page detects the user's role by checking `approvedDining[smartAddress]` on the token contract and renders one of two views.

**Student view:**

```
┌─────────────────────────────┐
│  6                          │
│  swipes available this week │
└─────────────────────────────┘

┌─────────────────────────────┐
│   [QR CODE — wallet addr]   │
│                             │
│ 0xeC42BcA5...e939           │
│  [Copy Address]             │
└─────────────────────────────┘

Show this QR code to the dining hall cashier.
```

The QR code encodes the student's wallet address as a plain string. The `react-qr-code` library renders it as an SVG. A white background wrapper ensures scannability in dark mode. "Copy Address" writes the full address to the clipboard with a 2-second "Copied!" confirmation.

**Dining terminal view** (shown only to wallets registered via `approveDining()`):

```
Student wallet address
[ 0x...                    ]
[ Scan QR ] [ Redeem Swipe ]

[ camera viewfinder ]
```

- **Manual entry:** Type or paste a student wallet address
- **QR scan:** Tap "Scan QR" to open the device camera. The `html5-qrcode` library (dynamically imported to avoid SSR issues) decodes the QR code, validates the result with `isAddress()`, and auto-fills the address field. Works on mobile (rear camera) and Mac desktop (FaceTime camera).
- **Balance preview:** Once a valid address is entered, the live balance is fetched and displayed in real time.
- **Redeem:** Calls `redeemSwipe(studentAddr)` on MealSwipeToken. Burns 1 swipe from the student's wallet on-chain.
- **Success screen:** Confirms "Swipe redeemed!" with the student's truncated address. "Redeem Another" resets the form.

Error states handled: camera denied, invalid QR, zero balance, already burned epoch, not approved dining.

#### `/onboarding` — Email Verification

```
1. Connect Coinbase Wallet
2. Smart account builds (Kernel, ZeroDev)
3. Enter @davidson.edu email
4. POST /api/verify → verification link sent to email
5. Click link → /api/verify/confirm validates token
6. Wallet linked to davidson email in Supabase
7. Student gains access to the app
```

Only `@davidson.edu` addresses are accepted. One wallet per email. If a wallet was previously linked to a different email, it is reassigned. Tokens expire after 15 minutes.

#### `/history` — Transaction History

Calls `/api/wallet/[address]/history` and displays a combined, timestamp-sorted list of trades (bought and sold) and dining redemptions.

---

## User Flows

### Selling swipes

```
Student (seller)
  1. Go to /listings
  2. Click "Create Offer" → select Ask, set swipe count + price
  3. Frontend calls MealSwipeToken.approve(Marketplace, swipeCount)
  4. Frontend calls Marketplace.createSellOffer(swipeCount, pricePerSwipe)
  5. Swipes transferred from seller to Marketplace escrow
  6. OfferCreated event emitted → indexer writes to offers table
  7. Offer appears in /api/asks feed
  8. When buyer accepts: swipes released to buyer, USDC sent to seller
```

### Buying swipes

```
Student (buyer)
  1. Go to /listings, find an ask
  2. Click "Accept"
  3. Frontend calls USDC.approve(Marketplace, totalCost)
  4. Frontend calls Marketplace.acceptOffer(offerId)
  5. Atomic swap: USDC → seller, swipes → buyer
  6. OfferAccepted event → indexer writes to trades table
```

### Redeeming at dining hall

```
Student
  1. Open /redeem in Coinbase Wallet browser
  2. QR code displays wallet address

Dining worker (approved terminal wallet)
  1. Open /redeem on terminal device
  2. Tap "Scan QR" → camera opens
  3. Scan student's QR code → address auto-fills
  4. Balance preview shows student has swipes
  5. Tap "Redeem Swipe"
  6. MealSwipeToken.redeemSwipe(studentAddr) executes on-chain
  7. 1 swipe burned from student's balance
  8. SwipeRedeemed event → indexer writes to redemptions table
```

### Weekly reset (automated)

```
Saturday 11:56 PM EST
  → Indexer cron fires
  → Queries expired pending offers
  → Calls claimExpiredOffer() for each
  → OfferExpired events emitted
  → Indexer marks offers expired in DB

[Owner wallet — separate cron]
  → Calls MealSwipeToken.burnAll(currentWeek)
  → SwipesBurned event emitted
  → Indexer calls db.expireAllPendingOffers()
  → All remaining balances are inaccessible
```

---

## Database Schema

All tables are in Supabase (PostgreSQL).

### `students`

| Column | Type | Notes |
|--------|------|-------|
| `davidson_email` | text (PK) | `@davidson.edu` address |
| `wallet_address` | text | Linked smart account address |
| `verified_at` | timestamptz | When verification completed |

### `verification_tokens`

| Column | Type | Notes |
|--------|------|-------|
| `token` | uuid (PK) | Random UUID sent in email link |
| `wallet_address` | text | Wallet initiating verification |
| `davidson_email` | text | Email being verified |
| `used` | boolean | Prevents token reuse |
| `expires_at` | timestamptz | 15 minutes from creation |

### `offers`

| Column | Type | Notes |
|--------|------|-------|
| `offer_id` | uuid (PK) | Internal ID |
| `onchain_offer_id` | text | ID from contract event |
| `contract_address` | text | Lowercase — allows redeployment without data collision |
| `type` | text | `'ask'` or `'bid'` |
| `seller_address` | text | Offer creator |
| `swipe_count` | integer | 1–6 |
| `price_per_swipe` | numeric | In USD (converted from 6-decimal USDC) |
| `status` | text | `pending`, `accepted`, `cancelled`, `expired` |
| `tx_hash` | text | Creation transaction |
| `expires_at` | timestamptz | Next Saturday 11:59 PM EST |

Unique constraint: `(onchain_offer_id, contract_address)` — added to fix stale `created_at` timestamps after redeployment.

### `trades`

| Column | Type | Notes |
|--------|------|-------|
| `trade_id` | uuid (PK) | |
| `offer_id` | uuid (FK → offers) | |
| `buyer_address` | text | |
| `seller_address` | text | |
| `swipe_count` | integer | |
| `price` | numeric | Total price (swipe_count × price_per_swipe) |
| `tx_hash` | text (unique) | Accept transaction hash |
| `traded_at` | timestamptz | |

### `redemptions`

| Column | Type | Notes |
|--------|------|-------|
| `redemption_id` | uuid (PK) | |
| `wallet_address` | text | Student whose swipe was burned |
| `tx_hash` | text (unique) | On-chain transaction hash |
| `redeemed_at` | timestamptz | |

---

## Deployed Addresses

| Contract | Address | Network |
|----------|---------|---------|
| MealSwipeToken | `0x32912D61e207282a2E08B56bf92a58ecDf716E92` | Base Mainnet |
| Marketplace | `0xA030C790F2509C653fd7856092eE758aB8f6b360` | Base Mainnet |
| USDC (Circle) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base Mainnet |

Approved dining terminal: `0x57933daB11EEE1E783293e66F8e910F54f10364c`

---

## Local Development

### Prerequisites

- Node.js 18+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- A Supabase project
- An Alchemy API key (Base mainnet)

### Contracts

```bash
cd contracts
cp .env.example .env   # fill in PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY
forge build
forge test
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
```

### Indexer

```bash
cd indexer
npm install
cp .env.example .env   # fill in ALCHEMY_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY, TOKEN_ADDRESS, MARKET_ADDRESS
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in contract addresses, RPC, Supabase keys, Pimlico URLs
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Admin: register a dining terminal

```bash
cd contracts
source .env
TOKEN_ADDRESS=<token> DINING_ADDRESS=<wallet> \
  forge script script/ApproveDining.s.sol \
  --rpc-url "$BASE_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

### Admin: mint swipes to a student

```bash
cast send $TOKEN_ADDRESS \
  "mint(address,uint256,uint256)" \
  <student_wallet> 6 $(cast call $TOKEN_ADDRESS "getCurrentWeek()(uint256)" --rpc-url $BASE_RPC_URL) \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Solidity · Foundry |
| Chain | Base Mainnet |
| RPC | Alchemy |
| Smart accounts | ZeroDev Kernel (ERC-4337) |
| Gas sponsorship | Pimlico paymaster |
| Wallet | Coinbase Wallet (wagmi + viem) |
| Frontend | Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui |
| QR display | react-qr-code |
| QR scanner | html5-qrcode |
| Database | Supabase (PostgreSQL) |
| Indexer | Node.js · viem · Railway |
| Email | Supabase Auth (magic link / OTP) |
| Frontend deploy | Vercel |
| Indexer deploy | Railway |

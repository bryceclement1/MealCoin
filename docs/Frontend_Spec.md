# MealCoin — Frontend Specification

**App:** Next.js 14 (App Router) · TypeScript
**Styling:** Tailwind CSS + shadcn/ui
**Wallet:** wagmi v2 + viem — MetaMask + Coinbase Wallet
**Chain:** Base Sepolia (chainId: 84532)
**Data fetching:** SWR
**Built by:** Bryce (scaffold + contracts layer) + Group 1 (pages + components)

---

## Deployed Contract Addresses (Base Sepolia)

| Contract | Address |
|---|---|
| MealSwipeToken (MST) | `0x22e213d509BA718430039411349a434dE880A13c` |
| Marketplace | `0x57DDdf695b5Cf4Ef57F1c9b1aAbD9b6F45430343` |
| MockUSDC | `0x410d86D853a5D0dC4043e83d4E4e1616581999c6` |

ABIs are at `contracts/out/<ContractName>.sol/<ContractName>.json` — import the `.abi` field.

---

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx               # Root layout — providers, nav
│   ├── page.tsx                 # / — Wallet Dashboard
│   ├── listings/
│   │   └── page.tsx             # /listings — Offer Listings
│   ├── redeem/
│   │   └── page.tsx             # /redeem — Dining Redemption
│   └── onboarding/
│       └── page.tsx             # /onboarding — Email Verification
├── components/
│   ├── providers.tsx            # wagmi + RainbowKit/wagmi WalletProvider
│   ├── nav.tsx                  # Top nav with wallet connect button
│   ├── dashboard/
│   │   ├── balance-card.tsx     # On-chain MST balance display
│   │   ├── expiry-countdown.tsx # Countdown to Saturday 11:59pm
│   │   └── send-swipe-modal.tsx # Transfer MST to a friend
│   ├── listings/
│   │   ├── offer-card.tsx       # Single offer row (ask or bid)
│   │   ├── offer-list.tsx       # Paginated list of asks/bids
│   │   ├── create-offer-modal.tsx  # Post a sell or buy offer
│   │   └── accept-offer-button.tsx # Trigger acceptOffer()
│   └── redeem/
│       └── redeem-button.tsx    # Large redemption CTA
├── lib/
│   ├── wagmi.ts                 # wagmi config (chains, connectors, transports)
│   ├── contracts.ts             # Contract addresses + ABI imports
│   └── api.ts                   # SWR fetcher + typed API helpers
├── hooks/
│   ├── use-mst-balance.ts       # useReadContract wrapper for balanceOf
│   ├── use-current-week.ts      # useReadContract wrapper for getCurrentWeek
│   └── use-offers.ts            # SWR hook for /api/asks and /api/bids
└── .env.local                   # Already populated with contract addresses
```

---

## Pages

### `/` — Wallet Dashboard

**Purpose:** Student's home screen. Shows their MST balance, time until expiry, and lets them send swipes directly to a friend.

**Components:**
- `BalanceCard` — calls `token.balanceOf(walletAddress, currentWeek)` via `useReadContract`. Shows skeleton while loading. Shows "Connect wallet" prompt if disconnected.
- `ExpiryCountdown` — live countdown to next Saturday at 23:59:59. Computed client-side from `Date.now()`. Turns red when < 24 hours remain.
- `SendSwipeModal` — input for recipient address + swipe count. Calls `token.transfer(to, amount)`. Validates address format and that count <= balance.

**Route guard:** If wallet connected but not in `students` table → redirect to `/onboarding`.

---

### `/listings` — Offer Listings

**Purpose:** Marketplace browse, post, and transact page.

**Components:**
- `OfferList` (asks tab) — fetches `GET /api/asks` via SWR, refreshes every 15s. Shows offers ordered cheapest first.
- `OfferList` (bids tab) — fetches `GET /api/bids`, ordered highest first.
- `OfferCard` — displays: type, swipe count, price per swipe, total, expiry, creator address (truncated). Shows **Cancel** button if `offer.creator == connectedWallet`, otherwise shows **Accept** button.
- `CreateOfferModal` — toggled by "Post Offer" button. Fields: offer type (Ask/Bid), swipe count (1–6), price per swipe (max $12).
- `AcceptOfferButton` — handles the full accept flow (see contract flows below).

**Route guard:** Wallet must be connected and verified.

---

### `/redeem` — Dining Redemption

**Purpose:** Full-screen page for dining staff to see. Student taps "Redeem 1 Swipe", swipe is burned.

**Note:** `redeemSwipe()` is called by approved dining terminal addresses — NOT by the student's wallet. For the prototype, this page calls `redeemSwipe(connectedWallet)` from the **dining terminal wallet** (private key: `0x6c5b...`). In a real deployment this would be a server-side call from the terminal. For demo purposes, the frontend can hold the dining terminal private key in an env var and sign server-side via an API route.

**Components:**
- Large balance display
- "Redeem 1 Swipe" button (disabled if balance = 0)
- Full-screen green confirmation overlay after success
- Error state if balance = 0 or epoch burned

---

### `/onboarding` — Email Verification

**Purpose:** First-time setup. Maps connected wallet to a Davidson email via a confirmation email.

**Flow:**
1. Student connects wallet
2. Middleware checks `GET /api/students?wallet=0x...` — if not found, redirect here
3. Student enters `@davidson.edu` email and submits
4. `POST /api/verify` called with `{ wallet_address, davidson_email }`
   - Server checks email exists in seeded `students` table
   - Server generates a one-time token, stores it in `verification_tokens` table with `{ token, wallet_address, davidson_email, expires_at }` (expires in 15 minutes)
   - Server sends a verification email to the address with a link: `/onboarding/confirm?token=<token>`
   - UI shows: "Check your Davidson email — click the link to confirm"
5. Student clicks the link in their email → lands on `/onboarding/confirm?token=...`
6. `GET /api/verify/confirm?token=<token>` is called server-side
   - Validates token exists and is not expired
   - Maps `wallet_address` to the `davidson_email` in `students` table
   - Marks token as used
   - Redirects to `/`
7. Error states:
   - `404` → "Email not found in student list"
   - `409` → "Wallet already verified"
   - `410` → "Verification link has expired — request a new one"
   - `400` → "Invalid or already-used verification link"

**Email sending:** Uses Supabase Auth (`supabaseAuth.auth.signInWithOtp`). No extra package required — the Supabase client is already installed. Requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or service role key) in `.env.local`.

**New API endpoints required:**
- `POST /api/verify` — validate email exists, generate token, send confirmation email
- `GET /api/verify/confirm?token=` — validate token, write wallet→email mapping, redirect to `/`

---

## Wallet & Provider Setup

### `lib/wagmi.ts`

```typescript
import { createConfig, http } from 'wagmi'
import { baseSepolia } from 'viem/chains'
import { coinbaseWallet, metaMask } from 'wagmi/connectors'

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    metaMask(),
    coinbaseWallet({ appName: 'MealCoin' }),
  ],
  transports: {
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
})
```

Wrap `app/layout.tsx` in `<WagmiProvider config={config}><QueryClientProvider>`.

---

## Contract Interaction Patterns

### `lib/contracts.ts`

```typescript
import MealSwipeTokenJson from '@/contracts/out/MealSwipeToken.sol/MealSwipeToken.json'
import MarketplaceJson    from '@/contracts/out/Marketplace.sol/Marketplace.json'
import MockUSDCJson       from '@/contracts/out/MockUSDC.sol/MockUSDC.json'

export const TOKEN_ADDRESS  = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as `0x${string}`
export const MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKET_ADDRESS as `0x${string}`
export const USDC_ADDRESS   = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

export const TOKEN_ABI  = MealSwipeTokenJson.abi
export const MARKET_ABI = MarketplaceJson.abi
export const USDC_ABI   = MockUSDCJson.abi
```

---

### Reading Balance

```typescript
// hooks/use-mst-balance.ts
const { data: week } = useReadContract({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'getCurrentWeek',
})

const { data: balance } = useReadContract({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'balanceOf',
  args: [walletAddress, week],
  query: { enabled: !!walletAddress && !!week },
})
```

---

### Creating a Sell Offer (2 transactions)

```typescript
// 1. Approve marketplace to pull MST tokens
const { writeContract: approve } = useWriteContract()
approve({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'approve',
  args: [MARKET_ADDRESS, swipeCount],
})

// 2. Create the sell offer (after approval confirmed)
const { writeContract: createOffer } = useWriteContract()
createOffer({
  address: MARKET_ADDRESS,
  abi: MARKET_ABI,
  functionName: 'createSellOffer',
  args: [swipeCount, pricePerSwipe], // pricePerSwipe in MockUSDC units (6 decimals)
})
```

Use `useWaitForTransactionReceipt` to gate step 2 on step 1 confirming.

---

### Accepting a Sell Offer (Ask) — 2 transactions

```typescript
// 1. Approve marketplace to pull USDC payment
approve({
  address: USDC_ADDRESS,
  abi: USDC_ABI,
  functionName: 'approve',
  args: [MARKET_ADDRESS, swipeCount * pricePerSwipe],
})

// 2. Accept the offer
acceptOffer({
  address: MARKET_ADDRESS,
  abi: MARKET_ABI,
  functionName: 'acceptOffer',
  args: [offerId],
})
```

---

### Accepting a Buy Offer (Bid) — 2 transactions

```typescript
// 1. Approve marketplace to pull MST tokens
approve({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'approve',
  args: [MARKET_ADDRESS, offer.swipeCount],
})

// 2. Accept the offer
acceptOffer({ ...args: [offerId] })
```

---

### Cancelling an Offer — 1 transaction

```typescript
cancelOffer({
  address: MARKET_ADDRESS,
  abi: MARKET_ABI,
  functionName: 'cancelOffer',
  args: [offerId],
})
```

---

### Sending a Swipe to a Friend — 1 transaction

```typescript
transfer({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'transfer',
  args: [recipientAddress, amount],
})
```

---

## API Integration

All reads go through `SWR` hitting the Next.js API routes (built by Group 2). The frontend never writes to the DB — writes come only from the on-chain indexer.

```typescript
// lib/api.ts
export const fetcher = (url: string) => fetch(url).then(r => r.json())

// hooks/use-offers.ts
const { data: asks } = useSWR('/api/asks', fetcher, { refreshInterval: 15000 })
const { data: bids } = useSWR('/api/bids', fetcher, { refreshInterval: 15000 })
```

| Endpoint | Used by | Notes |
|---|---|---|
| `GET /api/asks` | `/listings` asks tab | Refreshes every 15s |
| `GET /api/bids` | `/listings` bids tab | Refreshes every 15s |
| `POST /api/verify` | `/onboarding` | `{ wallet_address, davidson_email }` |
| `GET /api/wallet/:address/history` | Dashboard history | Optional Sprint 3+ |

---

## Price Formatting

`pricePerSwipe` is stored in MockUSDC units (6 decimals). Always format for display:

```typescript
const formatUSDC = (raw: bigint) => `$${(Number(raw) / 1_000_000).toFixed(2)}`
// e.g. 7_000_000n → "$7.00"
```

When creating offers, convert from dollars:
```typescript
const toUSDC = (dollars: number) => BigInt(Math.round(dollars * 1_000_000))
```

---

## Business Rule Enforcement (UI Layer)

These are enforced on-chain too, but the UI should pre-validate to give better error messages:

| Rule | UI Check |
|---|---|
| Max 6 swipes per offer | Input max=6 |
| Max $12 per swipe | Input max=12 |
| Can't accept own offer | Hide Accept button if `offer.creator == connectedWallet` |
| Can't create offer Sat 23:55–midnight | Disable "Post Offer" button, show: "Marketplace closes at 11:55 PM Saturday for weekly rollover" |
| Must have sufficient balance to sell | Check `balanceOf` before submitting sell offer |
| Must have sufficient USDC to buy | Check `usdc.balanceOf` before submitting buy offer |

---

## Error Handling

Map common contract revert errors to human-readable messages:

| Revert | User Message |
|---|---|
| `InsufficientBalance` | "You don't have enough swipes" |
| `OfferIsExpired` | "This offer has expired" |
| `OfferNotPending` | "This offer is no longer available" |
| `CannotAcceptOwnOffer` | "You can't accept your own offer" |
| `InvalidAmount` | "Invalid swipe count" |
| `PriceExceedsMax` | "Price cannot exceed $12 per swipe" |
| `OfferAlreadyExpired` | "Marketplace is closed for weekly rollover" |

Use `wagmi`'s `error.cause` to extract the revert reason and map it.

---

## Environment Variables

Already set in `frontend/.env.local`:

```
NEXT_PUBLIC_TOKEN_ADDRESS=0x22e213d509BA718430039411349a434dE880A13c
NEXT_PUBLIC_MARKET_ADDRESS=0x57DDdf695b5Cf4Ef57F1c9b1aAbD9b6F45430343
NEXT_PUBLIC_USDC_ADDRESS=0x410d86D853a5D0dC4043e83d4E4e1616581999c6
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_API_URL=                          # fill in after backend deploys
```

Add:
```
NEXT_PUBLIC_RPC_URL=https://base-sepolia.g.alchemy.com/v2/uK9eQx86SAmARzQ497dC8
DINING_TERMINAL_PRIVATE_KEY=0x6c5b1097863dc11af44c89cc57d13caafbaf20aa0cbf5a7a0b07018635f8cf65
```

`DINING_TERMINAL_PRIVATE_KEY` is server-side only (no `NEXT_PUBLIC_` prefix) — used by the `/redeem` API route.

---

## Tickets

### FE-01 — Project Scaffold

**What:** Initialize Next.js 14 + TypeScript app in `frontend/`. Install and configure Tailwind CSS, shadcn/ui, wagmi v2, viem, SWR. Set up folder structure per spec.

**Done when:**
- `npm run dev` serves a blank page at localhost:3000
- Tailwind styles apply
- `WagmiProvider` and `QueryClientProvider` wrap the root layout
- `lib/wagmi.ts` and `lib/contracts.ts` exist with correct config
- ABI JSON files symlinked or copied from `contracts/out/`

**Commands to run after scaffold:**
```bash
npx create-next-app@latest frontend --typescript --tailwind --app
cd frontend
npx shadcn@latest init
npm install wagmi viem @tanstack/react-query swr
```

---

### FE-02 — Wallet Connect (Nav)

**What:** Top nav bar with Connect Wallet button. Supports MetaMask and Coinbase Wallet. Shows truncated address when connected. Allows disconnect.

**Done when:**
- Connect button opens wallet selection modal
- Connected state shows `0x1234...abcd` format
- Disconnect clears state
- Reconnects automatically on page refresh

---

### FE-03 — Onboarding / Email Verification Page

**What:** `/onboarding` page + `/onboarding/confirm` handler. Two-step email confirmation flow.

**Note:** Email is sent via Supabase Auth (`signInWithOtp`) — no extra package needed.

**Step 1 — `/onboarding` (email entry):**
- If connected wallet not in `students` table, redirect here (checked via `GET /api/students?wallet=0x...`)
- Student enters `@davidson.edu` email and submits
- Calls `POST /api/verify` with `{ wallet_address, davidson_email }`
- On success → show "Check your Davidson email and click the verification link"
- On `404` → "Email not found in student list"
- On `409` → "This wallet is already verified"
- Allow resend after 60 seconds (disable button with countdown)

**Step 2 — `/onboarding/confirm?token=` (link from email):**
- Page calls `GET /api/verify/confirm?token=<token>` on load
- On success → redirect to `/`
- On `410` (expired) → show "Link expired" with button to go back to `/onboarding`
- On `400` (invalid/used) → show "Invalid link"

**Done when:**
- Unverified wallets land on `/onboarding` after connecting
- Email is sent with working confirmation link
- Clicking link maps wallet → email in `students` table and redirects to `/`
- All error states display correct messages

---

### FE-04 — Wallet Dashboard Page

**What:** `/` page. Shows on-chain MST balance, Saturday expiry countdown, Send Swipe button.

**Done when:**
- `balanceOf(address, currentWeek)` called via wagmi and displayed
- Countdown to Saturday 23:59:59 displayed live
- Countdown turns red when < 24h remain
- Loading skeleton shown while fetching
- "Connect wallet" prompt if disconnected

---

### FE-05 — Send Swipe Modal

**What:** Modal on dashboard. Recipient address input + swipe count. Calls `token.transfer()`.

**Done when:**
- Address validated against `/^0x[a-fA-F0-9]{40}$/`
- Count validated against user's balance
- Transaction pending state shown
- Balance updates after confirmation
- Human-readable error on revert

---

### FE-06 — Offer Listings Page (Read)

**What:** `/listings` with Ask and Bid tabs. Fetches from `/api/asks` and `/api/bids` via SWR. Auto-refreshes every 15s.

**API response shape** (both endpoints return the same structure):
```typescript
// GET /api/asks  — ordered by price_per_swipe ASC
// GET /api/bids  — ordered by price_per_swipe DESC
type Offer = {
  offer_id: string           // UUID
  onchain_offer_id: number   // uint256 from contract (used for acceptOffer/cancelOffer args)
  type: 'ask' | 'bid'
  seller_address: string     // lowercase 0x address of creator
  swipe_count: number        // 1–6
  price_per_swipe: number    // dollars, e.g. 7.00
  status: 'pending'          // only pending offers returned
  expires_at: string         // ISO timestamp
  created_at: string         // ISO timestamp
}
```

**Hook wiring** (`hooks/use-offers.ts`):
```typescript
import useSWR from 'swr'
import { fetcher } from '@/lib/api'

export function useAsks() {
  return useSWR<Offer[]>('/api/asks', fetcher, { refreshInterval: 15000 })
}

export function useBids() {
  return useSWR<Offer[]>('/api/bids', fetcher, { refreshInterval: 15000 })
}
```

**OfferCard wiring:**
- Pass `offer.onchain_offer_id` (not `offer.offer_id`) as the `offerId` arg to `acceptOffer()` and `cancelOffer()` — the contract uses its own uint256 IDs
- Show **Cancel** if `offer.seller_address === connectedWallet.toLowerCase()`, otherwise **Accept**
- Format expiry as a human-readable countdown (e.g. "Expires in 4h 12m")
- Format price: `$${offer.price_per_swipe.toFixed(2)}` per swipe, `$${(offer.price_per_swipe * offer.swipe_count).toFixed(2)}` total

**Done when:**
- Asks tab shows active sell offers cheapest first
- Bids tab shows active buy offers highest first
- Empty state message when no offers
- OfferCard shows: type, swipes, price/swipe, total, expiry, creator (truncated)
- Own offers show Cancel button, others show Accept button
- List refreshes automatically within 15s of an on-chain event

---

### FE-07 — Create Offer Modal

**What:** "Post Offer" button opens modal. Fields: type (Ask/Bid), swipe count, price. Submits to contract.

**Ask flow (2 txns):** `token.approve(market, count)` → `market.createSellOffer(count, price)`
**Bid flow (2 txns):** `usdc.approve(market, total)` → `market.createBuyOffer(count, price)`

**Done when:**
- Form validates all business rules (1–6 swipes, max $12)
- Both transactions show pending state with step indicator ("1 of 2")
- Success toast + modal closes on confirmation
- Disabled + message shown Sat 23:55–midnight
- Human-readable error on insufficient balance

---

### FE-08 — Accept Offer Flow

**What:** Accept button on OfferCard triggers full accept flow.

**Accept Ask (2 txns):** `usdc.approve(market, total)` → `market.acceptOffer(id)`
**Accept Bid (2 txns):** `token.approve(market, count)` → `market.acceptOffer(id)`

**Done when:**
- Step indicator shows "1 of 2" / "2 of 2"
- Swipe balance updates after accepting an Ask
- USDC balance updates after accepting a Bid
- Offer removed from listings within 15s (SWR refresh)
- Handles expired / already-accepted errors gracefully

---

### FE-09 — Cancel Offer Flow

**What:** Cancel button on own OfferCards. Calls `market.cancelOffer(id)`.

**Done when:**
- Only own offers show Cancel
- Escrowed assets return to wallet after confirmation
- Offer removed from listing
- OfferNotPending error handled gracefully

---

### FE-10 — Dining Redemption Page

**What:** `/redeem` full-screen page. Large balance display. "Redeem 1 Swipe" button.

**Implementation note:** `redeemSwipe(wallet)` must be called by an approved dining address. For the prototype, create a Next.js API route `POST /api/redeem` that signs and broadcasts the transaction server-side using the dining terminal private key (`DINING_TERMINAL_PRIVATE_KEY`). The frontend calls this API route, not the contract directly.

**Done when:**
- Balance displayed prominently
- Button calls `POST /api/redeem` with `{ wallet_address }`
- Full-screen green overlay shown on success
- Error shown if balance = 0
- Works correctly with the approved dining terminal address

---

### FE-11 — Polish: Loading States, Errors & Mobile

**What:** Final UX pass. Skeleton loaders on all async components. React error boundary. Mobile layout QA at 375px. Price formatting (`$7.00` not `7000000`).

**Done when:**
- All data-fetching components show skeletons
- Contract errors show toasts, not raw error objects
- All pages render without horizontal scroll at 375px
- USDC values formatted as dollars throughout

---

## Dependency Order

```
FE-01 (scaffold)
  └── FE-02 (wallet connect)
        ├── FE-03 (onboarding)         needs: POST /api/verify (Group 2)
        ├── FE-04 (dashboard)          needs: MealSwipeToken ABI + address
        │     └── FE-05 (send swipe)
        └── FE-06 (listings read)      needs: GET /api/asks, GET /api/bids (Group 2)
              ├── FE-07 (create offer) needs: Marketplace + USDC ABI
              ├── FE-08 (accept offer)
              └── FE-09 (cancel offer)
FE-10 (redeem)                         needs: dining terminal private key in env
FE-11 (polish) — last
```

# MealCoin — Product Requirements Document

**Project:** MealCoin  
**Group:** 6  
**Members:** Logan Sichelstiel, Bryce Clement, Lucy Budde, Robert Oliver  
**Process:** Scrum — 4 x 2-week sprints  
**Stack:** Next.js · TypeScript · Solidity (Foundry) · Supabase (Postgres) · Base Sepolia · Coinbase Wallet (wagmi + viem) · Alchemy RPC · Railway

---

## 1. Overview

MealCoin is a blockchain-backed peer-to-peer marketplace for Davidson College meal swipes. Students can buy, sell, send, and redeem meal swipes through a web app. Every transaction is enforced by smart contracts, eliminating fake listings and ensuring that all swipes in circulation are real and backed by on-chain escrow. Unused swipes are burned at the end of each week, preserving the rules of the traditional dining system.

---

## 2. Problem Statement

Davidson College students on a meal plan receive a fixed number of swipes per week. Two problems exist simultaneously:

- Students who travel or eat off-campus accumulate unused swipes that expire and go to waste every Saturday night.
- Students who eat on campus frequently run out of swipes mid-week and are forced to pay out of pocket with a credit card.

There is currently no way to transfer, sell, or share meal swipes between students. MealCoin solves both sides of this problem by creating a trusted, verifiable marketplace.

---

## 3. Goals

| Goal | Description |
|------|-------------|
| Reduce waste | Allow students with surplus swipes to sell or send them rather than letting them expire |
| Increase access | Allow students who run out of swipes to purchase them from peers at a fair price |
| Enforce trust | Back every listing with on-chain escrow so fake offers are impossible |
| Preserve dining rules | Enforce the weekly expiry and redemption rules of the existing system |
| Prototype-first | Build a working demo on Base Sepolia testnet — no real money, no real Davidson integration required |

---

## 4. Non-Goals

- Integration with Davidson's actual dining database or card readers
- Mobile native app (iOS / Android)
- Support for dining dollars (only meal swipes are in scope)
- Real USD payments (prototype uses simulated ERC-20 tokens)
- Support for multiple colleges or campuses

---

## 5. Users & Stakeholders

### Primary Users — Davidson Students
Students on any Davidson meal plan. They want to:
- List surplus swipes for sale in under a minute
- Purchase a swipe and use it within one minute
- Browse all active listings and buy at the lowest price
- Send swipes directly to a friend

### Secondary Stakeholders — Davidson Dining Admin
Not involved in the prototype but relevant for any real-world implementation. They would require:
- System stability and predictable weekly resets
- Instant redemption confirmation at dining locations
- No financial exposure or legal liability from the system

---

## 6. User Stories

| ID | Role | Action | Benefit |
|----|------|--------|---------|
| US-01 | Student with surplus swipes | List 6 meal swipes in under a minute | Convert unused swipes to cash before they expire |
| US-02 | Student out of swipes | Purchase 1 swipe and have it ready in under one minute | Use it at a dining location without a credit card |
| US-03 | Student browsing | See all active sell listings within 5 seconds | Choose the lowest-priced option |
| US-04 | Dining worker | Redeem one swipe directly from a student's wallet, recorded on-chain instantly | All transactions are verifiable and expiry rules are enforced |
| US-05 | System (automated) | Burn all swipes at Saturday 11:59pm rollover | Expiry is enforced without any manual intervention |

---

## 7. Acceptance Tests

| ID | Given | When | Then |
|----|-------|------|------|
| AT-01 | Student has 2 swipes in their wallet | Student submits a sell order for 2 swipes at $7 each | Listing appears on the marketplace and swipes are locked in escrow within 5 seconds |
| AT-02 | Student has 0 swipes | Student tries to create a listing | System returns "No meal swipes valid to list" and no listing is created |
| AT-03 | A listing exists for 1 swipe at $6 | Buyer clicks purchase | Swipe transfers to buyer, seller receives $6, listing is removed |
| AT-04 | Student has 1+ valid swipes | Student sends a swipe from the app at a dining location | Dining worker receives confirmation, swipe is burned from student's wallet |
| AT-05 | Clock reaches 12:00am Sunday | Weekly epoch fires | All swipes in escrow and in wallets are burned and no longer exist |

---

## 8. System Architecture

### 8.1 Layers

```
┌─────────────────────────────────────────────────────────┐
│  FRONT-END (Next.js)                                    │
│  Wallet Dashboard  ·  Offer Listings  ·  Redeem Page   │
└────────────────────┬────────────────────────────────────┘
                     │ REST calls
┌────────────────────▼────────────────────────────────────┐
│  BACK-END — OFF-CHAIN (Next.js API Routes)              │
│  GET /asks  ·  GET /bids  ·  POST /verify               │
│  GET /trades  ·  GET /redemptions  ·  GET /history      │
│                                                          │
│  ┌──────────────┐        ┌───────────────────────────┐  │
│  │  Supabase DB │◄───────│  Node.js Indexer          │  │
│  │  (Postgres)  │        │  Polls RPC every 5s       │  │
│  └──────────────┘        │  Writes events to DB      │  │
│                          └────────────┬──────────────┘  │
└───────────────────────────────────────┼─────────────────┘
                                        │ viem getLogs()
┌───────────────────────────────────────▼─────────────────┐
│  ON-CHAIN (Base Sepolia via Alchemy RPC)                 │
│  MealSwipeToken (ERC-20)  ·  Marketplace (Escrow)       │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Frontend Pages

| Page | Description |
|------|-------------|
| `/` | Wallet Dashboard — on-chain balance, expiry countdown, send swipe |
| `/listings` | Offer Listings — browse, post, accept, and cancel offers |
| `/redeem` | Dining worker redemption screen — large confirmation UI |
| `/onboarding` | Davidson email verification for new wallet connections |

### 8.3 Smart Contracts

**MealSwipeToken (ERC-20)**
- Balances scoped to `(address, weekEpoch)` pairs
- `mint(address, amount, week)` — admin only, called at the start of each week
- `transfer(to, amount)` — standard ERC-20 transfer within current week
- `redeemSwipe(address)` — burns 1 token, callable by approved dining addresses only
- `burnAll(week)` — burns all balances for a given week epoch (called at Saturday rollover)
- `balanceOf(address, week)` — returns balance for a given address and week

**Marketplace Contract (Escrow)**
- `createSellOffer(swipeCount, pricePerSwipe)` — escrows seller's tokens, emits `OfferCreated`
- `createBuyOffer(swipeCount, pricePerSwipe)` — escrows buyer's payment tokens, emits `OfferCreated`
- `acceptOffer(offerId)` — executes swap, emits `OfferAccepted`
- `cancelOffer(offerId)` — returns escrowed assets, emits `OfferCancelled`
- Expired offers (past Saturday 11:59pm) revert with `OfferExpired()`

### 8.4 Indexer

A standalone Node.js process deployed to Railway. Polls Alchemy RPC every 5 seconds for new events from both contracts. Decodes events using viem and upserts the results into Supabase. Persists the last processed block to survive restarts.

Events handled:
- `OfferCreated` → inserts/updates `offers` table
- `OfferAccepted` → updates `offers`, inserts into `trades`
- `OfferCancelled` → updates `offers` status
- `SwipeRedeemed` → inserts into `redemptions`
- `SwipesBurned` → marks all pending offers as expired

### 8.5 Backend API

Next.js Route Handlers serving the frontend. All reads come from Supabase — the API never writes directly (writes come exclusively from the indexer, which mirrors on-chain state).

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/asks` | Active sell offers, ordered by price ascending |
| `GET /api/bids` | Active buy offers, ordered by price descending |
| `POST /api/verify` | Map a Davidson email to a wallet address |
| `GET /api/trades` | Completed trades, filterable by wallet |
| `GET /api/redemptions` | Completed redemptions, filterable by wallet |
| `GET /api/wallet/:address/history` | Combined trade + redemption history for a wallet |
| `POST /api/admin/expire` | Manually expire all pending offers (testing only) |

---

## 9. Business Rules

| Rule | Enforcement |
|------|-------------|
| Max 6 swipes per listing | Contract + API validation |
| Max price $12 per swipe | Contract + API validation |
| Seller must hold swipes to list | Contract escrow — tokens locked on offer creation |
| Buyer must hold payment tokens to accept | Contract escrow — payment locked on offer creation |
| All swipes expire Saturday 11:59pm | `burnAll()` contract function + indexer epoch handler |
| One wallet per student | Email verification maps one wallet per Davidson email |
| Only verified students can transact | Onboarding flow enforces `@davidson.edu` email check |

---

## 10. Authentication

For the prototype, authentication is a simple wallet-to-email mapping:

1. Student connects their Coinbase Wallet
2. If their wallet address is not in the `students` table, they are redirected to `/onboarding`
3. They enter their `@davidson.edu` email address
4. The system checks the email against the seeded student list in Supabase
5. On match, their wallet address is saved to that student record
6. On all future visits, the wallet address is recognized and they skip onboarding

No actual email sending or SSO is required for the prototype. The seed list is loaded via a script (`scripts/seed-students.ts`) and contains ~20 test Davidson email addresses.

---

## 11. Constraints & Risks

### Policy
Davidson Dining's policy states that dining dollars are non-transferable. Meal swipes are not explicitly mentioned, but admin approval would be required for any real-world implementation. This project is a prototype and is not subject to this constraint for the purposes of the class.

### Ethical
A real-money marketplace could incentivize gaming the system. Mitigated by: price cap of $12 (no one can profit above face value), escrow enforcement (no fake listings possible), and transparent on-chain history.

### Tax
Money changing hands could technically be a taxable event. Mitigated by the $12 price cap ensuring no one profits. A sales tax deduction could be added to seller payouts in a future version.

### Campus Policy
Building and demoing a prototype on a testnet with simulated tokens is not blocked by any Davidson policy.

---

## 12. Sprint Plan

| Sprint | Goal | Key Deliverables |
|--------|------|-----------------|
| 1 | Contracts + foundations | MealSwipeToken, Marketplace contract, Supabase schema, RPC setup, indexer shell, Next.js scaffold, wallet connect, static UI mockups, core API endpoints |
| 2 | Deploy + live data | Contracts deployed to Base Sepolia, all indexer event handlers, live on-chain balance on dashboard, offer listings from API, create listing modal |
| 3 | Write flows + reliability | Accept offer, cancel offer, send swipe, dining redemption, indexer epoch handler + retry logic, offer expiry cron, API hardening |
| 4 | Polish + deploy + demo | Email auth onboarding, loading states + error handling, mobile QA, Railway deploy (indexer), Vercel deploy (app), security audit, full E2E test |

---

## 13. Team Roles

| Role | Responsibility |
|------|---------------|
| Scrum Master | Bryce — sprint planning, keeping the team on track |
| Product Owner | Logan — customer communication, backlog prioritization |
| Developers | Everyone |

**Group assignments:**
- **Your group** — Solidity contracts, Foundry tests, Supabase DB schema, Node.js indexer, deployment
- **Group 1** — Next.js frontend, Coinbase Wallet integration, all UI pages
- **Group 2** — Next.js API routes, Supabase queries, REST endpoint logic

---

## 14. Success Metrics

- A student can post a sell listing in under 60 seconds
- A student can purchase and receive a swipe in under 60 seconds  
- All active listings load within 5 seconds
- The weekly epoch correctly burns all tokens with zero manual intervention
- Zero fake listings are possible (enforced by escrow)
- Full happy-path demo completes without errors on Base Sepolia

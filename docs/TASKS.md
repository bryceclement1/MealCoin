# MealCoin — Sprint Task Board

**Group 6 · 4 Groups · 30 Tickets · 4 Sprints**

Each ticket contains: Description, Acceptance Criteria, Dependencies, and Notes.

**Tech stack:** Next.js · TypeScript · Solidity (Foundry) · Supabase (Postgres) · Base Sepolia · Coinbase Wallet (wagmi + viem) · Alchemy RPC · Railway

---

## Your Group — Contracts · Indexer · Supabase DB

> Solidity / Foundry · Node.js Indexer · Supabase DB · Base Sepolia

---

### Sprint 1 — DB Schema, Both Contracts & RPC Setup

---

#### DB-01 — Supabase Project Setup & Database Schema

**Description:** Create the Supabase project and apply the full initial schema. Tables required: `students` (wallet_address, davidson_email, verified_at), `offers` (offer_id UUID PK, type [ask/bid], seller_address, swipe_count, price_per_swipe, status, created_at, expires_at, tx_hash), `trades` (trade_id, offer_id FK, buyer_address, seller_address, swipe_count, price, tx_hash, traded_at), `redemptions` (redemption_id, wallet_address, tx_hash, redeemed_at). Share Supabase URL + service role key with the team via a password manager.

**Acceptance Criteria:**
- Supabase project is live and accessible
- All 4 tables exist with correct column types and constraints
- `wallet_address` fields are indexed for fast lookup
- `status` field on offers has CHECK constraint: `(pending, accepted, cancelled, expired)`
- Schema is documented in `/docs/schema.md` and committed to the repo
- Team members can connect using the shared env vars

**Dependencies:** None — this unblocks all backend and indexer work

**Notes:** Keep Supabase URL and service role key in `.env`. Add all required keys to `.env.example` with placeholder values.

---

#### MEAL-01 — MealSwipeToken ERC-20 Contract

**Description:** Write and test the MealSwipeToken Solidity contract. A modified ERC-20 where balances are scoped to a `(address, weekEpoch)` pair, computed dynamically as `block.timestamp / 7 days`. Functions: `mint(address, amount, week)` — admin only, `transfer(to, amount) returns (bool)` — transfers within current week, `approve(spender, amount) returns (bool)`, `allowance(owner, spender) returns (uint256)`, `transferFrom(from, to, amount) returns (bool)` — used by Marketplace escrow, `redeemSwipe(address)` — burns 1 token callable by approved dining addresses, `burnAll(week)` — marks week as burned via `burnedWeeks` mapping, `balanceOf(address, week)` — returns 0 if week is burned, `getCurrentWeek()` — convenience view function.

**Acceptance Criteria:**
- Contract compiles with no warnings in Foundry
- `mint()` reverts if called by non-admin
- `transfer()` reverts if sender balance for current week is insufficient
- `transferFrom()` reverts with `InsufficientAllowance` if allowance too low
- `redeemSwipe()` burns exactly 1 token and emits `SwipeRedeemed(address, week)`
- `burnAll()` marks week burned and emits `SwipesBurned(week, totalBurned)`
- `balanceOf()` returns 0 for a burned week regardless of stored balance
- Full Foundry test suite passes covering all functions, access control, and edge cases
- ABI exported to `/contracts/out/` and shared with frontend and indexer teams

**Dependencies:** None

**Notes:** All epoch-sensitive functions compute week dynamically inline (`block.timestamp / 7 days`) — never reference a stored `currentWeek` variable in transfer logic. Use `burnedWeeks` mapping to avoid iterating all addresses on `burnAll()`. Use Foundry's `vm.warp()` for epoch tests.

---

#### MARK-01 — Marketplace Escrow Contract

**Description:** Write and test the Marketplace escrow contract. Functions: `createSellOffer(swipeCount, pricePerSwipe)` — escrows seller's tokens, `createBuyOffer(swipeCount, pricePerSwipe)` — escrows buyer's MockUSDC, `acceptOffer(offerId)` — executes swap atomically using CEI pattern (status update before transfers), `cancelOffer(offerId)` — returns escrowed assets using CEI pattern, `getOffer(offerId)` — view function. Max price enforced at `12 * 1e6` (MockUSDC, 6 decimals). Offer expiry set to next Saturday 11:59pm via `_getNextSaturdayMidnight()` helper.

**Acceptance Criteria:**
- `createSellOffer()` transfers tokens into escrow and emits `OfferCreated(offerId, seller, swipeCount, price, expiresAt)`
- `createBuyOffer()` transfers MockUSDC into escrow and emits `OfferCreated(...)`
- `acceptOffer()` sets status to `Accepted` BEFORE external transfers (CEI), emits `OfferAccepted(offerId, acceptor)`
- `cancelOffer()` sets status to `Cancelled` BEFORE external transfers (CEI), emits `OfferCancelled(offerId, creator)`
- Accepting an expired offer reverts with `OfferIsExpired()`
- Accepting an already-accepted offer reverts with `OfferNotPending()`
- Creator cannot accept their own offer — reverts `CannotAcceptOwnOffer()`
- Full Foundry test suite covers all happy paths and edge cases
- ABI exported to `/contracts/out/` and shared with frontend and indexer teams

**Dependencies:** MEAL-01

**Notes:** Strictly follow checks-effects-interactions (CEI) — always update `offer.status` before any external token transfer calls. Use MockUSDC in tests for the payment side. `pricePerSwipe` cap is `12 * 1e6` (i.e. $12 with 6 decimal places).

---

#### IDX-01 — Alchemy RPC Setup & Local Chain Config

**Description:** Set up the Alchemy RPC connection for Base Sepolia. Create an Alchemy app and verify you can read the latest block number. Configure a local Anvil fork for development testing. Document setup in `/indexer/README.md`.

**Acceptance Criteria:**
- A test script `scripts/test-rpc.ts` reads the latest block number from Alchemy successfully
- Running `anvil --fork-url $ALCHEMY_URL` starts a local fork
- `ALCHEMY_URL` is in `.env.example`
- `/indexer/README.md` explains how to start the local chain

**Dependencies:** None

**Notes:** Sign up for a free Alchemy account. Base Sepolia has a generous free tier.

---

#### IDX-02 — Indexer Scaffolding: Event Polling Loop

**Description:** Build the skeleton of the standalone Node.js indexer (TypeScript). Runs an infinite polling loop every 5 seconds, querying the RPC for new events using viem's `getLogs()`. Handle RPC errors gracefully with retry. Persist the last processed block to `indexer/.lastblock` so restarts don't re-process old events.

**Acceptance Criteria:**
- Running `npx ts-node indexer/index.ts` starts the polling loop
- Loop runs every 5 seconds without crashing on RPC errors
- Logs: `[timestamp] Polling block X to Y — found N events`
- Last processed block saved to `indexer/.lastblock` and reloaded on restart
- RPC errors are caught, logged, and retried — loop never exits on error

**Dependencies:** IDX-01

**Notes:** Process in chunks of 100 blocks max per poll to avoid RPC timeouts.

---

### Sprint 2 — Deploy Contracts & All Indexer Event Handlers

---

#### CONT-02 — Deploy Contracts to Base Sepolia

**Description:** Deploy MockUSDC, MealSwipeToken, and Marketplace contracts to Base Sepolia testnet using Foundry's `forge script`. Record deployed addresses. Call `mealSwipeToken.approveDining(address(marketplace))` so the Marketplace can hold tokens in escrow. Mint 6 tokens to a test wallet. Share contract addresses with all groups.

**Acceptance Criteria:**
- All contracts deployed successfully to Base Sepolia
- Deployed addresses in `/contracts/deployments/base-sepolia.json`
- Contract addresses added to the shared `.env`
- Test wallet minted with 6 MealSwipeTokens
- Contracts verified on BaseScan

**Dependencies:** MEAL-01, MARK-01

**Notes:** Use `forge script` with `--broadcast --verify`. Keep deployer private key in `.env` — never commit it. Deployment order: MockUSDC → MealSwipeToken → Marketplace → `approveDining()` → mint test tokens.

---

#### IDX-03 — Parse & Store OfferCreated Events

**Description:** Extend the indexer to decode `OfferCreated` events from the Marketplace Contract using viem's `decodeEventLog()` and upsert them into the `offers` table. Event args: `offerId`, `seller`, `swipeCount`, `pricePerSwipe`, `expiresAt`.

**Acceptance Criteria:**
- `OfferCreated` events are correctly decoded using the contract ABI
- Each event is upserted into `offers` table (idempotent — no duplicates on re-index)
- `offer_id` from the contract stored as the primary identifier
- `status` set to `pending` on creation
- Unit test: emit a test `OfferCreated` on local Anvil, run indexer, assert row exists in DB

**Dependencies:** IDX-02, DB-01, MARK-01 ABI

**Notes:** Upsert on `offer_id` to safely re-process blocks without creating duplicates.

---

#### IDX-04 — Parse & Store OfferAccepted and OfferCancelled Events

**Description:** Extend the indexer to handle `OfferAccepted` and `OfferCancelled` events. `OfferAccepted`: update offer status to `accepted`, insert row into `trades`. `OfferCancelled`: update offer status to `cancelled`.

**Acceptance Criteria:**
- `OfferAccepted` updates offer status to `accepted`
- `OfferAccepted` inserts a row into `trades` with correct buyer, seller, price, tx_hash
- `OfferCancelled` updates offer status to `cancelled`
- All DB operations use upsert (idempotent)
- Unit test: simulate accept and cancel on Anvil, assert correct DB state

**Dependencies:** IDX-03

**Notes:** `tx_hash` comes from the log's `transactionHash` field — store it on every event for auditability.

---

#### IDX-05 — Parse & Store SwipeRedeemed Events

**Description:** Extend the indexer to parse `SwipeRedeemed` events from the MealSwipeToken contract and insert each into the `redemptions` table with `wallet_address`, `tx_hash`, and `redeemed_at`.

**Acceptance Criteria:**
- `SwipeRedeemed` events are parsed from the MealSwipeToken contract logs
- Each redemption inserted into `redemptions` table
- Duplicate events (same tx_hash) ignored via upsert
- Unit test: call `redeemSwipe()` on Anvil, run indexer, assert redemption row exists in DB

**Dependencies:** IDX-03, DB-01, MEAL-01 ABI

**Notes:** The indexer subscribes to both contract addresses — make sure both are in the config.

---

### Sprint 3 — Epoch Handler, Reliability & Integration Tests

---

#### IDX-06 — Weekly Epoch: SwipesBurned Event Handler

**Description:** Handle the `SwipesBurned` event emitted at the Saturday 11:59pm rollover. When this event fires, mark all pending offers in the DB as `expired`. Log clearly: `[EPOCH] Week rolled over — X swipes burned, Y offers expired`.

**Acceptance Criteria:**
- `SwipesBurned` event detected and parsed by the indexer
- All pending offers in the DB marked expired on this event
- Log line shows epoch rollover with counts
- Unit test: trigger epoch on Anvil, run indexer, assert all pending offers expired in DB

**Dependencies:** IDX-03, IDX-04, MEAL-01 `burnAll()` function

**Notes:** Coordinate with the backend team so DB expiry (BE-06) and on-chain epoch event align.

---

#### IDX-07 — Indexer Reliability: Retry Logic & Gap Detection

**Description:** Harden the indexer. Add exponential backoff on RPC failures (retry up to 5x: 1s/2s/4s/8s/16s), detect missed blocks (warn if gap > 200 blocks), and retry DB writes once on failure before logging an error.

**Acceptance Criteria:**
- RPC failures trigger exponential backoff and retry up to 5 times
- After 5 failed retries, error logged with full details and loop continues
- Missed-block warning logged if more than 200 blocks skipped
- DB write failures retry once before logging
- Indexer runs for 30 minutes in test environment without crashing

**Dependencies:** IDX-02 through IDX-05

---

#### CONT-03 — Foundry Integration Test Suite

**Description:** Write a comprehensive Foundry integration test exercising the full system flow on local Anvil: mint tokens → post sell offer → accept offer → verify balances → redeem swipe → trigger epoch rollover → verify all tokens burned. Also cover all edge cases identified in the edge case list.

**Acceptance Criteria:**
- Full happy-path flow passes in a single Foundry test script
- Escrow balances verified at each step
- Epoch rollover correctly burns all remaining tokens
- Edge cases tested: double-accept reverts, expired offer reverts, over-transfer reverts, CEI reentrancy scenario
- Cross-contract edge case tested: create sell offer, `burnAll`, attempt to accept — behavior defined and tested
- Test report shared with team as evidence contracts are demo-ready

**Dependencies:** MEAL-01, MARK-01, CONT-02

**Notes:** Use `vm.prank()`, `vm.warp()`, and `vm.expectRevert()` throughout.

---

### Sprint 4 — Deploy Indexer, Security Audit & E2E Test

---

#### IDX-08 — Deploy Indexer to Railway

**Description:** Deploy the standalone Node.js indexer to Railway (free hobby tier). Must run 24/7 and auto-restart on crashes. Set all environment variables in the Railway dashboard: `ALCHEMY_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TOKEN_CONTRACT_ADDRESS`, `MARKETPLACE_CONTRACT_ADDRESS`.

**Acceptance Criteria:**
- Indexer deployed and running on Railway
- Deployment logs show active polling every 5 seconds
- Service auto-restarts if it crashes
- All env vars configured in Railway dashboard — nothing hardcoded
- Status/log link shared with team for demo day

**Dependencies:** IDX-07, CONT-02

**Notes:** Railway recommended over Render — no sleep on inactivity on the free tier.

---

#### CONT-04 — Security Audit & Edge Case Review

**Description:** Final security pass on both contracts. Review: reentrancy risks in escrow functions (CEI pattern verified), access control on `mint()` and `burnAll()`, offer expiry enforcement, that no ETH can get stuck in contracts, and that `burnedWeeks` correctly gates all balance reads.

**Acceptance Criteria:**
- No reentrancy vulnerabilities in `acceptOffer()` or `cancelOffer()`
- `mint()` and `burnAll()` only callable by owner address
- `redeemSwipe()` only callable by approved dining addresses
- Audit checklist documented in `/contracts/AUDIT.md`
- All issues found are fixed and re-tested before demo

**Dependencies:** MEAL-01, MARK-01, CONT-03

**Notes:** Run `forge test --gas-report` to check for unexpectedly expensive functions.

---

#### IDX-09 — Full End-to-End Integration Test

**Description:** Run the full system integration test across all layers on Base Sepolia: connect wallet → verify student email → post sell offer → accept offer → confirm trade appears in DB via API → redeem swipe → confirm redemption in DB → trigger epoch → confirm offers expired. Document results.

**Acceptance Criteria:**
- Full flow completes without errors on Base Sepolia
- Each DB state change verified via the API (not directly in Supabase)
- Epoch rollover correctly expires all open offers
- Test results documented in `/docs/e2e-test-results.md`
- Any bugs found are logged as issues and fixed before demo day

**Dependencies:** All tickets across all groups

**Notes:** Run this at least 2 days before the demo. Account for the indexer's 5s polling lag in the test flow.

---

---

## Group 1 — Frontend

> Next.js + TypeScript · Coinbase Wallet (wagmi) · viem · Base Sepolia

---

### Sprint 1 — Scaffold, Wallet Connect & Static Mockups

---

#### FE-01 — Next.js Project Scaffolding & Monorepo Setup

**Description:** Initialize the Next.js + TypeScript monorepo. Set up folder structure for `/app` (frontend + API routes), `/contracts` (Foundry), `/indexer` (Node.js). Configure ESLint, Prettier, and tsconfig. Set up `.env.example` with all required env vars (RPC URL, contract addresses, Supabase keys).

**Acceptance Criteria:**
- Running `npm run dev` serves a blank Next.js app on localhost:3000
- `/contracts` and `/indexer` folders exist with README stubs
- `.env.example` lists all required env vars
- ESLint and Prettier pass with no errors

**Dependencies:** None — this unblocks all other frontend work

**Notes:** Contract addresses won't exist yet — use placeholders in `.env.example` like `NEXT_PUBLIC_TOKEN_ADDRESS=0x...`

---

#### FE-02 — Coinbase Wallet Connection Flow

**Description:** Implement wallet connection using the Coinbase Wallet SDK (wagmi + viem). App prompts user to connect on first visit. Store connection state in React context. Display truncated wallet address (`0x1234...abcd`) in the header when connected. Allow disconnect.

**Acceptance Criteria:**
- Clicking 'Connect Wallet' opens the Coinbase Wallet modal
- After connecting, header shows the truncated wallet address
- Refreshing the page re-connects automatically if wallet was previously connected
- Disconnecting clears the address from the header
- Works on Base Sepolia testnet

**Dependencies:** FE-01

**Notes:** Use wagmi v2 with the `coinbaseWallet` connector. Chain should be `baseSepolia` from `viem/chains`.

---

#### FE-03 — Static UI Mockups: Wallet Dashboard & Offer Listings

**Description:** Build pixel-perfect static (no live data) versions of both main pages. Wallet Dashboard: balance (hardcoded to 6), weekly expiry countdown placeholder, 'Send Swipe' button. Offer Listings: 3–5 hardcoded offer cards (type Buy/Sell, price, address, Accept/Cancel button). Focus on layout and design quality.

**Acceptance Criteria:**
- Both pages render without errors
- Wallet Dashboard clearly shows balance and an expiry area
- Offer Listings shows at least 3 hardcoded cards with Buy/Sell labels
- UI is mobile-responsive at 375px viewport
- No real contract calls — all data is hardcoded

**Dependencies:** FE-01, FE-02

**Notes:** Real data wiring happens in Sprint 2. This sprint is about getting the layout and design right.

---

### Sprint 2 — Live On-Chain Data & Create Listing

---

#### FE-04 — Wallet Dashboard: Live On-Chain Balance

**Description:** Wire the Wallet Dashboard to read the real on-chain MealSwipeToken balance for the connected wallet. Use wagmi's `useReadContract` to call `balanceOf(address, currentWeek)`. Show a loading skeleton while fetching.

**Acceptance Criteria:**
- Connected wallet's real token balance is displayed
- Balance updates within 5 seconds of a transaction
- Loading skeleton shown while fetching
- If wallet is not connected, prompt to connect

**Dependencies:** FE-02, FE-03, MEAL-01 ABI + deployed address (CONT-02)

**Notes:** You'll need the MealSwipeToken ABI from `/contracts/out/` once CONT-02 is done.

---

#### FE-05 — Offer Listings Page: Live Data from API

**Description:** Replace hardcoded offer cards with live data from `GET /api/asks` and `GET /api/bids`. Use SWR or React Query with auto-refresh every 15 seconds. Each card shows: offer type, price, swipe count, and an Accept button (wired in Sprint 3).

**Acceptance Criteria:**
- Page fetches from `GET /api/asks` and `GET /api/bids` on load
- Cards render correctly for both ask and bid types
- Page auto-refreshes every 15 seconds
- Shows empty state message when no offers exist
- Accept buttons visible but can be placeholder for now

**Dependencies:** FE-03, BE-02 (GET /asks), BE-03 (GET /bids)

**Notes:** If the API isn't ready, keep a mock-data flag so frontend work isn't blocked.

---

#### FE-06 — Create Listing Modal (Post Offer)

**Description:** Build a modal allowing a student to post a sell offer. Fields: swipe count (1–6), price per swipe (max $12). On submit, call the Marketplace Contract's `createSellOffer()` via wagmi's `writeContract`. Show a pending spinner and success/error toast.

**Acceptance Criteria:**
- Modal opens from 'Post Offer' button on Offer Listings page
- Form validates: swipes 1–6, price > 0 and ≤ $12
- Submit calls the smart contract and shows a pending state
- On success, shows a toast and closes the modal
- On failure (e.g. insufficient balance), shows a human-readable error message

**Dependencies:** FE-05, MARK-01 ABI (CONT-02)

**Notes:** The contract escrows tokens on-chain when `createSellOffer` is called, so the user's balance decreases immediately.

---

### Sprint 3 — Accept, Cancel & Send Flows

---

#### FE-07 — Accept Offer Flow (Buy a Swipe)

**Description:** Wire the Accept button to call the Marketplace Contract's `acceptOffer()`. The buyer pays with MockUSDC. Show token approval step first if not already approved, then execute the accept. Show transaction progress.

**Acceptance Criteria:**
- Clicking Accept triggers a MockUSDC approval transaction if needed
- After approval, `acceptOffer()` is called
- Buyer's meal swipe balance increases after confirmation
- Offer disappears from the listing within 15 seconds
- Error states handled: insufficient balance, offer already taken, offer expired

**Dependencies:** FE-05, FE-06, MARK-01 ABI

**Notes:** Two transactions may be needed: `approve()` then `acceptOffer()`. Use wagmi's `useWaitForTransactionReceipt` to chain them.

---

#### FE-08 — Cancel Offer Flow

**Description:** Allow a student to cancel their own active offer. Offers created by the connected wallet show a 'Cancel' button instead of 'Accept'. Clicking Cancel calls `cancelOffer()` on the Marketplace Contract and returns escrowed tokens.

**Acceptance Criteria:**
- Own offers show 'Cancel', others show 'Accept'
- Cancel calls `cancelOffer()` on the contract
- After confirmation, the offer is removed from the listing
- Cancelled swipes reappear in the seller's wallet balance

**Dependencies:** FE-07, MARK-01 ABI

**Notes:** Compare the offer's `seller_address` to the connected wallet address to decide which button to render.

---

#### FE-09 — Send Swipe Directly to Friend

**Description:** Implement the 'Send Swipe' feature on the Wallet Dashboard. A modal lets the user enter a recipient wallet address and swipe count, then calls MealSwipeToken's `transfer()` function directly.

**Acceptance Criteria:**
- Modal opens from 'Send Swipe' button on Wallet Dashboard
- User can enter a wallet address and swipe count
- Address validated (must match `/^0x[a-fA-F0-9]{40}$/`)
- On submit, ERC-20 `transfer()` executed and sender's balance updates
- Error shown if user tries to send more than their current balance

**Dependencies:** FE-04, MEAL-01 ABI

**Notes:** Standard ERC-20 transfer — no Marketplace contract needed here.

---

### Sprint 4 — Redemption UI, Auth & Polish

---

#### FE-10 — Dining Worker Redemption UI

**Description:** Build a `/redeem` page for dining staff. A student opens the page and taps 'Redeem 1 Swipe', which calls `redeemSwipe()` on the MealSwipeToken contract. Shows a large green confirmation screen for the dining worker to see.

**Acceptance Criteria:**
- `/redeem` route accessible from the main nav
- Page shows the connected wallet's balance prominently
- 'Redeem 1 Swipe' button calls the burn function on the contract
- After redemption, balance decreases and a large green confirmation is shown
- Error shown if balance is 0

**Dependencies:** FE-04, MEAL-01 ABI

**Notes:** Keep this page visually distinct — large text, high contrast. Dining workers need to read it at a glance.

---

#### FE-11 — Auth: Davidson Email Verification Screen

**Description:** Add an onboarding step after wallet connection. If the connected wallet is not in the verified student list, prompt the user to enter their `@davidson.edu` email. Submit verifies against the student seed list. Map the wallet address to the student record in Supabase.

**Acceptance Criteria:**
- Unverified wallets are redirected to `/onboarding`
- Student enters their `@davidson.edu` email
- Email checked against seed list via `POST /api/verify`
- On match, wallet address saved to the student record
- On mismatch, error: 'Email not found in student list'
- Verified wallets skip this step on future visits

**Dependencies:** FE-02, DB-01 (student seed table), BE-04 (verify endpoint)

**Notes:** No actual email sending needed — it's a simple DB lookup against the seed list.

---

#### FE-12 — Polish: Loading States, Error Boundaries & Mobile QA

**Description:** Final UX pass. Add skeleton loaders to all data-fetching components. Add a React error boundary to prevent full-page crashes. Test all layouts at 375px viewport. Add a live weekly expiry countdown to the Wallet Dashboard.

**Acceptance Criteria:**
- All pages show skeleton loaders while fetching
- Contract errors show a human-readable toast, not a raw error object
- All pages render correctly at 375px with no horizontal scroll
- Countdown timer counts down to Saturday 11:59pm correctly
- App does not crash on network errors — shows a retry button

**Dependencies:** All FE tickets

**Notes:** Prioritize the happy path being flawless for demo day.

---

---

## Group 2 — Backend / API

> Next.js Route Handlers · TypeScript · Supabase (Postgres) · REST

---

### Sprint 1 — API Middleware & Core Read Endpoints

---

#### BE-01 — Next.js API Route Setup & Middleware

**Description:** Set up the API layer inside the Next.js app using `/app/api/` route handlers. Create a shared Supabase client utility initialized once and reused. Add basic request validation middleware (400 on missing fields). Add CORS headers. Implement `GET /api/health` returning `{ status: 'ok' }`.

**Acceptance Criteria:**
- `GET /api/health` returns `{ status: 'ok' }` with a 200
- Supabase client initialized once and reused across routes
- Invalid requests return `{ error: 'message' }` with a 400
- CORS headers allow requests from localhost:3000

**Dependencies:** DB-01 (Supabase credentials from your group)

**Notes:** Use Next.js Route Handlers (app router — `app/api/route.ts` pattern), not the old `pages/api` pattern.

---

#### BE-02 — GET /api/asks — Fetch Active Sell Offers

**Description:** Implement `GET /api/asks`. Returns all active sell offers (`status = pending`, `expires_at > now`) from the `offers` table ordered by `price_per_swipe` ascending. Response: `{ asks: [{ offer_id, seller_address, swipe_count, price_per_swipe, expires_at }] }`.

**Acceptance Criteria:**
- Returns only `status = 'pending'` and non-expired offers
- Results ordered by `price_per_swipe` ascending (cheapest first)
- Returns empty array (not an error) if no offers exist
- Returns 200 with the correct response shape
- Unit test: seed 3 offers (1 expired, 2 active), assert only 2 returned

**Dependencies:** BE-01

**Notes:** Filter expired offers using `expires_at < NOW()` in the Supabase query, not in application code.

---

#### BE-03 — GET /api/bids — Fetch Active Buy Offers

**Description:** Implement `GET /api/bids`. Returns all active buy offers (`status = pending`) ordered by `price_per_swipe` descending (highest bidder first). Response mirrors `/api/asks` but `type = 'bid'`.

**Acceptance Criteria:**
- Returns only bid-type pending non-expired offers
- Ordered by `price_per_swipe` descending
- Returns empty array if no bids
- Unit test: seed 2 bids, assert both returned in correct order

**Dependencies:** BE-01

---

### Sprint 2 — Auth Verification & History Endpoints

---

#### BE-04 — POST /api/verify — Student Email Verification

**Description:** Implement `POST /api/verify`. Accepts `{ wallet_address, davidson_email }`. Checks if the email exists in the `students` table (seed list). If found and wallet not already mapped, saves the wallet address to that student record. Returns `{ success: true }` or an error.

**Acceptance Criteria:**
- Returns 200 and saves wallet if email is in seed list and unverified
- Returns 409 if the wallet is already verified
- Returns 404 if the email is not in the seed list
- `wallet_address` is lowercased before saving
- A `/scripts/seed-students.ts` script loads ~20 test Davidson emails into the DB

**Dependencies:** BE-01, DB-01

**Notes:** For the prototype, seed ~20 fake `@davidson.edu` addresses. The seed script should be easy to re-run.

---

#### BE-05 — GET /api/trades & GET /api/redemptions

**Description:** Implement two read endpoints. `GET /api/trades` returns completed trades (`status = accepted`) ordered by `traded_at` descending, optionally filtered by `?wallet=0x...`. `GET /api/redemptions` returns completed redemptions ordered by `redeemed_at` descending, optionally filtered by `?wallet=0x...`.

**Acceptance Criteria:**
- `GET /api/trades` returns trades ordered by `traded_at` descending
- `GET /api/redemptions` returns redemptions ordered by `redeemed_at` descending
- Both support optional `?wallet=` query param
- Both return empty arrays (not errors) when no records exist
- Invalid wallet format returns 400

**Dependencies:** BE-01, DB-01

---

### Sprint 3 — Expiry Cron & Input Hardening

---

#### BE-06 — Offer Expiry: Scheduled Cleanup

**Description:** Implement automatic offer expiry. Every Saturday at 11:50pm, mark all pending offers as `expired` in the DB. Use a Vercel Cron Job (`vercel.json`) or scheduled function. Also expose `POST /api/admin/expire` for manual triggering during testing, protected by a secret token.

**Acceptance Criteria:**
- Scheduled task runs at Saturday 11:50pm
- All pending offers marked expired in the DB
- `POST /api/admin/expire` manually triggers the same logic
- Admin endpoint requires `Authorization: Bearer <secret>` header
- Unit test: seed 3 pending offers, call endpoint, assert all expired

**Dependencies:** BE-01, DB-01

**Notes:** The on-chain epoch (`burnAll`) burns tokens. This DB cleanup is a separate concern for the listings UI.

---

#### BE-07 — Input Validation & Error Hardening

**Description:** Audit all API endpoints for missing validation. Add a shared `validateRequest()` utility in `/lib/validate.ts`. Validate: wallet address format (`/^0x[a-fA-F0-9]{40}$/`), price range (`0 < price ≤ 12`), swipe count (1–6 integers). Return structured `{ error, field }` objects on all failures.

**Acceptance Criteria:**
- Invalid wallet address returns 400 with `field: 'wallet_address'`
- Price > 12 returns 400 with `field: 'price_per_swipe'`
- Swipe count of 0 or > 6 returns 400 with `field: 'swipe_count'`
- All endpoints return consistent `{ error, field }` error shapes
- A shared `validateRequest()` utility used — no duplicate validation logic

**Dependencies:** BE-02, BE-03, BE-04, BE-05

**Notes:** Create `/lib/validate.ts` and import it from all route handlers.

---

### Sprint 4 — Wallet History & Vercel Deploy

---

#### BE-08 — GET /api/wallet/:address/history

**Description:** Implement a combined history endpoint. Returns a chronologically sorted list of a wallet's trades and redemptions. Each item has: `type` (`trade_bought`, `trade_sold`, `redemption`), `swipe_count`, `price` (null for redemptions), `timestamp`, `tx_hash`.

**Acceptance Criteria:**
- Returns events for buying, selling, and redemptions for a given address
- Events sorted by timestamp descending
- Each event has all required fields including `type` and `tx_hash`
- Returns empty array if no history
- `wallet_address` lookup is case-insensitive

**Dependencies:** BE-05, DB-01

**Notes:** This is a union query across `trades` and `redemptions`. Keep it in one Supabase query for efficiency.

---

#### BE-09 — Deploy Next.js App to Vercel

**Description:** Deploy the Next.js app (frontend + API routes) to Vercel. Configure all environment variables in the Vercel dashboard. Confirm all API endpoints return correct responses on the live URL.

**Acceptance Criteria:**
- App is live on a Vercel URL
- All env vars set in Vercel dashboard — nothing hardcoded
- `GET /api/health` returns 200 on the live URL
- All pages load in under 3 seconds on a mobile connection
- API endpoints work correctly from the deployed frontend

**Dependencies:** All BE and FE tickets

**Notes:** Connect the Vercel project to the GitHub repo for automatic deployments on push to main.

---

## Dependency Map

```
DB-01 ──────────────────────────────► BE-01 ──► BE-02, BE-03
  │                                              BE-04, BE-05
  │                                              BE-06, BE-07, BE-08
  │
MEAL-01 ──► MARK-01 ──► CONT-02 ──► IDX-03 ──► IDX-04 ──► IDX-05
                │                      │
                │                   IDX-06, IDX-07, IDX-08
                │
                └──► FE-04, FE-06, FE-07, FE-08, FE-09, FE-10
                     (all need contract ABIs from CONT-02)

IDX-02 (polling shell) ──► IDX-03, IDX-04, IDX-05

FE-01 ──► FE-02 ──► FE-03 ──► FE-04, FE-05, FE-06
BE-02, BE-03 ──► FE-05 (offer listings live data)
BE-04 ──► FE-11 (email verification)
```

## Sprint Summary

| Sprint | Your Group | Frontend | Backend |
|--------|-----------|----------|---------|
| 1 | DB-01, MEAL-01, MARK-01, IDX-01, IDX-02 | FE-01, FE-02, FE-03 | BE-01, BE-02, BE-03 |
| 2 | CONT-02, IDX-03, IDX-04, IDX-05 | FE-04, FE-05, FE-06 | BE-04, BE-05 |
| 3 | IDX-06, IDX-07, CONT-03 | FE-07, FE-08, FE-09 | BE-06, BE-07 |
| 4 | IDX-08, CONT-04, IDX-09 | FE-10, FE-11, FE-12 | BE-08, BE-09 |

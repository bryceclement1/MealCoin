# MealCoin — Indexer

Standalone Node.js process that polls Base Mainnet every 5 seconds for events from the MealSwipeToken and Marketplace contracts, decodes them with viem, and upserts the results into Supabase.

## What this does

The indexer is the only service that writes to the database. It keeps Supabase in sync with on-chain state so the frontend API routes can serve fast reads without hitting the RPC directly.

Every poll cycle it fetches new logs in chunks of 500 blocks and routes each event to a handler:

| Event | Source | DB write |
|-------|--------|----------|
| `OfferCreated` | Marketplace | Insert into `offers` (status = pending) |
| `OfferAccepted` | Marketplace | Update `offers` status, insert into `trades` |
| `OfferCancelled` | Marketplace | Update `offers` status = cancelled |
| `OfferExpired` | Marketplace | Update `offers` status = expired |
| `SwipeRedeemed` | MealSwipeToken | Insert into `redemptions` |
| `SwipesBurned` | MealSwipeToken | Mark all pending `offers` as expired |

It also runs a cron job at **Sunday 04:56 UTC (11:56 PM EST Saturday)** that calls `claimExpiredOffer()` on the contract for any offers that have passed their expiry — this is what triggers the `OfferExpired` events above.

## Setup

```bash
cp .env.example .env   # fill in your values
npm install
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `ALCHEMY_URL` | Base Mainnet RPC endpoint from Alchemy |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (not the anon key) |
| `TOKEN_ADDRESS` | Deployed MealSwipeToken address |
| `MARKET_ADDRESS` | Deployed Marketplace address |
| `PRIVATE_KEY` | Owner wallet private key (used by the Saturday cron) |
| `POLL_INTERVAL_MS` | (optional) Poll interval in ms, default `5000` |
| `CHUNK_SIZE` | (optional) Max blocks per RPC call, default `500` |

## Running

```bash
npm start        # production
npm run dev      # ts-node with auto-reload
```

The indexer persists the last processed block to `indexer/.lastblock` so it resumes correctly after a restart.

## Reliability

- RPC failures: exponential backoff, up to 5 retries (1s → 2s → 4s → 8s → 16s)
- DB write failures: retried with the same backoff strategy
- Gap detection: warns if more than 200 blocks are skipped between polls
- Loop never exits on error — always continues to the next poll cycle

## Deployment

Deployed to Railway. Set all env vars in the Railway dashboard. The run command is `npm start`. Railway auto-restarts on crash.

## Structure

```
src/
  index.ts              Main polling loop
  config.ts             Env var loading and validation
  db.ts                 Supabase write helpers
  retry.ts              Exponential backoff utility
  handlers/
    offerCreated.ts
    offerAccepted.ts
    offerCancelled.ts
    offerExpired.ts
    swipeRedeemed.ts
    swipesBurned.ts
  cron/
    expireOffers.ts     Saturday midnight cleanup job
abis/
  token.ts              MealSwipeToken ABI
  marketplace.ts        Marketplace ABI
```

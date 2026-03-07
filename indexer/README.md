# MealCoin Indexer

Standalone Node.js process that polls Base Sepolia every 5 seconds for events from the MealSwipeToken and Marketplace contracts, decodes them with viem, and upserts results into Supabase.

## Setup

```bash
cd indexer
npm install
cp ../.env.example .env   # fill in your values
```

### Required environment variables

| Variable | Description |
|----------|-------------|
| `ALCHEMY_URL` | Base Sepolia RPC endpoint from Alchemy |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (not the anon key) |
| `TOKEN_ADDRESS` | Deployed MealSwipeToken address |
| `MARKET_ADDRESS` | Deployed Marketplace address |
| `POLL_INTERVAL_MS` | (optional) Poll interval in ms, default `5000` |
| `CHUNK_SIZE` | (optional) Max blocks per RPC call, default `500` |

Contract addresses for Base Sepolia are in `/contracts/deployments/base-sepolia.json`.

## Running locally

```bash
# verify RPC connection
npm run test:rpc

# start the polling loop
npm start
```

The indexer persists the last processed block to `indexer/.lastblock` so it resumes correctly after a restart.

## Local fork with Anvil

```bash
# fork Base Sepolia locally for development testing
anvil --fork-url $ALCHEMY_URL
```

Then set `TOKEN_ADDRESS` and `MARKET_ADDRESS` to the same deployed addresses — Anvil forks the live chain state.

## Events handled

| Event | Source | DB action |
|-------|--------|-----------|
| `OfferCreated` | Marketplace | Upsert into `offers` (status = pending) |
| `OfferAccepted` | Marketplace | Update `offers` status + insert into `trades` |
| `OfferCancelled` | Marketplace | Update `offers` status = cancelled |
| `OfferExpired` | Marketplace | Update `offers` status = expired |
| `SwipeRedeemed` | MealSwipeToken | Insert into `redemptions` |
| `SwipesBurned` | MealSwipeToken | Mark all pending `offers` as expired |

## Reliability

- RPC failures: exponential backoff, up to 5 retries (1s / 2s / 4s / 8s / 16s)
- Gap detection: warns if more than 200 blocks are skipped
- DB write failures: retried once before logging
- Loop never exits on error — always continues to the next poll

## Deployment (Railway)

Set all env vars in the Railway dashboard (never hardcode them). The service uses `npm start` as the run command. Railway auto-restarts on crash.

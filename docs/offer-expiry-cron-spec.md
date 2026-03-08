# Offer Expiry Cron Job — Spec

## Purpose

At 11:55 PM EST every Saturday, all pending marketplace offers expire. The smart contract enforces this (any `acceptOffer` call after `expiresAt` reverts), but the escrowed assets (swipes for ask offers, USDC for bid offers) remain locked in the contract until `claimExpiredOffer` is called for each offer.

This cron job runs just after the cutoff, calls `claimExpiredOffer` on-chain for every expired pending offer, and lets the indexer handle the resulting `OfferExpired` events to update the database.

---

## What the Contract Does

**`claimExpiredOffer(uint256 offerId)`** on the Marketplace contract (`0x633d07e510Ef19fb1e812f20E146a535972C3CcF`):

- Callable by **anyone** (permissionless — no owner restriction)
- Reverts with `OfferNotFound` if offerId is out of range
- Reverts with `OfferNotPending` if the offer is already accepted, cancelled, or expired
- Reverts with `OfferNotYetExpired` if `block.timestamp < offer.expiresAt`
- On success:
  - Sets offer status to `Expired` on-chain
  - Transfers escrowed swipes back to the seller (for ask offers)
  - Transfers escrowed USDC back to the buyer (for bid offers)
  - Emits `OfferExpired(uint256 indexed offerId)`

The indexer already handles the `OfferExpired` event in `indexer/src/handlers/offerExpired.ts` — it looks up the offer by `onchain_offer_id` and calls `db.updateOfferStatus(offer.offer_id, 'expired')`.

---

## Where to Put It

Add the cron as a new script in the indexer package:

```
indexer/src/cron/expireOffers.ts   ← main cron script
```

It can reuse all existing indexer infrastructure: the Supabase client (`db` from `../db`), the retry helper (`withRetry` from `../retry`), and the config (`config` from `../config`).

---

## Required Environment Variables

The script uses the same `.env` as the indexer plus one addition:

| Variable | Source | Purpose |
|---|---|---|
| `ALCHEMY_URL` | `indexer/.env` | RPC endpoint for sending transactions |
| `SUPABASE_URL` | `indexer/.env` | Supabase connection |
| `SUPABASE_SERVICE_KEY` | `indexer/.env` | Supabase auth |
| `MARKET_ADDRESS` | `indexer/.env` | Marketplace contract address |
| `PRIVATE_KEY` | new — add to `indexer/.env` | Wallet used to send `claimExpiredOffer` txs |

The wallet for `PRIVATE_KEY` just needs ETH for gas — it does not need to be the contract owner. The deployer wallet (`0xa071Bf48760C8Cc63C9353c60e880cce043E2544`) works fine.

---

## Implementation Steps

### 1. Query expired pending offers from Supabase

```typescript
const { data, error } = await supabase
  .from('offers')
  .select('onchain_offer_id')
  .eq('status', 'pending')
  .lt('expires_at', new Date().toISOString())
```

This returns all offers that are past their `expiresAt` but haven't been processed yet.

### 2. Call `claimExpiredOffer` for each offer

Use viem's `walletClient.writeContract` to send the transaction:

```typescript
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const account = privateKeyToAccount(config.privateKey as `0x${string}`)

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(config.rpcUrl),
})

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(config.rpcUrl),
})
```

For each offer:
```typescript
const hash = await walletClient.writeContract({
  address: config.marketAddress,
  abi: MARKETPLACE_ABI,
  functionName: 'claimExpiredOffer',
  args: [BigInt(offer.onchain_offer_id)],
})
await publicClient.waitForTransactionReceipt({ hash })
```

Wrap each call in `withRetry` from `../retry` with 3 attempts.

### 3. Log results

Log each processed offer and any failures. Do not throw on individual offer failures — process the rest and report errors at the end.

### 4. Schedule with node-cron

```typescript
import cron from 'node-cron'

// 11:56 PM EST every Saturday = 4:56 AM UTC every Sunday
// Runs 1 minute after the 11:55 PM EST cutoff
cron.schedule('56 4 * * 0', async () => {
  console.log('[CRON] Running offer expiry job...')
  await expireOffers()
})
```

Install `node-cron`: `npm install node-cron` and `npm install -D @types/node-cron`

The cron expression `56 4 * * 0` means: minute 56, hour 4, any day of month, any month, Sunday (day 0). This is 04:56 UTC Sunday = 11:56 PM EST Saturday — 1 minute after offers expire.

---

## Timing

| Event | EST | UTC |
|---|---|---|
| Offers stop being accepted (contract enforced) | 11:55 PM Sat | 04:55 AM Sun |
| Cron fires | 11:56 PM Sat | 04:56 AM Sun |
| `claimExpiredOffer` txs land on-chain | ~11:56–11:58 PM Sat | 04:56–04:58 AM Sun |
| Indexer picks up `OfferExpired` events | within 10s of tx | — |
| DB offer status updated to `expired` | shortly after | — |

---

## Integration with Existing Code

- **No changes needed to the indexer** — it already handles `OfferExpired` events in `indexer/src/handlers/offerExpired.ts`
- **No changes needed to the contracts** — `claimExpiredOffer` is already deployed
- **Reuse `MARKETPLACE_ABI`** from `indexer/abis/marketplace.ts`
- **Reuse `withRetry`** from `indexer/src/retry.ts`
- **Reuse `db`** from `indexer/src/db.ts` (already has `expireAllPendingOffers` if a bulk DB fallback is needed)

---

## Where to Run It

The cron can either:

1. **Run inside the indexer process** — import and register the cron schedule in `indexer/src/index.ts` alongside the polling loop. Simple, no extra process needed.
2. **Run as a separate Railway service** — deploy as its own process with its own start command. Better isolation but more infrastructure.

Option 1 is recommended for the prototype.

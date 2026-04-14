/**
 * Handler for the OfferCreated contract event.
 *
 * Fired when a user calls createSellOffer() or createBuyOffer() on the Marketplace.
 * Inserts (or updates, if replaying) the offer in the Supabase `offers` table
 * with status "pending".
 */

import { db } from '../db'
import { config } from '../config'
import { withRetry } from '../retry'

/**
 * Decode the OfferCreated log and upsert the offer into the database.
 *
 * Key conversions:
 *   - offerType 0 → 'ask' (sell), 1 → 'bid' (buy)
 *   - pricePerSwipe is in USDC's 6-decimal units (e.g. 7_000_000 = $7.00)
 *   - expiresAt is a Unix timestamp from the contract, converted to ISO string
 */
export async function handleOfferCreated(log: any): Promise<void> {
  const { offerId, creator, offerType, swipeCount, pricePerSwipe, expiresAt } = log.args

  const type = offerType === 0 ? 'ask' : 'bid'
  const priceDecimal = Number(pricePerSwipe) / 1_000_000  // 6 decimals → dollars

  console.log(`[OfferCreated] offerId=${offerId} type=${type} creator=${creator} price=$${priceDecimal}`)

  await withRetry(() =>
    db.upsertOffer({
      onchain_offer_id: Number(offerId),
      contract_address: config.marketAddress.toLowerCase(),
      type,
      seller_address: creator.toLowerCase(),
      swipe_count: Number(swipeCount),
      price_per_swipe: priceDecimal,
      status: 'pending',
      tx_hash: log.transactionHash,
      expires_at: new Date(Number(expiresAt) * 1000).toISOString(),
    }),
    2, 'upsert offer'
  )
}

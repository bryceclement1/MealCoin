/**
 * Handler for the OfferAccepted contract event.
 *
 * Fired when a user calls acceptOffer() on the Marketplace, completing an
 * atomic swap between swipes and USDC. Updates the offer status to "accepted"
 * and inserts a row into the `trades` table recording both sides of the trade.
 */

import { db } from '../db'
import { config } from '../config'
import { withRetry } from '../retry'

/**
 * Decode the OfferAccepted log and write the trade outcome to the database.
 *
 * Steps:
 *   1. Look up the offer by its on-chain ID to retrieve price and creator details
 *   2. Mark the offer as "accepted"
 *   3. Insert a trade row with buyer, seller, swipe count, and total price
 *
 * The `acceptor` from the event is the buyer (the party who called acceptOffer).
 * The seller is the original offer creator, retrieved from the DB.
 */
export async function handleOfferAccepted(log: any): Promise<void> {
  const { offerId, acceptor } = log.args

  console.log(`[OfferAccepted] offerId=${offerId} acceptor=${acceptor}`)

  // 1. Look up the offer to get creator + price details
  const offer = await db.getOfferByOnchainId(Number(offerId), config.marketAddress.toLowerCase())
  if (!offer) {
    console.warn(`[WARN] OfferAccepted: no DB row for onchain_offer_id=${offerId}`)
    return
  }

  // 2. Update offer status
  await withRetry(() =>
    db.updateOfferStatus(offer.offer_id, 'accepted'),
    2, 'update offer accepted'
  )

  // 3. Insert trade row — total price is swipe count × price per swipe
  await withRetry(() =>
    db.insertTrade({
      offer_id: offer.offer_id,
      buyer_address: acceptor.toLowerCase(),
      seller_address: offer.seller_address,
      swipe_count: offer.swipe_count,
      price: offer.swipe_count * offer.price_per_swipe,
      tx_hash: log.transactionHash,
    }),
    2, 'insert trade'
  )
}

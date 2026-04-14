/**
 * Handler for the OfferCancelled contract event.
 *
 * Fired when the offer creator calls cancelOffer() on the Marketplace.
 * The contract returns the escrowed assets to the creator before emitting
 * this event. This handler simply reflects that state change in the DB.
 */

import { db } from '../db'
import { config } from '../config'
import { withRetry } from '../retry'

/**
 * Decode the OfferCancelled log and mark the offer as "cancelled" in the DB.
 * Logs a warning if the offer doesn't exist (can happen if the indexer missed
 * the OfferCreated event due to a gap).
 */
export async function handleOfferCancelled(log: any): Promise<void> {
  const { offerId } = log.args

  console.log(`[OfferCancelled] offerId=${offerId}`)

  const offer = await db.getOfferByOnchainId(Number(offerId), config.marketAddress.toLowerCase())
  if (!offer) {
    console.warn(`[WARN] OfferCancelled: no DB row for onchain_offer_id=${offerId}`)
    return
  }

  await withRetry(() =>
    db.updateOfferStatus(offer.offer_id, 'cancelled'),
    2, 'update offer cancelled'
  )
}

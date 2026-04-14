/**
 * Handler for the OfferExpired contract event.
 *
 * Fired when claimExpiredOffer() is called on the Marketplace for an offer
 * whose expiry timestamp has passed. This is triggered by the Saturday
 * expiry cron job in cron/expireOffers.ts. The contract returns the escrowed
 * assets to the creator before emitting this event.
 */

import { db } from '../db'
import { config } from '../config'
import { withRetry } from '../retry'

/**
 * Decode the OfferExpired log and mark the offer as "expired" in the DB.
 * Silently returns if the offer isn't found — this can happen if the indexer
 * missed the original OfferCreated event.
 */
export async function handleOfferExpired(log: any): Promise<void> {
  const { offerId } = log.args

  console.log(`[OfferExpired] offerId=${offerId}`)

  const offer = await db.getOfferByOnchainId(Number(offerId), config.marketAddress.toLowerCase())
  if (!offer) return

  await withRetry(() =>
    db.updateOfferStatus(offer.offer_id, 'expired'),
    2, 'update offer expired'
  )
}

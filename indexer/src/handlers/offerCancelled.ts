import { db } from '../db'
import { withRetry } from '../retry'

export async function handleOfferCancelled(log: any): Promise<void> {
  const { offerId } = log.args

  console.log(`[OfferCancelled] offerId=${offerId}`)

  const offer = await db.getOfferByOnchainId(Number(offerId))
  if (!offer) {
    console.warn(`[WARN] OfferCancelled: no DB row for onchain_offer_id=${offerId}`)
    return
  }

  await withRetry(() =>
    db.updateOfferStatus(offer.offer_id, 'cancelled'),
    2, 'update offer cancelled'
  )
}

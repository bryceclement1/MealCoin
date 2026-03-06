import { db } from '../db'
import { withRetry } from '../retry'

export async function handleOfferExpired(log: any): Promise<void> {
  const { offerId } = log.args

  console.log(`[OfferExpired] offerId=${offerId}`)

  const offer = await db.getOfferByOnchainId(Number(offerId))
  if (!offer) return

  await withRetry(() =>
    db.updateOfferStatus(offer.offer_id, 'expired'),
    2, 'update offer expired'
  )
}

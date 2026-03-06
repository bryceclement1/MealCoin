import { db } from '../db'
import { withRetry } from '../retry'

export async function handleOfferAccepted(log: any): Promise<void> {
  const { offerId, acceptor } = log.args

  console.log(`[OfferAccepted] offerId=${offerId} acceptor=${acceptor}`)

  // 1. Look up the offer to get creator + price details
  const offer = await db.getOfferByOnchainId(Number(offerId))
  if (!offer) {
    console.warn(`[WARN] OfferAccepted: no DB row for onchain_offer_id=${offerId}`)
    return
  }

  // 2. Update offer status
  await withRetry(() =>
    db.updateOfferStatus(offer.offer_id, 'accepted'),
    2, 'update offer accepted'
  )

  // 3. Insert trade row
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

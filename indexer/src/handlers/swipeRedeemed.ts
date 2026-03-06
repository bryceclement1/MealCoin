import { db } from '../db'
import { withRetry } from '../retry'

export async function handleSwipeRedeemed(log: any): Promise<void> {
  const { wallet } = log.args

  console.log(`[SwipeRedeemed] wallet=${wallet} tx=${log.transactionHash}`)

  await withRetry(() =>
    db.upsertRedemption({
      wallet_address: wallet.toLowerCase(),
      tx_hash: log.transactionHash,
    }),
    2, 'upsert redemption'
  )
}

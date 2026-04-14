/**
 * Handler for the SwipeRedeemed contract event.
 *
 * Fired when an approved dining terminal calls redeemSwipe(studentAddress) on
 * the MealSwipeToken contract, burning exactly one swipe from the student's
 * balance. Records the redemption in the `redemptions` table for history tracking.
 */

import { db } from '../db'
import { withRetry } from '../retry'

/**
 * Decode the SwipeRedeemed log and insert a redemption record into the DB.
 * Uses upsert so replaying the event on indexer restart doesn't create duplicates.
 */
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

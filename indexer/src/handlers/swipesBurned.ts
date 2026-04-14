/**
 * Handler for the SwipesBurned contract event.
 *
 * Fired when burnAll(week) is called on the MealSwipeToken contract at the
 * weekly Saturday midnight rollover. All token balances for that week epoch
 * become inaccessible on-chain. Any offers that were still pending at that
 * point are now void — this handler bulk-expires them all in the DB so the
 * marketplace UI stops showing them immediately.
 */

import { db } from '../db'

/**
 * Decode the SwipesBurned log, then expire all pending offers in the DB.
 * Logs how many swipes were burned (from the event) and how many offer rows
 * were updated (from the DB operation).
 */
export async function handleSwipesBurned(log: any): Promise<void> {
  const { week, totalBurned } = log.args

  const count = await db.expireAllPendingOffers()
  console.log(`[EPOCH] Week ${week} rolled over — ${totalBurned} swipes burned, ${count} offers expired`)
}

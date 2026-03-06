import { db } from '../db'

export async function handleSwipesBurned(log: any): Promise<void> {
  const { week, totalBurned } = log.args

  const count = await db.expireAllPendingOffers()
  console.log(`[EPOCH] Week ${week} rolled over — ${totalBurned} swipes burned, ${count} offers expired`)
}

/**
 * Tests for the SwipesBurned event handler (src/handlers/swipesBurned.ts).
 *
 * Covers:
 *   - Calls expireAllPendingOffers when the epoch rolls over
 *   - Works correctly when no offers are pending (returns 0)
 *   - Works when many offers are expired (returns correct count)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/db', () => ({
  db: {
    expireAllPendingOffers: vi.fn(),
  },
}))

import { handleSwipesBurned } from '../../src/handlers/swipesBurned'
import { db } from '../../src/db'

const mockExpireAll = db.expireAllPendingOffers as ReturnType<typeof vi.fn>

const BASE_LOG = {
  args: { week: 2850n, totalBurned: 42n },
}

describe('handleSwipesBurned', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls expireAllPendingOffers once per event', async () => {
    mockExpireAll.mockResolvedValue(0)
    await handleSwipesBurned(BASE_LOG)
    expect(mockExpireAll).toHaveBeenCalledOnce()
  })

  it('handles zero pending offers gracefully', async () => {
    mockExpireAll.mockResolvedValue(0)
    await expect(handleSwipesBurned(BASE_LOG)).resolves.toBeUndefined()
  })

  it('handles many expired offers without throwing', async () => {
    mockExpireAll.mockResolvedValue(15)
    await expect(handleSwipesBurned(BASE_LOG)).resolves.toBeUndefined()
    expect(mockExpireAll).toHaveBeenCalledOnce()
  })
})

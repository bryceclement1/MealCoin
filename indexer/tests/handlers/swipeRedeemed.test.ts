/**
 * Tests for the SwipeRedeemed event handler (src/handlers/swipeRedeemed.ts).
 *
 * Covers:
 *   - Inserts a redemption row with the correct wallet address and tx_hash
 *   - Lowercases the wallet address before storing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/db', () => ({
  db: {
    upsertRedemption: vi.fn().mockResolvedValue(undefined),
  },
}))

import { handleSwipeRedeemed } from '../../src/handlers/swipeRedeemed'
import { db } from '../../src/db'

const mockUpsertRedemption = db.upsertRedemption as ReturnType<typeof vi.fn>

const BASE_LOG = {
  transactionHash: '0xredeemtx',
  args: { wallet: '0xSTUDENT' },
}

describe('handleSwipeRedeemed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls upsertRedemption once', async () => {
    await handleSwipeRedeemed(BASE_LOG)
    expect(mockUpsertRedemption).toHaveBeenCalledOnce()
  })

  it('lowercases the wallet address', async () => {
    await handleSwipeRedeemed(BASE_LOG)
    const row = mockUpsertRedemption.mock.calls[0][0]
    expect(row.wallet_address).toBe('0xstudent')
  })

  it('passes the tx_hash from the log', async () => {
    await handleSwipeRedeemed(BASE_LOG)
    const row = mockUpsertRedemption.mock.calls[0][0]
    expect(row.tx_hash).toBe('0xredeemtx')
  })
})

/**
 * Tests for the OfferExpired event handler (src/handlers/offerExpired.ts).
 *
 * Covers:
 *   - Updates offer status to 'expired'
 *   - Silently returns when the offer is not in the DB
 *   - Looks up by the correct onchain_offer_id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/db', () => ({
  db: {
    getOfferByOnchainId: vi.fn(),
    updateOfferStatus: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../src/config', () => ({
  config: { marketAddress: '0xMarket' },
}))

import { handleOfferExpired } from '../../src/handlers/offerExpired'
import { db } from '../../src/db'

const mockGetOffer = db.getOfferByOnchainId as ReturnType<typeof vi.fn>
const mockUpdateStatus = db.updateOfferStatus as ReturnType<typeof vi.fn>

const BASE_LOG = {
  transactionHash: '0xexpiretx',
  args: { offerId: 7n },
}

describe('handleOfferExpired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOffer.mockResolvedValue({ offer_id: 'uuid-777' })
  })

  it('marks the offer as expired', async () => {
    await handleOfferExpired(BASE_LOG)
    expect(mockUpdateStatus).toHaveBeenCalledWith('uuid-777', 'expired')
  })

  it('looks up by onchain_offer_id and lowercased market address', async () => {
    await handleOfferExpired(BASE_LOG)
    expect(mockGetOffer).toHaveBeenCalledWith(7, '0xmarket')
  })

  it('silently returns without error when offer is not found', async () => {
    mockGetOffer.mockResolvedValue(null)
    // Should not throw
    await expect(handleOfferExpired(BASE_LOG)).resolves.toBeUndefined()
    expect(mockUpdateStatus).not.toHaveBeenCalled()
  })
})

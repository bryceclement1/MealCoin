/**
 * Tests for the OfferCancelled event handler (src/handlers/offerCancelled.ts).
 *
 * Covers:
 *   - Updates offer status to 'cancelled'
 *   - Returns early when the offer is not in the DB (missing OfferCreated event)
 *   - Looks up by the correct onchain_offer_id and contract address
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

import { handleOfferCancelled } from '../../src/handlers/offerCancelled'
import { db } from '../../src/db'

const mockGetOffer = db.getOfferByOnchainId as ReturnType<typeof vi.fn>
const mockUpdateStatus = db.updateOfferStatus as ReturnType<typeof vi.fn>

const BASE_LOG = {
  transactionHash: '0xcanceltx',
  args: { offerId: 5n },
}

describe('handleOfferCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOffer.mockResolvedValue({ offer_id: 'uuid-555' })
  })

  it('marks the offer as cancelled', async () => {
    await handleOfferCancelled(BASE_LOG)
    expect(mockUpdateStatus).toHaveBeenCalledWith('uuid-555', 'cancelled')
  })

  it('looks up by onchain_offer_id and lowercased market address', async () => {
    await handleOfferCancelled(BASE_LOG)
    expect(mockGetOffer).toHaveBeenCalledWith(5, '0xmarket')
  })

  it('does not update status when offer is not found', async () => {
    mockGetOffer.mockResolvedValue(null)
    await handleOfferCancelled(BASE_LOG)
    expect(mockUpdateStatus).not.toHaveBeenCalled()
  })
})

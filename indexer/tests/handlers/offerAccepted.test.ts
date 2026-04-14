/**
 * Tests for the OfferAccepted event handler (src/handlers/offerAccepted.ts).
 *
 * Covers:
 *   - Updates offer status to 'accepted'
 *   - Inserts a trade row with correct buyer, seller, price
 *   - Logs a warning and returns early when the offer is not found in the DB
 *   - Lowercases the buyer address
 *   - Calculates total price as swipe_count × price_per_swipe
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/db', () => ({
  db: {
    getOfferByOnchainId: vi.fn(),
    updateOfferStatus: vi.fn().mockResolvedValue(undefined),
    insertTrade: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../src/config', () => ({
  config: { marketAddress: '0xMarket' },
}))

import { handleOfferAccepted } from '../../src/handlers/offerAccepted'
import { db } from '../../src/db'

const mockGetOffer = db.getOfferByOnchainId as ReturnType<typeof vi.fn>
const mockUpdateStatus = db.updateOfferStatus as ReturnType<typeof vi.fn>
const mockInsertTrade = db.insertTrade as ReturnType<typeof vi.fn>

const MOCK_DB_OFFER = {
  offer_id: 'uuid-123',
  seller_address: '0xalice',
  swipe_count: 3,
  price_per_swipe: 7.00,
}

const BASE_LOG = {
  transactionHash: '0xdeadbeef',
  args: {
    offerId: 1n,
    acceptor: '0xBOB',
  },
}

describe('handleOfferAccepted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOffer.mockResolvedValue(MOCK_DB_OFFER)
  })

  it('marks the offer as accepted', async () => {
    await handleOfferAccepted(BASE_LOG)
    expect(mockUpdateStatus).toHaveBeenCalledWith('uuid-123', 'accepted')
  })

  it('inserts a trade row with the correct buyer address (lowercased)', async () => {
    await handleOfferAccepted(BASE_LOG)
    expect(mockInsertTrade).toHaveBeenCalledOnce()
    const trade = mockInsertTrade.mock.calls[0][0]
    expect(trade.buyer_address).toBe('0xbob')
  })

  it('inserts a trade row with the seller from the DB offer', async () => {
    await handleOfferAccepted(BASE_LOG)
    const trade = mockInsertTrade.mock.calls[0][0]
    expect(trade.seller_address).toBe('0xalice')
  })

  it('calculates total price as swipe_count × price_per_swipe', async () => {
    await handleOfferAccepted(BASE_LOG)
    const trade = mockInsertTrade.mock.calls[0][0]
    expect(trade.price).toBeCloseTo(21.00, 5)  // 3 swipes × $7.00
  })

  it('includes the tx_hash in the trade row', async () => {
    await handleOfferAccepted(BASE_LOG)
    const trade = mockInsertTrade.mock.calls[0][0]
    expect(trade.tx_hash).toBe('0xdeadbeef')
  })

  it('returns early without writing to DB when offer is not found', async () => {
    mockGetOffer.mockResolvedValue(null)
    await handleOfferAccepted(BASE_LOG)
    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(mockInsertTrade).not.toHaveBeenCalled()
  })

  it('looks up the offer using the correct onchain_offer_id', async () => {
    await handleOfferAccepted(BASE_LOG)
    // First arg is the numeric offerId, second is lowercase market address
    expect(mockGetOffer).toHaveBeenCalledWith(1, '0xmarket')
  })
})

/**
 * Tests for the OfferCreated event handler (src/handlers/offerCreated.ts).
 *
 * Covers:
 *   - Ask (sell) offer is stored with type 'ask'
 *   - Bid (buy) offer is stored with type 'bid'
 *   - Price is correctly converted from 6-decimal USDC units to dollars
 *   - expiresAt Unix timestamp is converted to ISO string
 *   - seller_address and contract_address are lowercased
 *   - db.upsertOffer is called with correct arguments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the db module before importing the handler
vi.mock('../../src/db', () => ({
  db: {
    upsertOffer: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock config so the handler doesn't require env vars
vi.mock('../../src/config', () => ({
  config: {
    marketAddress: '0xA030C790F2509C653fd7856092eE758aB8f6b360',
  },
}))

import { handleOfferCreated } from '../../src/handlers/offerCreated'
import { db } from '../../src/db'

const mockUpsertOffer = db.upsertOffer as ReturnType<typeof vi.fn>

const BASE_LOG = {
  transactionHash: '0xabc123',
  args: {
    offerId: 1n,
    creator: '0xAlice',
    offerType: 0,           // 0 = ask
    swipeCount: 3n,
    pricePerSwipe: 7_000_000n,  // $7.00 in USDC 6-decimal
    expiresAt: 1700000000n,     // Unix timestamp
  },
}

describe('handleOfferCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores an ask offer with type "ask"', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    expect(mockUpsertOffer).toHaveBeenCalledOnce()
    expect(mockUpsertOffer.mock.calls[0][0]).toMatchObject({ type: 'ask' })
  })

  it('stores a bid offer with type "bid"', async () => {
    const bidLog = { ...BASE_LOG, args: { ...BASE_LOG.args, offerType: 1 } }
    await handleOfferCreated(bidLog)
    expect(mockUpsertOffer.mock.calls[0][0]).toMatchObject({ type: 'bid' })
  })

  it('converts pricePerSwipe from 6-decimal USDC to dollars', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    const row = mockUpsertOffer.mock.calls[0][0]
    expect(row.price_per_swipe).toBeCloseTo(7.00, 5)
  })

  it('converts expiresAt Unix timestamp to ISO string', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    const row = mockUpsertOffer.mock.calls[0][0]
    const expected = new Date(Number(1700000000n) * 1000).toISOString()
    expect(row.expires_at).toBe(expected)
  })

  it('lowercases the seller_address', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    const row = mockUpsertOffer.mock.calls[0][0]
    expect(row.seller_address).toBe('0xalice')
  })

  it('lowercases the contract_address', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    const row = mockUpsertOffer.mock.calls[0][0]
    expect(row.contract_address).toBe('0xa030c790f2509c653fd7856092ee758ab8f6b360')
  })

  it('stores status as "pending"', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    expect(mockUpsertOffer.mock.calls[0][0]).toMatchObject({ status: 'pending' })
  })

  it('stores the tx_hash from the log', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    expect(mockUpsertOffer.mock.calls[0][0]).toMatchObject({ tx_hash: '0xabc123' })
  })

  it('stores swipe_count as a number (not bigint)', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    const row = mockUpsertOffer.mock.calls[0][0]
    expect(typeof row.swipe_count).toBe('number')
    expect(row.swipe_count).toBe(3)
  })

  it('stores onchain_offer_id as a number', async () => {
    await handleOfferCreated({ ...BASE_LOG })
    const row = mockUpsertOffer.mock.calls[0][0]
    expect(typeof row.onchain_offer_id).toBe('number')
    expect(row.onchain_offer_id).toBe(1)
  })
})

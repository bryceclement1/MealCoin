/**
 * Tests for the Supabase DB layer (src/db.ts).
 *
 * All Supabase calls are mocked — no real DB connections are made.
 * Each db method is tested for:
 *   - Correct table name passed to from()
 *   - Correct operation and arguments
 *   - Successful resolution
 *   - Error thrown with a descriptive message on DB failure
 *
 * expireAllPendingOffers also verifies the returned row count.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/config', () => ({
  config: {
    supabaseUrl: 'https://fake.supabase.co',
    supabaseKey: 'fake-key',
  },
}))

// vi.mock factories are hoisted before variable declarations, so we must
// use vi.hoisted() to create variables that are referenced inside a factory.
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

import { db } from '../src/db'

// ---------------------------------------------------------------------------
// Helper — builds a fluent Supabase query builder whose terminal step resolves
// with `result`.  The `then` property makes the whole chain directly awaitable
// for methods that don't have a named terminal (e.g. update().eq()).
// ---------------------------------------------------------------------------
function makeChain(result: unknown) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['select', 'eq', 'lt', 'update', 'upsert', 'insert', 'neq', 'order', 'limit']) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  q.maybeSingle = vi.fn().mockResolvedValue(result)
  ;(q as any).then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  return q
}

describe('db', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── upsertOffer ─────────────────────────────────────────────────────────────

  describe('upsertOffer', () => {
    const ROW = {
      onchain_offer_id: 1,
      contract_address: '0xmarket',
      type: 'ask' as const,
      seller_address: '0xalice',
      swipe_count: 3,
      price_per_swipe: 7.00,
      status: 'pending',
      tx_hash: '0xabc',
      expires_at: '2099-01-01T00:00:00.000Z',
    }

    it('resolves without throwing on success', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await expect(db.upsertOffer(ROW)).resolves.toBeUndefined()
    })

    it('calls from("offers")', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await db.upsertOffer(ROW)
      expect(mockFrom).toHaveBeenCalledWith('offers')
    })

    it('calls upsert with the row and the compound conflict key', async () => {
      const q = makeChain({ error: null })
      mockFrom.mockReturnValue(q)
      await db.upsertOffer(ROW)
      expect(q.upsert).toHaveBeenCalledWith(ROW, { onConflict: 'onchain_offer_id,contract_address' })
    })

    it('throws an Error containing the DB message on failure', async () => {
      mockFrom.mockReturnValue(makeChain({ error: { message: 'duplicate key' } }))
      await expect(db.upsertOffer(ROW)).rejects.toThrow('upsertOffer: duplicate key')
    })
  })

  // ── getOfferByOnchainId ─────────────────────────────────────────────────────

  describe('getOfferByOnchainId', () => {
    const FOUND = { offer_id: 'uuid-111', seller_address: '0xalice', swipe_count: 3, price_per_swipe: 7 }

    it('returns the offer row when found', async () => {
      mockFrom.mockReturnValue(makeChain({ data: FOUND, error: null }))
      await expect(db.getOfferByOnchainId(1, '0xmarket')).resolves.toEqual(FOUND)
    })

    it('returns null when the offer is not in the DB', async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
      await expect(db.getOfferByOnchainId(99, '0xmarket')).resolves.toBeNull()
    })

    it('filters by onchain_offer_id', async () => {
      const q = makeChain({ data: null, error: null })
      mockFrom.mockReturnValue(q)
      await db.getOfferByOnchainId(5, '0xabc')
      expect(q.eq).toHaveBeenCalledWith('onchain_offer_id', 5)
    })

    it('filters by contract_address', async () => {
      const q = makeChain({ data: null, error: null })
      mockFrom.mockReturnValue(q)
      await db.getOfferByOnchainId(5, '0xabc')
      expect(q.eq).toHaveBeenCalledWith('contract_address', '0xabc')
    })

    it('throws an Error containing the DB message on failure', async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'timeout' } }))
      await expect(db.getOfferByOnchainId(1, '0xmarket')).rejects.toThrow('getOfferByOnchainId: timeout')
    })
  })

  // ── updateOfferStatus ───────────────────────────────────────────────────────

  describe('updateOfferStatus', () => {
    it('resolves without throwing on success', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await expect(db.updateOfferStatus('uuid-222', 'accepted')).resolves.toBeUndefined()
    })

    it('calls from("offers")', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await db.updateOfferStatus('uuid-222', 'accepted')
      expect(mockFrom).toHaveBeenCalledWith('offers')
    })

    it('passes the correct status to update()', async () => {
      const q = makeChain({ error: null })
      mockFrom.mockReturnValue(q)
      await db.updateOfferStatus('uuid-222', 'cancelled')
      expect(q.update).toHaveBeenCalledWith({ status: 'cancelled' })
    })

    it('filters by the provided offer_id', async () => {
      const q = makeChain({ error: null })
      mockFrom.mockReturnValue(q)
      await db.updateOfferStatus('uuid-target', 'expired')
      expect(q.eq).toHaveBeenCalledWith('offer_id', 'uuid-target')
    })

    it('throws an Error containing the DB message on failure', async () => {
      mockFrom.mockReturnValue(makeChain({ error: { message: 'row not found' } }))
      await expect(db.updateOfferStatus('uuid-222', 'accepted')).rejects.toThrow('updateOfferStatus: row not found')
    })
  })

  // ── insertTrade ─────────────────────────────────────────────────────────────

  describe('insertTrade', () => {
    const TRADE = {
      offer_id: 'uuid-offer',
      buyer_address: '0xbob',
      seller_address: '0xalice',
      swipe_count: 2,
      price: 14.00,
      tx_hash: '0xtrade',
    }

    it('resolves without throwing on success', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await expect(db.insertTrade(TRADE)).resolves.toBeUndefined()
    })

    it('calls from("trades")', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await db.insertTrade(TRADE)
      expect(mockFrom).toHaveBeenCalledWith('trades')
    })

    it('upserts on tx_hash to prevent duplicate trade rows', async () => {
      const q = makeChain({ error: null })
      mockFrom.mockReturnValue(q)
      await db.insertTrade(TRADE)
      expect(q.upsert).toHaveBeenCalledWith(TRADE, { onConflict: 'tx_hash' })
    })

    it('throws an Error containing the DB message on failure', async () => {
      mockFrom.mockReturnValue(makeChain({ error: { message: 'constraint violation' } }))
      await expect(db.insertTrade(TRADE)).rejects.toThrow('insertTrade: constraint violation')
    })
  })

  // ── upsertRedemption ────────────────────────────────────────────────────────

  describe('upsertRedemption', () => {
    const ROW = { wallet_address: '0xstudent', tx_hash: '0xredeem' }

    it('resolves without throwing on success', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await expect(db.upsertRedemption(ROW)).resolves.toBeUndefined()
    })

    it('calls from("redemptions")', async () => {
      mockFrom.mockReturnValue(makeChain({ error: null }))
      await db.upsertRedemption(ROW)
      expect(mockFrom).toHaveBeenCalledWith('redemptions')
    })

    it('upserts on tx_hash to prevent duplicate redemption rows', async () => {
      const q = makeChain({ error: null })
      mockFrom.mockReturnValue(q)
      await db.upsertRedemption(ROW)
      expect(q.upsert).toHaveBeenCalledWith(ROW, { onConflict: 'tx_hash' })
    })

    it('throws an Error containing the DB message on failure', async () => {
      mockFrom.mockReturnValue(makeChain({ error: { message: 'insert failed' } }))
      await expect(db.upsertRedemption(ROW)).rejects.toThrow('upsertRedemption: insert failed')
    })
  })

  // ── expireAllPendingOffers ──────────────────────────────────────────────────

  describe('expireAllPendingOffers', () => {
    it('returns the number of rows updated', async () => {
      mockFrom.mockReturnValue(makeChain({ data: [{ offer_id: 'a' }, { offer_id: 'b' }], error: null }))
      await expect(db.expireAllPendingOffers()).resolves.toBe(2)
    })

    it('returns 0 when no pending offers exist', async () => {
      mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
      await expect(db.expireAllPendingOffers()).resolves.toBe(0)
    })

    it('returns 0 when data is null', async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
      await expect(db.expireAllPendingOffers()).resolves.toBe(0)
    })

    it('updates status to "expired"', async () => {
      const q = makeChain({ data: [], error: null })
      mockFrom.mockReturnValue(q)
      await db.expireAllPendingOffers()
      expect(q.update).toHaveBeenCalledWith({ status: 'expired' })
    })

    it('filters by status = "pending"', async () => {
      const q = makeChain({ data: [], error: null })
      mockFrom.mockReturnValue(q)
      await db.expireAllPendingOffers()
      expect(q.eq).toHaveBeenCalledWith('status', 'pending')
    })

    it('calls from("offers")', async () => {
      mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
      await db.expireAllPendingOffers()
      expect(mockFrom).toHaveBeenCalledWith('offers')
    })

    it('throws an Error containing the DB message on failure', async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'bulk update failed' } }))
      await expect(db.expireAllPendingOffers()).rejects.toThrow('expireAllPendingOffers: bulk update failed')
    })
  })
})

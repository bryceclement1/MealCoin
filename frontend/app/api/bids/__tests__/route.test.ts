import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { GET } from '@/app/api/bids/route'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a fluent Supabase query-builder mock where order() resolves the chain. */
function mockQuery(result: { data: unknown[] | null; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
  vi.mocked(supabase.from).mockReturnValue(query as ReturnType<typeof supabase.from>)
  return query
}

/** A valid active bid row as the indexer writes it. */
function makeBid(overrides: Record<string, unknown> = {}) {
  return {
    offer_id: 'uuid-2222-2222-2222-222222222222',
    onchain_offer_id: 5,
    seller_address: '0x0000000000000000000000000000000000000001',
    swipe_count: 2,
    price_per_swipe: 9.00,
    expires_at: '2099-01-01T00:00:00.000Z',
    tx_hash: '0xabc',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/bids', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Response shape ─────────────────────────────────────────────────────────

  it('returns 200 with a bids array', async () => {
    mockQuery({ data: [makeBid()], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('bids')
    expect(Array.isArray(body.bids)).toBe(true)
  })

  it('returns { bids: [] } when no offers exist — not a 404 or 500', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ bids: [] })
  })

  it('includes all required fields on each bid item', async () => {
    mockQuery({ data: [makeBid()], error: null })
    const body = await (await GET()).json()
    const bid = body.bids[0]
    expect(bid).toHaveProperty('offer_id')
    expect(bid).toHaveProperty('onchain_offer_id')
    expect(bid).toHaveProperty('seller_address')
    expect(bid).toHaveProperty('swipe_count')
    expect(bid).toHaveProperty('price_per_swipe')
    expect(bid).toHaveProperty('expires_at')
    expect(bid).toHaveProperty('tx_hash')
  })

  it('returns both offer_id (UUID) and onchain_offer_id (number)', async () => {
    const uuid = 'uuid-aaaa-bbbb-cccc-dddddddddddd'
    mockQuery({ data: [makeBid({ offer_id: uuid, onchain_offer_id: 99 })], error: null })
    const body = await (await GET()).json()
    expect(body.bids[0].offer_id).toBe(uuid)
    expect(body.bids[0].onchain_offer_id).toBe(99)
  })

  it('returns seller_address directly', async () => {
    const wallet = '0x0000000000000000000000000000000000000002'
    mockQuery({ data: [makeBid({ seller_address: wallet })], error: null })
    const body = await (await GET()).json()
    expect(body.bids[0].seller_address).toBe(wallet)
  })

  // ── Query filters ──────────────────────────────────────────────────────────

  it('filters by type = "bid"', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    expect(q.eq).toHaveBeenCalledWith('type', 'bid')
  })

  it('does not return ask-type offers', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    // Must filter by 'bid', never by 'ask'
    const askCall = q.eq.mock.calls.find(([, val]) => val === 'ask')
    expect(askCall).toBeUndefined()
  })

  it('filters by status = "pending"', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    expect(q.eq).toHaveBeenCalledWith('status', 'pending')
  })

  it('filters out expired offers via expires_at > now', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    const gtCall = q.gt.mock.calls.find(([col]) => col === 'expires_at')
    expect(gtCall).toBeDefined()
    const isoArg = gtCall![1] as string
    expect(isNaN(Date.parse(isoArg))).toBe(false)
  })

  // ── Ordering ───────────────────────────────────────────────────────────────

  it('orders by price_per_swipe descending (highest bidder first)', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    expect(q.order).toHaveBeenCalledWith('price_per_swipe', { ascending: false })
  })

  it('returns higher bids before lower bids', async () => {
    const high = makeBid({ onchain_offer_id: 1, price_per_swipe: 9.00 })
    const low  = makeBid({ onchain_offer_id: 2, price_per_swipe: 6.00 })
    // DB returns data already sorted; we confirm the route preserves that order
    mockQuery({ data: [high, low], error: null })
    const body = await (await GET()).json()
    expect(body.bids[0].price_per_swipe).toBe(9.00)
    expect(body.bids[1].price_per_swipe).toBe(6.00)
  })

  // ── Multiple rows ──────────────────────────────────────────────────────────

  it('returns all rows from the database', async () => {
    mockQuery({ data: [makeBid({ onchain_offer_id: 1 }), makeBid({ onchain_offer_id: 2 })], error: null })
    const body = await (await GET()).json()
    expect(body.bids).toHaveLength(2)
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns 500 with an error message when the database query fails', async () => {
    mockQuery({ data: null, error: { message: 'connection timeout' } })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body).toHaveProperty('error')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { GET } from '@/app/api/asks/route'
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

/** A valid active ask row as the indexer writes it. */
function makeAsk(overrides: Record<string, unknown> = {}) {
  return {
    offer_id: 'uuid-1111-1111-1111-111111111111',
    onchain_offer_id: 1,
    seller_address: '0x0000000000000000000000000000000000000001',
    swipe_count: 3,
    price_per_swipe: 7.00,
    expires_at: '2099-01-01T00:00:00.000Z',
    tx_hash: '0xabc',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/asks', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Response shape ─────────────────────────────────────────────────────────

  it('returns 200 with an asks array', async () => {
    mockQuery({ data: [makeAsk()], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('asks')
    expect(Array.isArray(body.asks)).toBe(true)
  })

  it('returns { asks: [] } when no offers exist — not a 404 or 500', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ asks: [] })
  })

  it('returns seller_address directly (no aliasing)', async () => {
    const wallet = '0x0000000000000000000000000000000000000002'
    mockQuery({ data: [makeAsk({ seller_address: wallet })], error: null })
    const body = await (await GET()).json()
    expect(body.asks[0].seller_address).toBe(wallet)
  })

  it('returns both offer_id (UUID) and onchain_offer_id (number)', async () => {
    const uuid = 'uuid-aaaa-bbbb-cccc-dddddddddddd'
    mockQuery({ data: [makeAsk({ offer_id: uuid, onchain_offer_id: 42 })], error: null })
    const body = await (await GET()).json()
    expect(body.asks[0].offer_id).toBe(uuid)
    expect(body.asks[0].onchain_offer_id).toBe(42)
  })

  it('includes all required fields on each ask item', async () => {
    mockQuery({ data: [makeAsk()], error: null })
    const body = await (await GET()).json()
    const ask = body.asks[0]
    expect(ask).toHaveProperty('offer_id')
    expect(ask).toHaveProperty('onchain_offer_id')
    expect(ask).toHaveProperty('seller_address')
    expect(ask).toHaveProperty('swipe_count')
    expect(ask).toHaveProperty('price_per_swipe')
    expect(ask).toHaveProperty('expires_at')
    expect(ask).toHaveProperty('tx_hash')
  })

  // ── Query filters ──────────────────────────────────────────────────────────

  it('filters by type = "ask"', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    expect(q.eq).toHaveBeenCalledWith('type', 'ask')
  })

  it('filters by status = "pending"', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    expect(q.eq).toHaveBeenCalledWith('status', 'pending')
  })

  it('filters out expired offers via expires_at > now', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    // First arg is the column; second arg is a current-ish ISO timestamp
    const gtCall = q.gt.mock.calls.find(([col]) => col === 'expires_at')
    expect(gtCall).toBeDefined()
    const isoArg = gtCall![1] as string
    // Verify it is a valid ISO 8601 date string
    expect(isNaN(Date.parse(isoArg))).toBe(false)
  })

  // ── Ordering ───────────────────────────────────────────────────────────────

  it('orders by price_per_swipe ascending (cheapest first)', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET()
    expect(q.order).toHaveBeenCalledWith('price_per_swipe', { ascending: true })
  })

  it('returns cheaper asks before more expensive ones', async () => {
    const cheap = makeAsk({ onchain_offer_id: 1, price_per_swipe: 6.00 })
    const pricey = makeAsk({ onchain_offer_id: 2, price_per_swipe: 9.00 })
    // DB returns data already sorted; we confirm the route preserves that order
    mockQuery({ data: [cheap, pricey], error: null })
    const body = await (await GET()).json()
    expect(body.asks[0].price_per_swipe).toBe(6.00)
    expect(body.asks[1].price_per_swipe).toBe(9.00)
  })

  // ── Multiple rows ──────────────────────────────────────────────────────────

  it('returns all rows from the database', async () => {
    mockQuery({ data: [makeAsk({ onchain_offer_id: 1 }), makeAsk({ onchain_offer_id: 2 })], error: null })
    const body = await (await GET()).json()
    expect(body.asks).toHaveLength(2)
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

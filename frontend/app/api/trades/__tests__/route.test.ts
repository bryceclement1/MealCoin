import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { GET } from '@/app/api/trades/route'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a fluent Supabase query-builder mock where any awaited step in the
 * chain resolves with `result`. Using a thenable object handles both the
 * no-wallet path (await after .order()) and the wallet path (await after .or()).
 */
function mockQuery(result: { data: unknown[] | null; error: unknown }) {
  const query: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    // Makes `await query` resolve at any point in the chain
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  }
  vi.mocked(supabase.from).mockReturnValue(query as ReturnType<typeof supabase.from>)
  return query
}

/** Builds a NextRequest for the trades endpoint with optional query params. */
function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/trades')
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url.toString())
}

/** A valid completed trade row as the indexer writes it. */
function makeTrade(overrides: Record<string, unknown> = {}) {
  return {
    trade_id: 'trade-uuid-1111-1111-111111111111',
    offer_id: 'offer-uuid-1111-1111-111111111111',
    buyer_address: '0x0000000000000000000000000000000000000001',
    seller_address: '0x0000000000000000000000000000000000000002',
    swipe_count: 2,
    price: 14.00,
    tx_hash: '0xabc',
    traded_at: '2026-03-05T14:23:00.000Z',
    ...overrides,
  }
}

const VALID_WALLET = '0x0000000000000000000000000000000000000001'
const VALID_WALLET_UPPER = '0x000000000000000000000000000000000000000A'
const VALID_WALLET_LOWER = '0x000000000000000000000000000000000000000a'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/trades', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Response shape ─────────────────────────────────────────────────────────

  it('returns 200 with a trades array', async () => {
    mockQuery({ data: [makeTrade()], error: null })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('trades')
    expect(Array.isArray(body.trades)).toBe(true)
  })

  it('returns { trades: [] } when no trades exist — not a 404 or 500', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ trades: [] })
  })

  it('includes all required fields on each trade item', async () => {
    mockQuery({ data: [makeTrade()], error: null })
    const body = await (await GET(makeRequest())).json()
    const trade = body.trades[0]
    expect(trade).toHaveProperty('trade_id')
    expect(trade).toHaveProperty('offer_id')
    expect(trade).toHaveProperty('buyer_address')
    expect(trade).toHaveProperty('seller_address')
    expect(trade).toHaveProperty('swipe_count')
    expect(trade).toHaveProperty('price')
    expect(trade).toHaveProperty('tx_hash')
    expect(trade).toHaveProperty('traded_at')
  })

  it('returns correct field values from the database row', async () => {
    const trade = makeTrade({
      trade_id: 'abc-123',
      swipe_count: 3,
      price: 21.00,
      buyer_address: '0x0000000000000000000000000000000000000003',
      seller_address: '0x0000000000000000000000000000000000000004',
    })
    mockQuery({ data: [trade], error: null })
    const body = await (await GET(makeRequest())).json()
    expect(body.trades[0].trade_id).toBe('abc-123')
    expect(body.trades[0].swipe_count).toBe(3)
    expect(body.trades[0].price).toBe(21.00)
    expect(body.trades[0].buyer_address).toBe('0x0000000000000000000000000000000000000003')
    expect(body.trades[0].seller_address).toBe('0x0000000000000000000000000000000000000004')
  })

  it('returns all rows from the database', async () => {
    mockQuery({
      data: [
        makeTrade({ trade_id: 't1' }),
        makeTrade({ trade_id: 't2' }),
        makeTrade({ trade_id: 't3' }),
      ],
      error: null,
    })
    const body = await (await GET(makeRequest())).json()
    expect(body.trades).toHaveLength(3)
  })

  // ── Ordering ───────────────────────────────────────────────────────────────

  it('orders by traded_at descending (newest first)', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest())
    expect(q.order).toHaveBeenCalledWith('traded_at', { ascending: false })
  })

  it('preserves descending order returned by the database', async () => {
    const newer = makeTrade({ traded_at: '2026-03-06T10:00:00.000Z' })
    const older = makeTrade({ traded_at: '2026-03-05T10:00:00.000Z' })
    mockQuery({ data: [newer, older], error: null })
    const body = await (await GET(makeRequest())).json()
    expect(body.trades[0].traded_at).toBe('2026-03-06T10:00:00.000Z')
    expect(body.trades[1].traded_at).toBe('2026-03-05T10:00:00.000Z')
  })

  // ── No wallet filter ────────────────────────────────────────────────────────

  it('does not call .or() when no ?wallet param is provided', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest())
    expect(q.or).not.toHaveBeenCalled()
  })

  it('returns all trades (unfiltered) when no ?wallet param is provided', async () => {
    const trades = [
      makeTrade({ buyer_address: VALID_WALLET, seller_address: '0x0000000000000000000000000000000000000099' }),
      makeTrade({ buyer_address: '0x0000000000000000000000000000000000000099', seller_address: VALID_WALLET }),
    ]
    mockQuery({ data: trades, error: null })
    const body = await (await GET(makeRequest())).json()
    expect(body.trades).toHaveLength(2)
  })

  // ── Wallet filter ───────────────────────────────────────────────────────────

  it('calls .or() with buyer_address and seller_address when ?wallet is provided', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest({ wallet: VALID_WALLET }))
    expect(q.or).toHaveBeenCalledWith(
      `buyer_address.eq.${VALID_WALLET.toLowerCase()},seller_address.eq.${VALID_WALLET.toLowerCase()}`
    )
  })

  it('lowercases the wallet address before passing to .or()', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest({ wallet: VALID_WALLET_UPPER }))
    expect(q.or).toHaveBeenCalledWith(
      `buyer_address.eq.${VALID_WALLET_LOWER},seller_address.eq.${VALID_WALLET_LOWER}`
    )
  })

  it('returns filtered trades when ?wallet matches buyer_address', async () => {
    const matched = makeTrade({ buyer_address: VALID_WALLET })
    mockQuery({ data: [matched], error: null })
    const body = await (await GET(makeRequest({ wallet: VALID_WALLET }))).json()
    expect(body.trades).toHaveLength(1)
    expect(body.trades[0].buyer_address).toBe(VALID_WALLET)
  })

  it('returns filtered trades when ?wallet matches seller_address', async () => {
    const matched = makeTrade({ seller_address: VALID_WALLET })
    mockQuery({ data: [matched], error: null })
    const body = await (await GET(makeRequest({ wallet: VALID_WALLET }))).json()
    expect(body.trades).toHaveLength(1)
    expect(body.trades[0].seller_address).toBe(VALID_WALLET)
  })

  it('returns { trades: [] } when valid ?wallet has no matching trades', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET(makeRequest({ wallet: VALID_WALLET }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ trades: [] })
  })

  // ── Wallet validation ───────────────────────────────────────────────────────

  it('returns 400 when ?wallet is malformed', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET(makeRequest({ wallet: 'not-a-wallet' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.field).toBe('wallet')
  })

  it('returns 400 when ?wallet is too short', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET(makeRequest({ wallet: '0x123' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet')
  })

  it('returns 400 when ?wallet is missing the 0x prefix', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET(makeRequest({ wallet: '0000000000000000000000000000000000000001' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet')
  })

  it('does not query the database when ?wallet validation fails', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest({ wallet: 'invalid' }))
    expect(q.select).not.toHaveBeenCalled()
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns 500 with an error message when the database query fails', async () => {
    mockQuery({ data: null, error: { message: 'connection timeout' } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 500 when database fails with a wallet filter', async () => {
    mockQuery({ data: null, error: { message: 'db error' } })
    const res = await GET(makeRequest({ wallet: VALID_WALLET }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { GET } from '@/app/api/wallet/[address]/history/route'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mocks supabase.from() to return different thenable query builders
 * depending on which table is queried.
 */
function mockQueries(
  tradesResult: { data: unknown[] | null; error: unknown },
  redemptionsResult: { data: unknown[] | null; error: unknown }
) {
  const tradesQuery = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(tradesResult),
  }
  const redemptionsQuery = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(redemptionsResult),
  }
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'trades') return tradesQuery as ReturnType<typeof supabase.from>
    if (table === 'redemptions') return redemptionsQuery as ReturnType<typeof supabase.from>
    throw new Error(`Unexpected table: ${table}`)
  })
  return { tradesQuery, redemptionsQuery }
}

/** Builds a NextRequest and a params Promise for the history route. */
function makeContext(address: string) {
  const request = new NextRequest(`http://localhost:3000/api/wallet/${address}/history`)
  const params = Promise.resolve({ address })
  return { request, params }
}

/** A valid completed trade row. */
function makeTrade(overrides: Record<string, unknown> = {}) {
  return {
    buyer_address: WALLET_A,
    seller_address: WALLET_B,
    swipe_count: 2,
    price: 14.00,
    tx_hash: '0xabc',
    traded_at: '2026-03-05T14:00:00.000Z',
    ...overrides,
  }
}

/** A valid completed redemption row. */
function makeRedemption(overrides: Record<string, unknown> = {}) {
  return {
    tx_hash: '0xdef',
    redeemed_at: '2026-03-04T08:00:00.000Z',
    ...overrides,
  }
}

const WALLET_A = '0x0000000000000000000000000000000000000001'
const WALLET_B = '0x0000000000000000000000000000000000000002'
const WALLET_UPPER = '0x000000000000000000000000000000000000000A'
const WALLET_LOWER = '0x000000000000000000000000000000000000000a'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/wallet/:address/history', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Response shape ─────────────────────────────────────────────────────────

  it('returns 200 with a history array', async () => {
    mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const res = await GET(request, { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('history')
    expect(Array.isArray(body.history)).toBe(true)
  })

  it('returns { history: [] } when wallet has no trades or redemptions', async () => {
    mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const res = await GET(request, { params })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ history: [] })
  })

  // ── trade_bought ───────────────────────────────────────────────────────────

  it('maps a trade where wallet is buyer_address to type "trade_bought"', async () => {
    const trade = makeTrade({ buyer_address: WALLET_A, seller_address: WALLET_B })
    mockQueries({ data: [trade], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    expect(body.history[0].type).toBe('trade_bought')
  })

  it('trade_bought includes all required fields with correct values', async () => {
    const trade = makeTrade({ buyer_address: WALLET_A, swipe_count: 3, price: 21.00, tx_hash: '0xtx1', traded_at: '2026-03-05T10:00:00.000Z' })
    mockQueries({ data: [trade], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    const item = body.history[0]
    expect(item.type).toBe('trade_bought')
    expect(item.swipe_count).toBe(3)
    expect(item.price).toBe(21.00)
    expect(item.tx_hash).toBe('0xtx1')
    expect(item.timestamp).toBe('2026-03-05T10:00:00.000Z')
  })

  // ── trade_sold ─────────────────────────────────────────────────────────────

  it('maps a trade where wallet is seller_address to type "trade_sold"', async () => {
    const trade = makeTrade({ buyer_address: WALLET_B, seller_address: WALLET_A })
    mockQueries({ data: [trade], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    expect(body.history[0].type).toBe('trade_sold')
  })

  it('trade_sold includes all required fields with correct values', async () => {
    const trade = makeTrade({ seller_address: WALLET_A, buyer_address: WALLET_B, swipe_count: 1, price: 7.00, tx_hash: '0xtx2', traded_at: '2026-03-05T11:00:00.000Z' })
    mockQueries({ data: [trade], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    const item = body.history[0]
    expect(item.type).toBe('trade_sold')
    expect(item.swipe_count).toBe(1)
    expect(item.price).toBe(7.00)
    expect(item.tx_hash).toBe('0xtx2')
    expect(item.timestamp).toBe('2026-03-05T11:00:00.000Z')
  })

  // ── redemption ─────────────────────────────────────────────────────────────

  it('maps a redemption to type "redemption" with price: null and swipe_count: null', async () => {
    const redemption = makeRedemption({ tx_hash: '0xred1', redeemed_at: '2026-03-04T08:00:00.000Z' })
    mockQueries({ data: [], error: null }, { data: [redemption], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    const item = body.history[0]
    expect(item.type).toBe('redemption')
    expect(item.price).toBeNull()
    expect(item.swipe_count).toBeNull()
    expect(item.tx_hash).toBe('0xred1')
    expect(item.timestamp).toBe('2026-03-04T08:00:00.000Z')
  })

  it('redemption includes all required fields', async () => {
    mockQueries({ data: [], error: null }, { data: [makeRedemption()], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    const item = body.history[0]
    expect(item).toHaveProperty('type')
    expect(item).toHaveProperty('swipe_count')
    expect(item).toHaveProperty('price')
    expect(item).toHaveProperty('tx_hash')
    expect(item).toHaveProperty('timestamp')
  })

  // ── Ordering ───────────────────────────────────────────────────────────────

  it('sorts all history items by timestamp DESC', async () => {
    const buyTrade = makeTrade({ buyer_address: WALLET_A, seller_address: WALLET_B, tx_hash: '0x1', traded_at: '2026-03-05T14:00:00.000Z' })
    const sellTrade = makeTrade({ buyer_address: WALLET_B, seller_address: WALLET_A, tx_hash: '0x2', traded_at: '2026-03-05T11:00:00.000Z' })
    const redemption = makeRedemption({ tx_hash: '0x3', redeemed_at: '2026-03-04T08:00:00.000Z' })
    mockQueries({ data: [buyTrade, sellTrade], error: null }, { data: [redemption], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    expect(body.history).toHaveLength(3)
    expect(body.history[0].timestamp).toBe('2026-03-05T14:00:00.000Z')
    expect(body.history[1].timestamp).toBe('2026-03-05T11:00:00.000Z')
    expect(body.history[2].timestamp).toBe('2026-03-04T08:00:00.000Z')
  })

  it('sorts correctly when a redemption is newer than trades', async () => {
    const trade = makeTrade({ buyer_address: WALLET_A, seller_address: WALLET_B, tx_hash: '0x1', traded_at: '2026-03-04T08:00:00.000Z' })
    const redemption = makeRedemption({ tx_hash: '0x2', redeemed_at: '2026-03-05T14:00:00.000Z' })
    mockQueries({ data: [trade], error: null }, { data: [redemption], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    expect(body.history[0].type).toBe('redemption')
    expect(body.history[1].type).toBe('trade_bought')
  })

  // ── Correct types in mixed results ─────────────────────────────────────────

  it('returns correct type for each item when wallet has 1 buy, 1 sell, 1 redemption', async () => {
    const buyTrade = makeTrade({ buyer_address: WALLET_A, seller_address: WALLET_B, tx_hash: '0x1', traded_at: '2026-03-05T14:00:00.000Z' })
    const sellTrade = makeTrade({ buyer_address: WALLET_B, seller_address: WALLET_A, tx_hash: '0x2', traded_at: '2026-03-05T11:00:00.000Z' })
    const redemption = makeRedemption({ tx_hash: '0x3', redeemed_at: '2026-03-04T08:00:00.000Z' })
    mockQueries({ data: [buyTrade, sellTrade], error: null }, { data: [redemption], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    const types = body.history.map((i: { type: string }) => i.type)
    expect(types).toEqual(['trade_bought', 'trade_sold', 'redemption'])
  })

  // ── Self-trade (wallet is both buyer and seller) ───────────────────────────

  it('emits two entries for a self-trade (wallet is both buyer and seller)', async () => {
    const selfTrade = makeTrade({ buyer_address: WALLET_A, seller_address: WALLET_A, tx_hash: '0xself', traded_at: '2026-03-05T10:00:00.000Z' })
    mockQueries({ data: [selfTrade], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const body = await (await GET(request, { params })).json()
    expect(body.history).toHaveLength(2)
    const types = body.history.map((i: { type: string }) => i.type)
    expect(types).toContain('trade_bought')
    expect(types).toContain('trade_sold')
  })

  // ── Query filters ──────────────────────────────────────────────────────────

  it('queries trades with .or() filtering buyer and seller', async () => {
    const { tradesQuery } = mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    await GET(request, { params })
    expect(tradesQuery.or).toHaveBeenCalledWith(
      `buyer_address.eq.${WALLET_A},seller_address.eq.${WALLET_A}`
    )
  })

  it('queries redemptions with .eq("wallet_address", lower)', async () => {
    const { redemptionsQuery } = mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    await GET(request, { params })
    expect(redemptionsQuery.eq).toHaveBeenCalledWith('wallet_address', WALLET_A)
  })

  // ── Case-insensitivity ─────────────────────────────────────────────────────

  it('lowercases wallet address before querying trades', async () => {
    const { tradesQuery } = mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_UPPER)
    await GET(request, { params })
    expect(tradesQuery.or).toHaveBeenCalledWith(
      `buyer_address.eq.${WALLET_LOWER},seller_address.eq.${WALLET_LOWER}`
    )
  })

  it('lowercases wallet address before querying redemptions', async () => {
    const { redemptionsQuery } = mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_UPPER)
    await GET(request, { params })
    expect(redemptionsQuery.eq).toHaveBeenCalledWith('wallet_address', WALLET_LOWER)
  })

  it('returns same results for uppercase and lowercase wallet address', async () => {
    const trade = makeTrade({ buyer_address: WALLET_LOWER, seller_address: WALLET_B })
    mockQueries({ data: [trade], error: null }, { data: [], error: null })
    const { request: reqUpper, params: paramsUpper } = makeContext(WALLET_UPPER)
    const body = await (await GET(reqUpper, { params: paramsUpper })).json()
    expect(body.history).toHaveLength(1)
    expect(body.history[0].type).toBe('trade_bought')
  })

  // ── Address validation ─────────────────────────────────────────────────────

  it('returns 400 when address is malformed', async () => {
    mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext('notanaddress')
    const res = await GET(request, { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.field).toBe('address')
  })

  it('returns 400 when address is too short', async () => {
    mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext('0x123')
    const res = await GET(request, { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('address')
  })

  it('returns 400 when address is missing 0x prefix', async () => {
    mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext('0000000000000000000000000000000000000001')
    const res = await GET(request, { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('address')
  })

  it('does not query the database when address is invalid', async () => {
    mockQueries({ data: [], error: null }, { data: [], error: null })
    const { request, params } = makeContext('invalid')
    await GET(request, { params })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns 500 when trades query fails', async () => {
    mockQueries({ data: null, error: { message: 'db error' } }, { data: [], error: null })
    const { request, params } = makeContext(WALLET_A)
    const res = await GET(request, { params })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 500 when redemptions query fails', async () => {
    mockQueries({ data: [], error: null }, { data: null, error: { message: 'db error' } })
    const { request, params } = makeContext(WALLET_A)
    const res = await GET(request, { params })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

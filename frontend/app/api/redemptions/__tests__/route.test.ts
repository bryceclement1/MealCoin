import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { GET } from '@/app/api/redemptions/route'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a fluent Supabase query-builder mock where any awaited step in the
 * chain resolves with `result`. Using a thenable object handles both the
 * no-wallet path (await after .order()) and the wallet path (await after .eq()).
 */
function mockQuery(result: { data: unknown[] | null; error: unknown }) {
  const query: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    // Makes `await query` resolve at any point in the chain
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  }
  vi.mocked(supabase.from).mockReturnValue(query as ReturnType<typeof supabase.from>)
  return query
}

/** Builds a NextRequest for the redemptions endpoint with optional query params. */
function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/redemptions')
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url.toString())
}

/** A valid completed redemption row as the indexer writes it. */
function makeRedemption(overrides: Record<string, unknown> = {}) {
  return {
    redemption_id: 'redemption-uuid-1111-1111-111111111111',
    wallet_address: '0x0000000000000000000000000000000000000001',
    tx_hash: '0xabc',
    redeemed_at: '2026-03-05T12:00:00.000Z',
    ...overrides,
  }
}

const VALID_WALLET = '0x0000000000000000000000000000000000000001'
const VALID_WALLET_UPPER = '0x000000000000000000000000000000000000000A'
const VALID_WALLET_LOWER = '0x000000000000000000000000000000000000000a'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/redemptions', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Response shape ─────────────────────────────────────────────────────────

  it('returns 200 with a redemptions array', async () => {
    mockQuery({ data: [makeRedemption()], error: null })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('redemptions')
    expect(Array.isArray(body.redemptions)).toBe(true)
  })

  it('returns { redemptions: [] } when no redemptions exist — not a 404 or 500', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ redemptions: [] })
  })

  it('includes all required fields on each redemption item', async () => {
    mockQuery({ data: [makeRedemption()], error: null })
    const body = await (await GET(makeRequest())).json()
    const redemption = body.redemptions[0]
    expect(redemption).toHaveProperty('redemption_id')
    expect(redemption).toHaveProperty('wallet_address')
    expect(redemption).toHaveProperty('tx_hash')
    expect(redemption).toHaveProperty('redeemed_at')
  })

  it('returns correct field values from the database row', async () => {
    const redemption = makeRedemption({
      redemption_id: 'rid-xyz',
      wallet_address: '0x0000000000000000000000000000000000000009',
      tx_hash: '0xdeadbeef',
      redeemed_at: '2026-03-01T08:00:00.000Z',
    })
    mockQuery({ data: [redemption], error: null })
    const body = await (await GET(makeRequest())).json()
    expect(body.redemptions[0].redemption_id).toBe('rid-xyz')
    expect(body.redemptions[0].wallet_address).toBe('0x0000000000000000000000000000000000000009')
    expect(body.redemptions[0].tx_hash).toBe('0xdeadbeef')
    expect(body.redemptions[0].redeemed_at).toBe('2026-03-01T08:00:00.000Z')
  })

  it('returns all rows from the database', async () => {
    mockQuery({
      data: [
        makeRedemption({ redemption_id: 'r1' }),
        makeRedemption({ redemption_id: 'r2' }),
        makeRedemption({ redemption_id: 'r3' }),
      ],
      error: null,
    })
    const body = await (await GET(makeRequest())).json()
    expect(body.redemptions).toHaveLength(3)
  })

  // ── Ordering ───────────────────────────────────────────────────────────────

  it('orders by redeemed_at descending (newest first)', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest())
    expect(q.order).toHaveBeenCalledWith('redeemed_at', { ascending: false })
  })

  it('preserves descending order returned by the database', async () => {
    const newer = makeRedemption({ redeemed_at: '2026-03-06T10:00:00.000Z' })
    const older = makeRedemption({ redeemed_at: '2026-03-05T10:00:00.000Z' })
    mockQuery({ data: [newer, older], error: null })
    const body = await (await GET(makeRequest())).json()
    expect(body.redemptions[0].redeemed_at).toBe('2026-03-06T10:00:00.000Z')
    expect(body.redemptions[1].redeemed_at).toBe('2026-03-05T10:00:00.000Z')
  })

  // ── No wallet filter ────────────────────────────────────────────────────────

  it('does not call .eq() with wallet_address when no ?wallet param is provided', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest())
    const walletEqCall = (q.eq as ReturnType<typeof vi.fn>).mock.calls.find(
      ([col]: [string]) => col === 'wallet_address'
    )
    expect(walletEqCall).toBeUndefined()
  })

  it('returns all redemptions (unfiltered) when no ?wallet param is provided', async () => {
    const redemptions = [
      makeRedemption({ wallet_address: '0x0000000000000000000000000000000000000001' }),
      makeRedemption({ wallet_address: '0x0000000000000000000000000000000000000002' }),
    ]
    mockQuery({ data: redemptions, error: null })
    const body = await (await GET(makeRequest())).json()
    expect(body.redemptions).toHaveLength(2)
  })

  // ── Wallet filter ───────────────────────────────────────────────────────────

  it('calls .eq("wallet_address", lowercased) when ?wallet is provided', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest({ wallet: VALID_WALLET }))
    expect(q.eq).toHaveBeenCalledWith('wallet_address', VALID_WALLET.toLowerCase())
  })

  it('lowercases the wallet address before passing to .eq()', async () => {
    const q = mockQuery({ data: [], error: null })
    await GET(makeRequest({ wallet: VALID_WALLET_UPPER }))
    expect(q.eq).toHaveBeenCalledWith('wallet_address', VALID_WALLET_LOWER)
  })

  it('returns filtered redemptions for the given wallet', async () => {
    const matched = makeRedemption({ wallet_address: VALID_WALLET })
    mockQuery({ data: [matched], error: null })
    const body = await (await GET(makeRequest({ wallet: VALID_WALLET }))).json()
    expect(body.redemptions).toHaveLength(1)
    expect(body.redemptions[0].wallet_address).toBe(VALID_WALLET)
  })

  it('returns { redemptions: [] } when valid ?wallet has no matching redemptions', async () => {
    mockQuery({ data: [], error: null })
    const res = await GET(makeRequest({ wallet: VALID_WALLET }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ redemptions: [] })
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

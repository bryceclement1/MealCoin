import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { GET } from '@/app/api/students/route'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  vi.mocked(supabase.from).mockReturnValue(query as ReturnType<typeof supabase.from>)
  return query
}

function makeRequest(wallet?: string): NextRequest {
  const url = new URL('http://localhost:3000/api/students')
  if (wallet !== undefined) url.searchParams.set('wallet', wallet)
  return new NextRequest(url.toString())
}

const VALID_WALLET = '0x0000000000000000000000000000000000000001'

const STUDENT_ROW = {
  wallet_address: VALID_WALLET,
  davidson_email: 'jdoe@davidson.edu',
  verified_at: '2026-03-01T00:00:00.000Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/students', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Wallet validation ───────────────────────────────────────────────────────

  it('returns 400 with field "wallet" when ?wallet is missing', async () => {
    mockQuery({ data: null, error: null })
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.field).toBe('wallet')
  })

  it('returns 400 with field "wallet" when ?wallet is malformed', async () => {
    mockQuery({ data: null, error: null })
    const res = await GET(makeRequest('notawallet'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet')
  })

  it('returns 400 when ?wallet is too short', async () => {
    mockQuery({ data: null, error: null })
    const res = await GET(makeRequest('0x123'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet')
  })

  it('returns 400 when ?wallet is missing 0x prefix', async () => {
    mockQuery({ data: null, error: null })
    const res = await GET(makeRequest('0000000000000000000000000000000000000001'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet')
  })

  it('does not query the database when ?wallet is invalid', async () => {
    mockQuery({ data: null, error: null })
    await GET(makeRequest('invalid'))
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // ── Response shape ─────────────────────────────────────────────────────────

  it('returns { verified: false } when wallet is not found', async () => {
    mockQuery({ data: null, error: null })
    const res = await GET(makeRequest(VALID_WALLET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ verified: false })
  })

  it('returns { verified: true, student: {...} } when wallet is found', async () => {
    mockQuery({ data: STUDENT_ROW, error: null })
    const res = await GET(makeRequest(VALID_WALLET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verified).toBe(true)
    expect(body.student).toMatchObject(STUDENT_ROW)
  })

  // ── Query ───────────────────────────────────────────────────────────────────

  it('queries by lowercased wallet address', async () => {
    const q = mockQuery({ data: null, error: null })
    await GET(makeRequest('0xABCDEF1234567890ABCDEF1234567890ABCDEF12'))
    expect(q.eq).toHaveBeenCalledWith(
      'wallet_address',
      '0xabcdef1234567890abcdef1234567890abcdef12'
    )
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns 500 when the database query fails', async () => {
    mockQuery({ data: null, error: { message: 'db error' } })
    const res = await GET(makeRequest(VALID_WALLET))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

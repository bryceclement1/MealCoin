import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { GET } from '@/app/api/verify/confirm/route'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(token?: string): NextRequest {
  const url = new URL('http://localhost:3000/api/verify/confirm')
  if (token !== undefined) url.searchParams.set('token', token)
  return new NextRequest(url.toString())
}

const VALID_TOKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function mockTokenLookup(result: { data: unknown; error: unknown }) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  vi.mocked(supabase.from).mockReturnValue(q as ReturnType<typeof supabase.from>)
  return q
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/verify/confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Token validation ────────────────────────────────────────────────────────

  it('returns 400 with field "token" when ?token is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.field).toBe('token')
  })

  it('does not query the database when token is missing', async () => {
    mockTokenLookup({ data: null, error: null })
    await GET(makeRequest())
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // ── Domain errors ──────────────────────────────────────────────────────────
  // The /confirm route is a browser-facing endpoint (users click it from email).
  // For user-visible errors it returns an HTML page with status 200 rather than
  // a JSON error body.  Only the missing-token and DB-failure cases return JSON.

  it('returns an HTML page when token is not found in the database', async () => {
    mockTokenLookup({ data: null, error: null })
    const res = await GET(makeRequest(VALID_TOKEN))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('Invalid link')
  })

  it('returns an HTML page when token has already been used', async () => {
    mockTokenLookup({
      data: {
        token: VALID_TOKEN,
        wallet_address: '0x0000000000000000000000000000000000000001',
        davidson_email: 'jdoe@davidson.edu',
        used: true,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      error: null,
    })
    const res = await GET(makeRequest(VALID_TOKEN))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('Already verified')
  })

  it('returns an HTML page when token is expired', async () => {
    mockTokenLookup({
      data: {
        token: VALID_TOKEN,
        wallet_address: '0x0000000000000000000000000000000000000001',
        davidson_email: 'jdoe@davidson.edu',
        used: false,
        expires_at: new Date(Date.now() - 60000).toISOString(), // in the past
      },
      error: null,
    })
    const res = await GET(makeRequest(VALID_TOKEN))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('Link expired')
  })

  // ── Consistent error shape ──────────────────────────────────────────────────

  it('missing token 400 response includes both "error" string and "field" key', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.field).toBe('token')
  })

  // ── DB error ───────────────────────────────────────────────────────────────

  it('returns 500 when the database lookup fails', async () => {
    mockTokenLookup({ data: null, error: { message: 'db error' } })
    const res = await GET(makeRequest(VALID_TOKEN))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

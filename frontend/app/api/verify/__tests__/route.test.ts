import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
  supabaseAuth: { auth: { signInWithOtp: vi.fn() } },
}))

import { POST } from '@/app/api/verify/route'
import { supabase, supabaseAuth } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Sets up the full happy-path mock chain. */
function mockHappyPath() {
  const insertQuery = {
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'students') {
      const q = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { davidson_email: 'jdoe@davidson.edu', wallet_address: null }, error: null }),
      }
      // Second students call (wallet conflict) returns no conflict
      let callCount = 0
      q.maybeSingle.mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: { davidson_email: 'jdoe@davidson.edu', wallet_address: null }, error: null })
        return Promise.resolve({ data: null, error: null })
      })
      return q as ReturnType<typeof supabase.from>
    }
    if (table === 'verification_tokens') {
      return insertQuery as ReturnType<typeof supabase.from>
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  vi.mocked(supabaseAuth.auth.signInWithOtp).mockResolvedValue({ data: {}, error: null } as never)
}

const VALID_WALLET = '0x0000000000000000000000000000000000000001'
const VALID_EMAIL = 'jdoe@davidson.edu'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/verify', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── wallet_address validation ───────────────────────────────────────────────

  it('returns 400 with field "wallet_address" when wallet_address is missing', async () => {
    const res = await POST(makeRequest({ davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.field).toBe('wallet_address')
  })

  it('returns 400 with field "wallet_address" when wallet_address is malformed', async () => {
    const res = await POST(makeRequest({ wallet_address: 'notawallet', davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet_address')
  })

  it('returns 400 with field "wallet_address" when wallet_address is too short', async () => {
    const res = await POST(makeRequest({ wallet_address: '0x123', davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet_address')
  })

  // ── davidson_email validation ───────────────────────────────────────────────

  it('returns 400 with field "davidson_email" when davidson_email is missing', async () => {
    const res = await POST(makeRequest({ wallet_address: VALID_WALLET }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.field).toBe('davidson_email')
  })

  it('returns 400 with field "davidson_email" when davidson_email is not a davidson.edu address', async () => {
    const res = await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: 'user@gmail.com' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('davidson_email')
  })

  it('returns 400 with field "davidson_email" when davidson_email has no @', async () => {
    const res = await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: 'notanemail' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('davidson_email')
  })

  it('does not query the database when both fields are invalid', async () => {
    await POST(makeRequest({ wallet_address: 'bad', davidson_email: 'bad' }))
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // ── Domain errors ──────────────────────────────────────────────────────────

  it('returns 404 when email is not in the student list', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as ReturnType<typeof supabase.from>)

    const res = await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 409 when email is already linked to a different wallet', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { davidson_email: VALID_EMAIL, wallet_address: '0x0000000000000000000000000000000000000099' },
        error: null,
      }),
    } as ReturnType<typeof supabase.from>)

    const res = await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(409)
  })

  // ── Consistent 400 error shape ─────────────────────────────────────────────

  it('all 400 validation errors include an "error" string and "field" key', async () => {
    const cases = [
      makeRequest({ davidson_email: VALID_EMAIL }),                              // missing wallet
      makeRequest({ wallet_address: 'bad', davidson_email: VALID_EMAIL }),       // invalid wallet
      makeRequest({ wallet_address: VALID_WALLET }),                             // missing email
      makeRequest({ wallet_address: VALID_WALLET, davidson_email: 'x@gmail.com' }), // wrong domain
    ]
    for (const req of cases) {
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(typeof body.error).toBe('string')
      expect(body).toHaveProperty('field')
    }
  })
})

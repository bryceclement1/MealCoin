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
  vi.mocked(supabase.from).mockReturnValue({
    insert: vi.fn().mockResolvedValue({ error: null }),
  } as ReturnType<typeof supabase.from>)
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

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns 200 { success: true } when inputs are valid', async () => {
    mockHappyPath()
    const res = await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(typeof body.message).toBe('string')
  })

  it('inserts a verification token into the DB on valid input', async () => {
    mockHappyPath()
    const insertMock = vi.mocked(supabase.from).mock.results
    await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: VALID_EMAIL }))
    expect(supabase.from).toHaveBeenCalledWith('verification_tokens')
  })

  it('calls supabaseAuth.auth.signInWithOtp on valid input', async () => {
    mockHappyPath()
    await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: VALID_EMAIL }))
    expect(supabaseAuth.auth.signInWithOtp).toHaveBeenCalledOnce()
  })

  it('passes the davidson_email (lowercased) to signInWithOtp', async () => {
    mockHappyPath()
    await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: 'JDOE@davidson.edu' }))
    const call = vi.mocked(supabaseAuth.auth.signInWithOtp).mock.calls[0][0]
    expect(call.email).toBe('jdoe@davidson.edu')
  })

  it('returns 500 when the token insert fails', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: 'db error' } }),
    } as ReturnType<typeof supabase.from>)
    const res = await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 500 when the email sending fails', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as ReturnType<typeof supabase.from>)
    vi.mocked(supabaseAuth.auth.signInWithOtp).mockResolvedValue({
      data: null as never,
      error: { message: 'email failed', status: 500 } as never,
    })
    const res = await POST(makeRequest({ wallet_address: VALID_WALLET, davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
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

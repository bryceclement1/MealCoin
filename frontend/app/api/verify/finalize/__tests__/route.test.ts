import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { POST } from '@/app/api/verify/finalize/route'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/verify/finalize', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_EMAIL = 'jdoe@davidson.edu'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/verify/finalize', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── davidson_email validation ───────────────────────────────────────────────

  it('returns 400 with field "davidson_email" when davidson_email is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.field).toBe('davidson_email')
  })

  it('returns 400 with field "davidson_email" when davidson_email is not a davidson.edu address', async () => {
    const res = await POST(makeRequest({ davidson_email: 'user@gmail.com' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('davidson_email')
  })

  it('returns 400 with field "davidson_email" when davidson_email has no @', async () => {
    const res = await POST(makeRequest({ davidson_email: 'notanemail' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('davidson_email')
  })

  it('does not query the database when davidson_email is invalid', async () => {
    await POST(makeRequest({ davidson_email: 'bad@gmail.com' }))
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // ── Domain errors ──────────────────────────────────────────────────────────

  it('returns 400 when no pending verification token exists for the email', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as ReturnType<typeof supabase.from>)

    const res = await POST(makeRequest({ davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 410 when the pending token is expired', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          wallet_address: '0x0000000000000000000000000000000000000001',
          expires_at: new Date(Date.now() - 60000).toISOString(), // expired
        },
        error: null,
      }),
    } as ReturnType<typeof supabase.from>)

    const res = await POST(makeRequest({ davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  // ── Consistent error shape ──────────────────────────────────────────────────

  it('all 400 validation errors include an "error" string and "field" key', async () => {
    const cases = [
      makeRequest({}),                                        // missing email
      makeRequest({ davidson_email: 'x@gmail.com' }),        // wrong domain
      makeRequest({ davidson_email: 'notanemail' }),          // no @
    ]
    for (const req of cases) {
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(typeof body.error).toBe('string')
      expect(body.field).toBe('davidson_email')
    }
  })

  // ── DB error ───────────────────────────────────────────────────────────────

  it('returns 500 when the database lookup fails', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    } as ReturnType<typeof supabase.from>)

    const res = await POST(makeRequest({ davidson_email: VALID_EMAIL }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

/**
 * Tests for GET /api/students (app/api/students/route.ts).
 *
 * Covers:
 *   - Returns 400 when wallet param is missing
 *   - Returns 400 when wallet param is not a valid address
 *   - Returns { verified: false } when wallet is not found in the DB
 *   - Returns { verified: true, student: {...} } when wallet is found
 *   - Returns 500 on a database error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/students/route'

const mockMaybeSingle = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  },
}))

function makeRequest(wallet?: string) {
  const url = wallet
    ? `http://localhost/api/students?wallet=${wallet}`
    : 'http://localhost/api/students'
  return new NextRequest(url)
}

const VALID_WALLET = '0x' + 'a'.repeat(40)

describe('GET /api/students', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when wallet param is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
  })

  it('returns 400 when wallet is not a valid address', async () => {
    const res = await GET(makeRequest('not-an-address'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.field).toBe('wallet')
  })

  it('returns { verified: false } when wallet is not found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(makeRequest(VALID_WALLET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ verified: false })
  })

  it('returns { verified: true, student } when wallet is found', async () => {
    const student = {
      wallet_address: VALID_WALLET.toLowerCase(),
      davidson_email: 'student@davidson.edu',
      verified_at: '2025-04-01T00:00:00.000Z',
    }
    mockMaybeSingle.mockResolvedValue({ data: student, error: null })
    const res = await GET(makeRequest(VALID_WALLET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verified).toBe(true)
    expect(body.student).toEqual(student)
  })

  it('returns 500 on a database error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const res = await GET(makeRequest(VALID_WALLET))
    expect(res.status).toBe(500)
  })
})

/**
 * Tests for GET /api/health (app/api/health/route.ts).
 *
 * Covers:
 *   - Returns 200 { status: 'ok' } when the database is reachable
 *   - Returns 503 { status: 'error' } when the database query fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/health/route'

// Mock the Supabase client with a chainable builder
const mockHead = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => mockHead(),
    }),
  },
}))

describe('GET /api/health', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 with status ok when the DB is reachable', async () => {
    mockHead.mockResolvedValue({ error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('returns 503 with status error when the DB query fails', async () => {
    mockHead.mockResolvedValue({ error: { message: 'connection refused' } })
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.message).toBe('Database unreachable')
  })
})

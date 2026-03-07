import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock must be declared before importing the module under test
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { GET } from '@/app/api/health/route'
import { supabase } from '@/lib/supabase'

// Helper to build the mock Supabase query chain: .from().select()
function mockQueryChain(result: { error: unknown }) {
  const selectMock = vi.fn().mockResolvedValue(result)
  vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as ReturnType<typeof supabase.from>)
  return selectMock
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with { status: "ok" } when the database is reachable', async () => {
    mockQueryChain({ error: null })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ status: 'ok' })
  })

  it('queries the students table with a head-only count check', async () => {
    const selectMock = mockQueryChain({ error: null })

    await GET()

    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('students')
    expect(selectMock).toHaveBeenCalledWith('davidson_email', { count: 'exact', head: true })
  })

  it('returns 503 with { status: "error" } when the database query fails', async () => {
    mockQueryChain({ error: { message: 'Connection refused', code: 'PGRST000' } })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('error')
    expect(body.message).toBe('Database unreachable')
  })

  it('returns 200 when the database is reachable even if the students table is empty', async () => {
    mockQueryChain({ error: null })

    const res = await GET()

    expect(res.status).toBe(200)
  })
})

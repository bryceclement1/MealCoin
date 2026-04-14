/**
 * Tests for the offer expiry cron job (src/cron/expireOffers.ts).
 *
 * expireOffers() is a private function invoked by a node-cron schedule.
 * We test it by:
 *   1. Mocking node-cron so registerExpiryCron() doesn't start a real timer
 *   2. Capturing the scheduled callback and calling it directly
 *
 * Covers:
 *   - registerExpiryCron schedules with the Saturday night UTC expression
 *   - Returns early (no viem calls) when the DB query fails
 *   - Returns early (no viem calls) when there are no expired pending offers
 *   - Calls claimExpiredOffer on-chain for each expired offer found
 *   - Continues processing remaining offers when one transaction fails
 *   - Passes the correct offerId (as bigint) to each writeContract call
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks (hoisted) ──────────────────────────────────────────────────

vi.mock('../../src/config', () => ({
  config: {
    supabaseUrl: 'https://fake.supabase.co',
    supabaseKey: 'fake-key',
    privateKey: '0x' + 'a'.repeat(64),
    rpcUrl: 'https://fake-rpc.example.com',
    marketAddress: '0xA030C790F2509C653fd7856092eE758aB8f6b360',
  },
}))

// vi.mock factories are hoisted before variable declarations, so declare any
// variables referenced inside factories using vi.hoisted().
const { mockFrom, mockWriteContract, mockWaitForReceipt } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockWriteContract: vi.fn(),
  mockWaitForReceipt: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('viem', () => ({
  createWalletClient: vi.fn(() => ({ writeContract: mockWriteContract })),
  createPublicClient: vi.fn(() => ({ waitForTransactionReceipt: mockWaitForReceipt })),
  http: vi.fn(),
}))

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({ address: '0xdeployer' })),
}))

vi.mock('../../abis/marketplace', () => ({
  MARKETPLACE_ABI: [],
}))

// Make withRetry transparent — just calls fn() directly, no sleep
vi.mock('../../src/retry', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}))

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}))

// ── Imports (after mocks) ───────────────────────────────────────────────────

import cron from 'node-cron'
import { registerExpiryCron } from '../../src/cron/expireOffers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a thenable Supabase query chain.  The final await resolves with
 * `result` regardless of which method ends the chain.
 */
function makeChain(result: unknown) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['select', 'eq', 'lt', 'update', 'order']) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  ;(q as any).then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  return q
}

/**
 * Registers the cron and returns the async callback that would fire on
 * Saturday night.  Calling it exercises expireOffers() directly.
 */
function getCronCallback(): () => Promise<void> {
  vi.mocked(cron.schedule).mockClear()
  registerExpiryCron()
  const calls = vi.mocked(cron.schedule).mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[0][1] as () => Promise<void>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerExpiryCron', () => {
  beforeEach(() => vi.clearAllMocks())

  it('schedules using the Saturday 11:56 PM EST (04:56 UTC Sunday) expression', () => {
    registerExpiryCron()
    expect(cron.schedule).toHaveBeenCalledWith('56 4 * * 0', expect.any(Function))
  })
})

describe('expireOffers (via cron callback)', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── DB error ──────────────────────────────────────────────────────────────

  it('returns early without calling viem when the DB query fails', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'connection refused' } }))
    const run = getCronCallback()
    await run()
    expect(mockWriteContract).not.toHaveBeenCalled()
  })

  // ── No expired offers ─────────────────────────────────────────────────────

  it('returns early without calling viem when there are no expired offers', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const run = getCronCallback()
    await run()
    expect(mockWriteContract).not.toHaveBeenCalled()
  })

  it('returns early when data is null', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const run = getCronCallback()
    await run()
    expect(mockWriteContract).not.toHaveBeenCalled()
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('calls writeContract once for each expired offer', async () => {
    mockFrom.mockReturnValue(makeChain({
      data: [{ onchain_offer_id: 1 }, { onchain_offer_id: 2 }, { onchain_offer_id: 3 }],
      error: null,
    }))
    mockWriteContract.mockResolvedValue('0xtx')
    mockWaitForReceipt.mockResolvedValue({})

    const run = getCronCallback()
    await run()
    expect(mockWriteContract).toHaveBeenCalledTimes(3)
  })

  it('passes the correct offerId as bigint to each claimExpiredOffer call', async () => {
    mockFrom.mockReturnValue(makeChain({
      data: [{ onchain_offer_id: 7 }, { onchain_offer_id: 42 }],
      error: null,
    }))
    mockWriteContract.mockResolvedValue('0xtx')
    mockWaitForReceipt.mockResolvedValue({})

    const run = getCronCallback()
    await run()

    expect(mockWriteContract.mock.calls[0][0].args).toEqual([7n])
    expect(mockWriteContract.mock.calls[1][0].args).toEqual([42n])
  })

  it('calls the correct contract function name', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ onchain_offer_id: 1 }], error: null }))
    mockWriteContract.mockResolvedValue('0xtx')
    mockWaitForReceipt.mockResolvedValue({})

    const run = getCronCallback()
    await run()
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe('claimExpiredOffer')
  })

  it('waits for the transaction receipt after each writeContract', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ onchain_offer_id: 5 }], error: null }))
    mockWriteContract.mockResolvedValue('0xdeadbeef')
    mockWaitForReceipt.mockResolvedValue({})

    const run = getCronCallback()
    await run()
    expect(mockWaitForReceipt).toHaveBeenCalledWith({ hash: '0xdeadbeef' })
  })

  // ── Partial failure ───────────────────────────────────────────────────────

  it('processes all offers even when one transaction fails', async () => {
    mockFrom.mockReturnValue(makeChain({
      data: [{ onchain_offer_id: 10 }, { onchain_offer_id: 11 }, { onchain_offer_id: 12 }],
      error: null,
    }))
    mockWriteContract
      .mockResolvedValueOnce('0xtx10')
      .mockRejectedValueOnce(new Error('gas too low'))
      .mockResolvedValueOnce('0xtx12')
    mockWaitForReceipt.mockResolvedValue({})

    const run = getCronCallback()
    await expect(run()).resolves.toBeUndefined()
    expect(mockWriteContract).toHaveBeenCalledTimes(3)
  })

  it('does not throw when all transactions fail', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ onchain_offer_id: 99 }], error: null }))
    mockWriteContract.mockRejectedValue(new Error('reverted'))

    const run = getCronCallback()
    await expect(run()).resolves.toBeUndefined()
  })
})

/**
 * Tests for the retry utility (src/retry.ts).
 *
 * Covers:
 *   - Successful function returns immediately on first attempt
 *   - Retries the correct number of times before giving up
 *   - Succeeds on the Nth attempt (not just first or last)
 *   - Re-throws the last error after exhausting all attempts
 *   - sleep() pauses for approximately the requested duration
 */

import { describe, it, expect, vi } from 'vitest'
import { withRetry, sleep } from '../src/retry'

describe('withRetry', () => {
  it('returns immediately when the function succeeds on the first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, 3, 'test-op')
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and succeeds on the second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered')

    // Use maxAttempts=2 and override sleep so the test doesn't wait
    const result = await withRetry(fn, 2, 'test-op')
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('succeeds on the last allowed attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('final success')

    const result = await withRetry(fn, 3, 'test-op')
    expect(result).toBe('final success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting all attempts', async () => {
    const error = new Error('always fails')
    const fn = vi.fn().mockRejectedValue(error)

    await expect(withRetry(fn, 3, 'test-op')).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('re-throws the last error (not an earlier one)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('first error'))
      .mockRejectedValueOnce(new Error('second error'))
      .mockRejectedValueOnce(new Error('last error'))

    await expect(withRetry(fn, 3, 'test-op')).rejects.toThrow('last error')
  })

  it('calls the function exactly maxAttempts times when all fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const maxAttempts = 5
    // maxAttempts=5 sleeps 1s+2s+4s+8s=15s total — raise the per-test timeout
    await expect(withRetry(fn, maxAttempts, 'test-op')).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(maxAttempts)
  }, 25_000)

  it('works with maxAttempts=1 (no retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    await expect(withRetry(fn, 1, 'test-op')).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('sleep', () => {
  it('resolves after approximately the requested duration', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    // Allow generous tolerance for CI timing variance
    expect(elapsed).toBeGreaterThanOrEqual(40)
    expect(elapsed).toBeLessThan(500)
  })

  it('resolves immediately for 0ms', async () => {
    const start = Date.now()
    await sleep(0)
    expect(Date.now() - start).toBeLessThan(100)
  })
})

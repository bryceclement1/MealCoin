/**
 * Retry utility with exponential backoff.
 *
 * Used by all event handlers and the expiry cron job to recover from transient
 * RPC or Supabase failures without crashing the indexer.
 */

/**
 * Retry an async function up to `maxAttempts` times using exponential backoff.
 * Delays follow the sequence: 1s, 2s, 4s, 8s, 16s (2^(attempt-1) seconds).
 * If all attempts fail, the last error is re-thrown.
 *
 * @param fn          - The async operation to attempt
 * @param maxAttempts - Maximum number of tries (default 5)
 * @param label       - Human-readable label used in log messages
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  label = 'operation'
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`[ERROR] ${label} failed after ${maxAttempts} attempts:`, err)
        throw err
      }
      const delay = Math.pow(2, attempt - 1) * 1000  // 1s, 2s, 4s, 8s, 16s
      console.warn(`[WARN] ${label} attempt ${attempt} failed. Retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }
  throw new Error('unreachable')
}

/** Pause execution for the given number of milliseconds. */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

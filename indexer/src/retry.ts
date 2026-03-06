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

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

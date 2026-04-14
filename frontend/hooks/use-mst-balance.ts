/**
 * Hook for reading a wallet's MealSwipeToken (MST) balance for the current week.
 *
 * The token contract scopes balances by (address, weekEpoch), so the current
 * week must be passed as an argument. The epoch is computed client-side as
 * floor(unixTimestamp / 604800) — the same formula used in the contract.
 */

'use client'

import { useReadContract } from 'wagmi'
import { TOKEN_ADDRESS, TOKEN_ABI } from '@/lib/contracts'

/**
 * Compute the current week epoch as a bigint.
 * A "week" is defined as a 604800-second (7-day) period starting from Unix epoch 0.
 * This matches the `getCurrentWeek()` function in the MealSwipeToken contract.
 */
function getCurrentWeekEpoch(): bigint {
  return BigInt(Math.floor(Date.now() / 1000 / 604800))
}

/**
 * Return the connected wallet's swipe balance for the current week epoch.
 * The hook is disabled when no wallet address is provided.
 *
 * @param walletAddress - The smart account address to check (undefined = skip)
 * @returns wagmi useReadContract result with `data` as the balance (bigint)
 */
export function useMSTBalance(walletAddress?: `0x${string}`) {
  const week = getCurrentWeekEpoch()

  return useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress, week] : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  })
}

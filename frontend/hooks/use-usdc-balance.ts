/**
 * Hook for reading a wallet's USDC balance.
 *
 * USDC uses 6 decimals — divide the returned bigint by 1_000_000 to get
 * the dollar amount (e.g. 7_000_000n = $7.00).
 */

'use client'

import { useReadContract } from 'wagmi'
import { USDC_ADDRESS, USDC_ABI } from '@/lib/contracts'

/**
 * Return the USDC balance of the given wallet address.
 * The hook is disabled when no address is provided.
 *
 * @param walletAddress - The smart account address to check (undefined = skip)
 * @returns wagmi useReadContract result with `data` as the raw balance (bigint, 6 decimals)
 */
export function useUSDCBalance(walletAddress?: `0x${string}`) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  })
}

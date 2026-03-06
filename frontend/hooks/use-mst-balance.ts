'use client'

import { useReadContract } from 'wagmi'
import { TOKEN_ADDRESS, TOKEN_ABI } from '@/lib/contracts'

export function useCurrentWeek() {
  return useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'getCurrentWeek',
  })
}

export function useMSTBalance(walletAddress?: `0x${string}`) {
  const { data: week } = useCurrentWeek()

  return useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: walletAddress && week !== undefined ? [walletAddress, week] : undefined,
    query: { enabled: !!walletAddress && week !== undefined },
  })
}

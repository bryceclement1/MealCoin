'use client'

import { useReadContract } from 'wagmi'
import { TOKEN_ADDRESS, TOKEN_ABI } from '@/lib/contracts'

function getCurrentWeekEpoch(): bigint {
  return BigInt(Math.floor(Date.now() / 1000 / 604800))
}

export function useMSTBalance(walletAddress?: `0x${string}`) {
  const week = getCurrentWeekEpoch()

  return useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress, week] : undefined,
    query: { enabled: !!walletAddress },
  })
}

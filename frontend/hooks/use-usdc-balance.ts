'use client'

import { useReadContract } from 'wagmi'
import { USDC_ADDRESS, USDC_ABI } from '@/lib/contracts'

export function useUSDCBalance(walletAddress?: `0x${string}`) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress },
  })
}

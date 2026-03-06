'use client'

import { useReadContract, useReadContracts } from 'wagmi'
import type { Abi } from 'viem'
import { MARKET_ADDRESS, MARKET_ABI } from '@/lib/contracts'

export type OnChainOffer = {
  offerId: bigint
  offerType: number      // 0 = Ask (sell), 1 = Bid (buy)
  creator: `0x${string}`
  swipeCount: bigint
  pricePerSwipe: bigint  // MockUSDC units, 6 decimals (e.g. 7_000_000 = $7.00)
  expiresAt: bigint      // Unix timestamp
  status: number         // 0=Pending, 1=Accepted, 2=Cancelled, 3=Expired
}

export function useMarketOffers() {
  const { data: offerCount } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: 'offerCount',
  })

  const count = offerCount ? Number(offerCount) : 0

  const contracts = Array.from({ length: count }, (_, i) => ({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI as Abi,
    functionName: 'getOffer' as const,
    args: [BigInt(i + 1)] as const,
  }))

  const { data: results, refetch, isLoading } = useReadContracts({
    contracts,
    query: { enabled: count > 0 },
  })

  const pending = ((results ?? []) as Array<{ result: OnChainOffer | undefined; status: 'success' | 'failure' }>)
    .filter((r): r is { result: OnChainOffer; status: 'success' } =>
      r.status === 'success' && r.result !== undefined && r.result.status === 0
    )
    .map((r) => r.result)

  return {
    asks: pending.filter((o) => o.offerType === 0),
    bids: pending.filter((o) => o.offerType === 1),
    isLoading: offerCount === undefined || (count > 0 && isLoading),
    refetch,
  }
}

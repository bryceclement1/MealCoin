/**
 * Hook for reading all pending offers directly from the Marketplace contract.
 *
 * This hook reads on-chain state in real-time using wagmi's useReadContracts,
 * which batches all getOffer() calls into a single RPC multicall. It is used
 * by the listing modals (accept, cancel) that need the freshest possible state
 * before submitting a transaction.
 *
 * Note: the listings page itself uses the Supabase-backed hooks (use-offers.ts)
 * for browsing, which are faster and cheaper to query than going on-chain.
 */

'use client'

import { useReadContract, useReadContracts } from 'wagmi'
import type { Abi } from 'viem'
import { MARKET_ADDRESS, MARKET_ABI } from '@/lib/contracts'

/** The full offer struct as returned by the Marketplace contract's getOffer(). */
export type OnChainOffer = {
  offerId: bigint
  offerType: number      // 0 = Ask (sell), 1 = Bid (buy)
  creator: `0x${string}`
  swipeCount: bigint
  pricePerSwipe: bigint  // USDC units, 6 decimals (e.g. 7_000_000 = $7.00)
  expiresAt: bigint      // Unix timestamp
  status: number         // 0=Pending, 1=Accepted, 2=Cancelled, 3=Expired
}

/**
 * Fetch all pending offers from the Marketplace contract.
 *
 * Steps:
 *   1. Read offerCount to know how many offers have ever been created
 *   2. Build a getOffer() call for each ID (IDs are 1-indexed)
 *   3. Batch all calls via useReadContracts (single multicall RPC request)
 *   4. Filter to only pending (status === 0) and split into asks / bids
 *
 * @returns asks, bids, isLoading, refetch
 */
export function useMarketOffers() {
  const { data: offerCount } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: 'offerCount',
    query: { staleTime: 30_000, refetchOnWindowFocus: false },
  })

  const count = offerCount ? Number(offerCount) : 0

  // Build one getOffer call per offer ID (offers are 1-indexed on-chain)
  const contracts = Array.from({ length: count }, (_, i) => ({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI as Abi,
    functionName: 'getOffer' as const,
    args: [BigInt(i + 1)] as const,
  }))

  const { data: results, refetch, isLoading } = useReadContracts({
    contracts,
    query: { enabled: count > 0, staleTime: 30_000, refetchOnWindowFocus: false },
  })

  // Filter to only successfully fetched pending offers
  const pending = ((results ?? []) as Array<{ result: OnChainOffer | undefined; status: 'success' | 'failure' }>)
    .filter((r): r is { result: OnChainOffer; status: 'success' } =>
      r.status === 'success' && r.result !== undefined && r.result.status === 0
    )
    .map((r) => r.result)

  return {
    asks: pending.filter((o) => o.offerType === 0),
    bids: pending.filter((o) => o.offerType === 1),
    // isLoading is true while waiting for offerCount or while fetching offers
    isLoading: offerCount === undefined || (count > 0 && isLoading),
    refetch,
  }
}

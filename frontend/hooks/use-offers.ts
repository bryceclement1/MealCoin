/**
 * Hooks for fetching ask and bid listings from the Supabase-backed API.
 *
 * These poll the /api/asks and /api/bids endpoints (which read from Supabase)
 * rather than querying the blockchain directly. This is faster and cheaper,
 * and the data stays current because the indexer keeps Supabase in sync with
 * on-chain events. Both hooks refresh every 15 seconds automatically.
 */

'use client'

import useSWR from 'swr'
import { fetcher, type Offer } from '@/lib/api'

/**
 * Return all active sell offers (asks), ordered by price ascending (cheapest first).
 * Refreshes every 15 seconds.
 */
export function useAsks() {
  return useSWR<{ asks: Offer[] }>('/api/asks', fetcher, { refreshInterval: 15000 })
}

/**
 * Return all active buy offers (bids), ordered by price descending (highest first).
 * Refreshes every 15 seconds.
 */
export function useBids() {
  return useSWR<{ bids: Offer[] }>('/api/bids', fetcher, { refreshInterval: 15000 })
}

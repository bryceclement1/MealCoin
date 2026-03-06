'use client'

import useSWR from 'swr'
import { fetcher, type Offer } from '@/lib/api'

export function useAsks() {
  return useSWR<{ asks: Offer[] }>('/api/asks', fetcher, { refreshInterval: 15000 })
}

export function useBids() {
  return useSWR<{ bids: Offer[] }>('/api/bids', fetcher, { refreshInterval: 15000 })
}

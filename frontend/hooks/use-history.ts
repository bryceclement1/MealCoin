'use client'

import useSWR from 'swr'
import { useAccount } from 'wagmi'
import { fetcher, type HistoryItem } from '@/lib/api'

export function useHistory() {
  const { address, isConnected } = useAccount()

  return useSWR<{ history: HistoryItem[] }>(
    isConnected && address ? `/api/wallet/${address}/history` : null,
    fetcher,
    { refreshInterval: 30000 }
  )
}

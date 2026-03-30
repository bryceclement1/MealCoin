'use client'

import useSWR from 'swr'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { fetcher, type HistoryItem } from '@/lib/api'

export function useHistory() {
  const { isConnected } = useAccount()
  const { smartAddress } = useSmartAccount()

  return useSWR<{ history: HistoryItem[] }>(
    isConnected && smartAddress ? `/api/wallet/${smartAddress}/history` : null,
    fetcher,
    { refreshInterval: 30000 }
  )
}

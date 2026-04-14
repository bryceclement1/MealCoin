/**
 * Hook for fetching a wallet's combined trade and redemption history.
 *
 * Polls the /api/wallet/[address]/history endpoint every 30 seconds so the
 * history page stays reasonably fresh without hammering the API.
 */

'use client'

import useSWR from 'swr'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { fetcher, type HistoryItem } from '@/lib/api'

/**
 * Return the transaction history for the connected smart account.
 * Returns null data (and skips the request) if no wallet is connected.
 *
 * @returns SWR result with `data.history` as a HistoryItem[] sorted by timestamp desc
 */
export function useHistory() {
  const { isConnected } = useAccount()
  const { smartAddress } = useSmartAccount()

  return useSWR<{ history: HistoryItem[] }>(
    isConnected && smartAddress ? `/api/wallet/${smartAddress}/history` : null,
    fetcher,
    { refreshInterval: 30000 }
  )
}

'use client'

import useSWR from 'swr'
import { useAccount } from 'wagmi'
import { fetcher } from '@/lib/api'

export function useVerified() {
  const { address, isConnected } = useAccount()

  const { data } = useSWR(
    isConnected && address ? `/api/students?wallet=${address}` : null,
    fetcher
  )

  return {
    isVerified: data?.verified === true,
    isLoading: isConnected && !!address && data === undefined,
  }
}

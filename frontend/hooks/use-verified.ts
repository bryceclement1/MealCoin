'use client'

import useSWR from 'swr'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { fetcher } from '@/lib/api'

export function useVerified() {
  const { isConnected } = useAccount()
  const { smartAddress } = useSmartAccount()

  const { data } = useSWR(
    isConnected && smartAddress ? `/api/students?wallet=${smartAddress}` : null,
    fetcher
  )

  return {
    isVerified: data?.verified === true,
    isLoading: isConnected && !!smartAddress && data === undefined,
  }
}

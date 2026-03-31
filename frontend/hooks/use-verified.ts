'use client'

import useSWR from 'swr'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { fetcher } from '@/lib/api'

export function useVerified() {
  const { isConnected } = useAccount()
  const { smartAddress } = useSmartAccount()

  const { data, isValidating } = useSWR(
    isConnected && smartAddress ? `/api/students?wallet=${smartAddress}` : null,
    fetcher
  )

  return {
    isVerified: data?.verified === true,
    // Treat any in-flight SWR request (initial load or revalidation) as loading
    // so the guard never redirects on stale data during navigation
    isLoading: isConnected && !!smartAddress && (data === undefined || isValidating),
  }
}

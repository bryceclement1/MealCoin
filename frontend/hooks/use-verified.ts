/**
 * Hook for checking whether the connected wallet has a verified Davidson email.
 *
 * Polls the /api/students endpoint via SWR, using the smart account address
 * (not the raw EOA) as the lookup key — tokens and student records are all
 * keyed on the smart account address.
 */

'use client'

import useSWR from 'swr'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { fetcher } from '@/lib/api'

/**
 * Return the verification status of the currently connected wallet.
 *
 * The hook waits until both the wallet connection and the smart account
 * address are resolved before making a request, preventing false redirects
 * on stale data during page navigation.
 *
 * @returns isVerified - true if the wallet has a linked @davidson.edu email
 * @returns isLoading  - true while any in-flight request is pending
 */
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
    // so the verification guard never redirects on stale data during navigation
    isLoading: isConnected && !!smartAddress && (data === undefined || isValidating),
  }
}

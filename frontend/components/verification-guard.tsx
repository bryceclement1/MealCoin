/**
 * Route-level verification guard.
 *
 * Wraps the page tree and enforces that every page (except /onboarding) requires
 * a verified @davidson.edu email linked to the connected wallet. Unverified
 * users are redirected to /onboarding; verified users who visit /onboarding
 * are bounced back to the dashboard.
 *
 * The guard waits for both the smart account address and the verification check
 * to resolve before redirecting, preventing flash-of-wrong-page during initial load.
 */

'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useVerified } from '@/hooks/use-verified'

// Pages that are accessible without verification
const PUBLIC_PATHS = ['/onboarding']

/**
 * Render children immediately (no loading gate), but trigger redirects via
 * useEffect once the verification state is definitively known.
 * This avoids a blank-screen flash while still enforcing the auth requirement.
 */
export function VerificationGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isConnected } = useAccount()
  const { smartAddress, isLoading: isSmartLoading } = useSmartAccount()
  const { isVerified, isLoading: isVerifiedLoading } = useVerified()

  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // Don't redirect until we have a definitive answer — smartAddress must be
  // resolved before we can trust the verification result, because the students
  // table is keyed on the smart account address (not the raw EOA).
  const isLoading = isSmartLoading || !smartAddress || isVerifiedLoading

  useEffect(() => {
    if (isPublicPath) {
      // Redirect verified users away from /onboarding to the dashboard
      if (!isLoading && isConnected && isVerified) router.push('/')
      return
    }
    if (!isConnected) return
    if (isLoading) return
    if (!isVerified) router.push('/onboarding')
  }, [isPublicPath, isConnected, isLoading, isVerified, router])

  return <>{children}</>
}

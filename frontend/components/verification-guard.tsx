'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useVerified } from '@/hooks/use-verified'

// Pages that don't require verification
const PUBLIC_PATHS = ['/onboarding']

export function VerificationGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isConnected } = useAccount()
  const { smartAddress, isLoading: isSmartLoading } = useSmartAccount()
  const { isVerified, isLoading: isVerifiedLoading } = useVerified()

  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  // Don't redirect until we have a definitive answer — smartAddress must be
  // resolved before we can trust the verification result.
  const isLoading = isSmartLoading || !smartAddress || isVerifiedLoading

  useEffect(() => {
    if (isPublicPath) {
      // Redirect verified users away from onboarding to the dashboard
      if (!isLoading && isConnected && isVerified) router.push('/')
      return
    }
    if (!isConnected) return
    if (isLoading) return
    if (!isVerified) router.push('/onboarding')
  }, [isPublicPath, isConnected, isLoading, isVerified, router])

  return <>{children}</>
}

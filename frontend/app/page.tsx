'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useVerified } from '@/hooks/use-verified'
import { BalanceCard } from '@/components/dashboard/balance-card'
import { ExpiryCountdown } from '@/components/dashboard/expiry-countdown'
import { SendSwipeModal } from '@/components/dashboard/send-swipe-modal'

export default function Home() {
  const { isConnected } = useAccount()
  const { smartAddress, isLoading: isSmartLoading } = useSmartAccount()
  const { isVerified, isLoading: isVerifiedLoading } = useVerified()
  const router = useRouter()

  // Wait for smart account to resolve before checking verification status
  const isLoading = isSmartLoading || (!!smartAddress && isVerifiedLoading)

  useEffect(() => {
    if (isConnected && !isLoading && !isVerified) {
      router.push('/onboarding')
    }
  }, [isConnected, isVerified, isLoading, router])

  return (
    <main className="container mx-auto p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <BalanceCard />
        <ExpiryCountdown />
      </div>
      <SendSwipeModal />
    </main>
  )
}

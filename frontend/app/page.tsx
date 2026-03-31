'use client'

import { BalanceCard } from '@/components/dashboard/balance-card'
import { ExpiryCountdown } from '@/components/dashboard/expiry-countdown'
import { SendSwipeModal } from '@/components/dashboard/send-swipe-modal'

export default function Home() {
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

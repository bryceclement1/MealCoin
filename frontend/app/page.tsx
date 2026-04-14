/**
 * Dashboard page — the home screen for verified students.
 *
 * Shows the student's current swipe and USDC balances, a countdown to the
 * weekly swipe expiry (Saturday midnight), and buttons to send swipes or USDC
 * directly to another wallet.
 */

'use client'

import { BalanceCard } from '@/components/dashboard/balance-card'
import { ExpiryCountdown } from '@/components/dashboard/expiry-countdown'
import { SendSwipeModal } from '@/components/dashboard/send-swipe-modal'
import { SendUSDCModal } from '@/components/dashboard/send-usdc-modal'

export default function Home() {
  return (
    <main className="container mx-auto p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <BalanceCard />
        <ExpiryCountdown />
      </div>
      <div className="flex gap-3">
        <SendSwipeModal />
        <SendUSDCModal />
      </div>
    </main>
  )
}

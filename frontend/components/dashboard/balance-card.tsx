/**
 * Dashboard card showing the connected wallet's swipe and USDC balances.
 *
 * Reads balances from the MealSwipeToken and USDC contracts via wagmi hooks.
 * Shows loading skeletons while data is in flight, and a prompt to connect
 * if no wallet is connected.
 */

'use client'

import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useMSTBalance } from '@/hooks/use-mst-balance'
import { useUSDCBalance } from '@/hooks/use-usdc-balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Render the balance card. Displays swipe count (whole number) and USDC
 * balance formatted to 2 decimal places. USDC raw value is divided by
 * 1_000_000 to convert from 6-decimal token units to dollars.
 */
export function BalanceCard() {
  const { isConnected } = useAccount()
  const { smartAddress } = useSmartAccount()
  const { data: mstBalance, isLoading: mstLoading } = useMSTBalance(smartAddress)
  const { data: usdcBalance, isLoading: usdcLoading } = useUSDCBalance(smartAddress)

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Balances</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Connect your wallet to see your balance.</p>
        </CardContent>
      </Card>
    )
  }

  // Convert USDC from 6-decimal raw bigint to a dollar string (e.g. "7.00")
  const usdcFormatted = usdcBalance !== undefined
    ? (Number(usdcBalance) / 1_000_000).toFixed(2)
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Balances</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          {mstLoading || mstBalance === undefined ? (
            <Skeleton className="h-12 w-24" />
          ) : (
            <p className="text-5xl font-bold tabular-nums">{mstBalance?.toString() ?? '0'}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">swipes available this week</p>
        </div>

        <div className="border-t pt-4">
          {usdcLoading || usdcFormatted === null ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <p className="text-3xl font-bold tabular-nums">${usdcFormatted}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">USDC balance</p>
        </div>
      </CardContent>
    </Card>
  )
}

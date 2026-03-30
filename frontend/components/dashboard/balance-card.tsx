'use client'

import { useAccount } from 'wagmi'
import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useMSTBalance } from '@/hooks/use-mst-balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function BalanceCard() {
  const { isConnected } = useAccount()
  const { smartAddress } = useSmartAccount()
  const { data: balance, isLoading } = useMSTBalance(smartAddress)

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Swipes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Connect your wallet to see your balance.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Swipes</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || balance === undefined ? (
          <Skeleton className="h-12 w-24" />
        ) : (
          <p className="text-5xl font-bold tabular-nums">{balance?.toString() ?? '0'}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">available this week</p>
      </CardContent>
    </Card>
  )
}

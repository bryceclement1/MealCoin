'use client'

import { useAccount } from 'wagmi'
import { useHistory } from '@/hooks/use-history'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type HistoryItem } from '@/lib/api'

const truncateTx = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-6)}`

const TYPE_LABEL: Record<HistoryItem['type'], string> = {
  trade_bought: 'Bought',
  trade_sold: 'Sold',
  redemption: 'Redeemed',
}

const TYPE_COLOR: Record<HistoryItem['type'], string> = {
  trade_bought: 'text-green-600',
  trade_sold:   'text-blue-600',
  redemption:   'text-orange-500',
}

export default function HistoryPage() {
  const { isConnected } = useAccount()
  const { data, isLoading } = useHistory()

  return (
    <main className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Trade History</h1>

      <div className="mt-6 space-y-3">
        {!isConnected ? (
          <p className="text-sm text-muted-foreground">
            Connect your wallet to see your history.
          </p>
        ) : isLoading ? (
          [1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))
        ) : data?.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          data?.history.map((item) => (
            <HistoryCard key={item.tx_hash} item={item} />
          ))
        )}
      </div>
    </main>
  )
}

function HistoryCard({ item }: { item: HistoryItem }) {
  const date = new Date(item.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="space-y-1 text-sm">
          <p className={`font-semibold ${TYPE_COLOR[item.type]}`}>
            {TYPE_LABEL[item.type]}
          </p>
          {item.swipe_count !== null && (
            <p>
              {item.swipe_count} swipe{item.swipe_count !== 1 ? 's' : ''}
              {item.price !== null ? ` — $${item.price.toFixed(2)}` : ''}
            </p>
          )}
          <p className="text-muted-foreground text-xs">{truncateTx(item.tx_hash)}</p>
        </div>
        <p className="text-muted-foreground text-xs ml-4 shrink-0">{date}</p>
      </CardContent>
    </Card>
  )
}

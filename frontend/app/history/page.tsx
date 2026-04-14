/**
 * Trade history page — shows the connected wallet's combined record of
 * trades (bought and sold) and dining redemptions.
 *
 * Data is fetched from /api/wallet/[address]/history via the useHistory hook,
 * which refreshes every 30 seconds. Each item is color-coded by type:
 *   - Bought (green): user purchased swipes from a sell offer
 *   - Sold (blue): user's sell offer was accepted by another user
 *   - Redeemed (orange): user's swipe was burned at a dining terminal
 */

'use client'

import { useAccount } from 'wagmi'
import { useHistory } from '@/hooks/use-history'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type HistoryItem } from '@/lib/api'

/** Shorten a tx hash to "0x12345678...abcdef" for compact display. */
const truncateTx = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-6)}`

/** Human-readable labels for each history item type. */
const TYPE_LABEL: Record<HistoryItem['type'], string> = {
  trade_bought: 'Bought',
  trade_sold: 'Sold',
  redemption: 'Redeemed',
}

/** Tailwind color classes for each history item type. */
const TYPE_COLOR: Record<HistoryItem['type'], string> = {
  trade_bought: 'text-green-600',
  trade_sold:   'text-blue-600',
  redemption:   'text-orange-500',
}

/**
 * Render the history page. Shows loading skeletons while fetching, an empty
 * state if no history exists, and a list of HistoryCard components otherwise.
 */
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

/**
 * Single history row card. Displays the event type (color-coded), swipe count,
 * total price (if applicable), shortened tx hash, and a formatted timestamp.
 */
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

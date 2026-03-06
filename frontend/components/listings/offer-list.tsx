'use client'

import { useAccount } from 'wagmi'
import { useMarketOffers, type OnChainOffer } from '@/hooks/use-market-offers'
import { AcceptOfferModal } from '@/components/listings/accept-offer-modal'
import { CancelOfferModal } from '@/components/listings/cancel-offer-modal'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const toUSDCDisplay = (raw: bigint) => `$${(Number(raw) / 1_000_000).toFixed(2)}`
const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

interface Props {
  type: 'ask' | 'bid'
}

export function OfferList({ type }: Props) {
  const { address } = useAccount()
  const { asks, bids, isLoading, refetch } = useMarketOffers()
  const offers = type === 'ask' ? asks : bids

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (offers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No {type === 'ask' ? 'ask' : 'bid'} offers yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <OfferCard
          key={offer.offerId.toString()}
          offer={offer}
          isOwn={address?.toLowerCase() === offer.creator.toLowerCase()}
          onAccepted={refetch}
        />
      ))}
    </div>
  )
}

function OfferCard({
  offer,
  isOwn,
  onAccepted,
}: {
  offer: OnChainOffer
  isOwn: boolean
  onAccepted: () => void
}) {
  const totalUsdc = offer.swipeCount * offer.pricePerSwipe
  const expiry = new Date(Number(offer.expiresAt) * 1000).toLocaleDateString()
  const count = Number(offer.swipeCount)

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="space-y-1 text-sm">
          <p className="font-semibold">
            {count} swipe{count !== 1 ? 's' : ''} &mdash; {toUSDCDisplay(offer.pricePerSwipe)}/swipe
          </p>
          <p className="text-muted-foreground">Total: {toUSDCDisplay(totalUsdc)}</p>
          <p className="text-muted-foreground text-xs">
            From {truncate(offer.creator)} &bull; Expires {expiry}
          </p>
        </div>
        <div className="ml-4 shrink-0">
          {isOwn ? (
            <CancelOfferModal offer={offer} onCancelled={onAccepted} />
          ) : (
            <AcceptOfferModal offer={offer} onAccepted={onAccepted} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

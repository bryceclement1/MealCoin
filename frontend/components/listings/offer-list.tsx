/**
 * Offer list component — renders a filterable, sortable list of ask or bid offers.
 *
 * Fetches data from the Supabase-backed API via SWR (refreshes every 15s).
 * Applies client-side filtering and sorting on top of the API results so users
 * can narrow down without additional round-trips.
 *
 * Each offer card shows the owner a Cancel button and all other users an Accept button.
 * Ownership is determined by comparing the connected smart account address to the
 * offer's seller_address.
 */

'use client'

import { useSmartAccount } from '@/contexts/SmartAccountContext'
import { useAsks, useBids } from '@/hooks/use-offers'
import { type Offer } from '@/lib/api'
import { AcceptOfferModal } from '@/components/listings/accept-offer-modal'
import { CancelOfferModal } from '@/components/listings/cancel-offer-modal'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type OfferFilters } from '@/components/listings/filter-box'

/** Shorten an address to "0x1234...abcd" for display in offer cards. */
const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

/**
 * Filter offers by the user-selected max swipe count and max price.
 * Empty string values for maxSwipes or maxPrice mean "no limit".
 */
function applyFilters(offers: Offer[], filters: OfferFilters): Offer[] {
  return offers.filter((offer) => {
    if (filters.maxSwipes !== '' && offer.swipe_count > filters.maxSwipes) return false
    if (filters.maxPrice !== '' && offer.price_per_swipe > Number(filters.maxPrice)) return false
    return true
  })
}

/**
 * Sort offers by the user-selected sort order.
 * Returns a new array (does not mutate the input).
 */
function applySortOrder(offers: Offer[], sortOrder: OfferFilters['sortOrder']): Offer[] {
  return [...offers].sort((a, b) =>
    sortOrder === 'price_asc'
      ? a.price_per_swipe - b.price_per_swipe
      : b.swipe_count - a.swipe_count
  )
}

/** Return true if any filter is currently active (used to show/hide empty state messages). */
function hasActiveFilters(filters: OfferFilters): boolean {
  return filters.maxSwipes !== '' || filters.maxPrice !== ''
}

interface Props {
  type: 'ask' | 'bid'
  filters: OfferFilters
}

/**
 * Fetch and render a filtered, sorted list of offers of the given type.
 * Shows loading skeletons while data is in flight and an empty state message
 * when no offers match (with different wording for filtered vs. truly empty).
 */
export function OfferList({ type, filters }: Props) {
  const { smartAddress: address } = useSmartAccount()
  const asksResult = useAsks()
  const bidsResult = useBids()

  const isLoading = type === 'ask' ? asksResult.isLoading : bidsResult.isLoading
  const mutate = type === 'ask' ? asksResult.mutate : bidsResult.mutate

  const rawOffers: Offer[] =
    type === 'ask'
      ? (asksResult.data?.asks ?? [])
      : (bidsResult.data?.bids ?? [])

  // Inject the type field (not returned by the API for combined endpoints)
  const allOffers: Offer[] = rawOffers.map((o) => ({ ...o, type }))
  const offers = applySortOrder(applyFilters(allOffers, filters), filters.sortOrder)

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
    const filtersActive = hasActiveFilters(filters)
    return (
      <p className="text-muted-foreground text-sm">
        {filtersActive && allOffers.length > 0
          ? 'No offers match the current filters.'
          : `No ${type === 'ask' ? 'ask' : 'bid'} offers yet.`}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <OfferCard
          key={offer.offer_id}
          offer={offer}
          isOwn={address?.toLowerCase() === offer.seller_address.toLowerCase()}
          onDone={() => mutate()}
        />
      ))}
    </div>
  )
}

/**
 * Individual offer card. Shows price, swipe count, total, seller address, and expiry.
 * Renders a Cancel button if this offer belongs to the connected wallet, or an
 * Accept button for all other offers. Calls onDone() after a successful action
 * to trigger a data refresh.
 */
function OfferCard({
  offer,
  isOwn,
  onDone,
}: {
  offer: Offer
  isOwn: boolean
  onDone: () => void
}) {
  const total = (offer.swipe_count * offer.price_per_swipe).toFixed(2)
  const expiry = new Date(offer.expires_at).toLocaleDateString()

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="space-y-1 text-sm">
          <p className="font-semibold">
            {offer.swipe_count} swipe{offer.swipe_count !== 1 ? 's' : ''} &mdash; ${offer.price_per_swipe.toFixed(2)}/swipe
          </p>
          <p className="text-muted-foreground">Total: ${total}</p>
          <p className="text-muted-foreground text-xs">
            From {truncate(offer.seller_address)} &bull; Expires {expiry}
          </p>
        </div>
        <div className="ml-4 shrink-0">
          {isOwn ? (
            <CancelOfferModal offer={offer} onCancelled={onDone} />
          ) : (
            <AcceptOfferModal offer={offer} onAccepted={onDone} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

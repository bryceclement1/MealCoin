/**
 * Client-side listings page content.
 *
 * Manages the shared filter state and renders the FilterBox and two OfferList
 * sections (asks and bids) side-by-side. Marked 'use client' so filter state
 * changes trigger re-renders without a full page reload.
 */

'use client'

import { useState } from 'react'
import { FilterBox, DEFAULT_FILTERS, type OfferFilters } from '@/components/listings/filter-box'
import { OfferList } from '@/components/listings/offer-list'

/**
 * Render the filter panel and both offer lists.
 * Filter state is lifted here so FilterBox and both OfferLists share the same filters.
 */
export function ListingsClient() {
  const [filters, setFilters] = useState<OfferFilters>(DEFAULT_FILTERS)

  return (
    <>
      <FilterBox filters={filters} onChange={setFilters} />
      <div className="mt-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Asks (Selling)</h2>
          <OfferList type="ask" filters={filters} />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3">Bids (Buying)</h2>
          <OfferList type="bid" filters={filters} />
        </section>
      </div>
    </>
  )
}

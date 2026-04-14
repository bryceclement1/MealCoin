/**
 * Listings page — the main marketplace view.
 *
 * Displays all active ask (sell) and bid (buy) offers from Supabase, with
 * filter and sort controls. The "Post Offer" button opens a modal for creating
 * a new offer. Offer data refreshes automatically every 15 seconds via SWR.
 *
 * The page component itself is a server component — the client-side data
 * fetching and interactivity lives inside ListingsClient.
 */

import { CreateOfferModal } from '@/components/listings/create-offer-modal'
import { ListingsClient } from '@/components/listings/listings-client'

export default function ListingsPage() {
  return (
    <main className="container mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Offer Listings</h1>
        <CreateOfferModal />
      </div>
      <div className="mt-6">
        <ListingsClient />
      </div>
    </main>
  )
}

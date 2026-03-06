import { CreateOfferModal } from '@/components/listings/create-offer-modal'
import { OfferList } from '@/components/listings/offer-list'

export default function ListingsPage() {
  return (
    <main className="container mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Offer Listings</h1>
        <CreateOfferModal />
      </div>

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Asks (Selling)</h2>
          <OfferList type="ask" />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Bids (Buying)</h2>
          <OfferList type="bid" />
        </section>
      </div>
    </main>
  )
}

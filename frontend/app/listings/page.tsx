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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

export const fetcher = (url: string) =>
  fetch(`${API_URL}${url}`).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}`)
    return r.json()
  })

export type Offer = {
  offer_id: number
  type: 'ask' | 'bid'
  creator_address: string
  swipe_count: number
  price_per_swipe: number
  expires_at: string
  status: 'pending' | 'accepted' | 'cancelled' | 'expired'
}

export type Trade = {
  trade_id: string
  offer_id: number
  buyer_address: string
  seller_address: string
  swipe_count: number
  price: number
  tx_hash: string
  traded_at: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

export const fetcher = (url: string) =>
  fetch(`${API_URL}${url}`).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}`)
    return r.json()
  })

export type Offer = {
  offer_id: string           // UUID
  onchain_offer_id: number   // used as arg to acceptOffer / cancelOffer on-chain
  type: 'ask' | 'bid'        // injected from endpoint context in offer-list
  seller_address: string
  swipe_count: number
  price_per_swipe: number    // dollars, e.g. 7.00
  expires_at: string
  tx_hash: string
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

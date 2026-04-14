/**
 * API client utilities and shared TypeScript types.
 *
 * All frontend data-fetching goes through the Next.js API routes (not directly
 * to Supabase), so all reads flow through this fetcher. Types here mirror the
 * shapes returned by those routes and the Supabase schema.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Generic SWR-compatible fetcher. Prepends the optional API base URL and
 * throws on non-2xx responses so SWR puts the hook into an error state.
 */
export const fetcher = (url: string) =>
  fetch(`${API_URL}${url}`).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}`)
    return r.json()
  })

/** A marketplace offer row as returned by /api/asks or /api/bids. */
export type Offer = {
  offer_id: string           // UUID primary key in Supabase
  onchain_offer_id: number   // used as the arg to acceptOffer / cancelOffer on-chain
  type: 'ask' | 'bid'        // injected from the endpoint context in offer-list
  seller_address: string
  swipe_count: number
  price_per_swipe: number    // dollars, e.g. 7.00
  expires_at: string
  tx_hash: string
}

/** A completed trade row as returned by /api/trades. */
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

/**
 * A single entry in a wallet's combined trade + redemption history.
 * Returned by /api/wallet/[address]/history.
 */
export type HistoryItem = {
  type: 'trade_bought' | 'trade_sold' | 'redemption'
  swipe_count: number | null  // null for redemptions (always 1 swipe but not stored)
  price: number | null        // null for redemptions
  tx_hash: string
  timestamp: string
}

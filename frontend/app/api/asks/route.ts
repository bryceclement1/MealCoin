/**
 * GET /api/asks
 *
 * Return all active sell offers (asks) from the marketplace, ordered cheapest first.
 * Only returns offers with status "pending" and an expiry timestamp in the future.
 *
 * This endpoint reads from Supabase (not the blockchain directly), so it reflects
 * the state indexed by the Node.js indexer. Data is typically 5–15 seconds behind
 * the chain.
 *
 * Responses:
 *   200 { asks: Offer[] }    — array of active ask offers, sorted by price ascending
 *   500 { error: string }    — database error
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/** Fetch and return all active sell offers ordered by price ascending. */
export async function GET() {
  const { data, error } = await supabase
    .from('offers')
    .select('offer_id, onchain_offer_id, seller_address, swipe_count, price_per_swipe, expires_at, tx_hash')
    .eq('type', 'ask')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())  // exclude any expired offers not yet cleaned up
    .order('price_per_swipe', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const asks = (data ?? []).map((row) => ({
    offer_id: row.offer_id,
    onchain_offer_id: row.onchain_offer_id,
    seller_address: row.seller_address,
    swipe_count: row.swipe_count,
    price_per_swipe: row.price_per_swipe,
    expires_at: row.expires_at,
    tx_hash: row.tx_hash,
  }))

  return NextResponse.json({ asks })
}

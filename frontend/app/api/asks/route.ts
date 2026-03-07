import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('offers')
    .select('offer_id, onchain_offer_id, seller_address, swipe_count, price_per_swipe, expires_at, tx_hash')
    .eq('type', 'ask')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
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

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateWalletAddress, validationError } from '@/lib/validate'

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')

  if (wallet !== null) {
    if (!validateWalletAddress(wallet)) {
      return validationError('Invalid wallet address', 'wallet')
    }
  }

  let query = supabase
    .from('trades')
    .select('trade_id, offer_id, buyer_address, seller_address, swipe_count, price, tx_hash, traded_at')
    .order('traded_at', { ascending: false })

  if (wallet !== null) {
    const lower = wallet.toLowerCase()
    query = query.or(`buyer_address.eq.${lower},seller_address.eq.${lower}`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const trades = (data ?? []).map((row) => ({
    trade_id: row.trade_id,
    offer_id: row.offer_id,
    buyer_address: row.buyer_address,
    seller_address: row.seller_address,
    swipe_count: row.swipe_count,
    price: row.price,
    tx_hash: row.tx_hash,
    traded_at: row.traded_at,
  }))

  return NextResponse.json({ trades })
}

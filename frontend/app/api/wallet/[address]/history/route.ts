import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateWalletAddress, validationError } from '@/lib/validate'

type HistoryItem = {
  type: 'trade_bought' | 'trade_sold' | 'redemption'
  swipe_count: number | null
  price: number | null
  tx_hash: string
  timestamp: string
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params

  if (!validateWalletAddress(address)) {
    return validationError('Invalid wallet address', 'address')
  }

  const lower = address.toLowerCase()

  const [tradesResult, redemptionsResult] = await Promise.all([
    supabase
      .from('trades')
      .select('buyer_address, seller_address, swipe_count, price, tx_hash, traded_at')
      .or(`buyer_address.eq.${lower},seller_address.eq.${lower}`),
    supabase
      .from('redemptions')
      .select('tx_hash, redeemed_at')
      .eq('wallet_address', lower),
  ])

  if (tradesResult.error) {
    return NextResponse.json({ error: tradesResult.error.message }, { status: 500 })
  }

  if (redemptionsResult.error) {
    return NextResponse.json({ error: redemptionsResult.error.message }, { status: 500 })
  }

  const history: HistoryItem[] = []

  for (const trade of tradesResult.data ?? []) {
    if (trade.buyer_address === lower) {
      history.push({
        type: 'trade_bought',
        swipe_count: trade.swipe_count,
        price: trade.price,
        tx_hash: trade.tx_hash,
        timestamp: trade.traded_at,
      })
    }
    if (trade.seller_address === lower) {
      history.push({
        type: 'trade_sold',
        swipe_count: trade.swipe_count,
        price: trade.price,
        tx_hash: trade.tx_hash,
        timestamp: trade.traded_at,
      })
    }
  }

  for (const redemption of redemptionsResult.data ?? []) {
    history.push({
      type: 'redemption',
      swipe_count: null,
      price: null,
      tx_hash: redemption.tx_hash,
      timestamp: redemption.redeemed_at,
    })
  }

  history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json({ history })
}

/**
 * GET /api/redemptions
 *
 * Return dining redemption records, optionally filtered to a specific wallet.
 * A redemption is recorded when a dining terminal calls redeemSwipe() on-chain,
 * burning one swipe from the student's balance (SwipeRedeemed event).
 *
 * Query params:
 *   wallet (optional) — filter to redemptions for this wallet address
 *
 * Responses:
 *   200 { redemptions: Redemption[] }        — sorted by redeemed_at descending
 *   400 { error: string, field: 'wallet' }   — invalid wallet address format
 *   500 { error: string }                    — database error
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateWalletAddress, validationError } from '@/lib/validate'

/** Fetch redemption records, with an optional wallet filter. */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')

  if (wallet !== null) {
    if (!validateWalletAddress(wallet)) {
      return validationError('Invalid wallet address', 'wallet')
    }
  }

  let query = supabase
    .from('redemptions')
    .select('redemption_id, wallet_address, tx_hash, redeemed_at')
    .order('redeemed_at', { ascending: false })

  if (wallet !== null) {
    query = query.eq('wallet_address', wallet.toLowerCase())
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const redemptions = (data ?? []).map((row) => ({
    redemption_id: row.redemption_id,
    wallet_address: row.wallet_address,
    tx_hash: row.tx_hash,
    redeemed_at: row.redeemed_at,
  }))

  return NextResponse.json({ redemptions })
}

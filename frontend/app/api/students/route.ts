/**
 * GET /api/students?wallet=0x...
 *
 * Check whether a wallet address has a verified @davidson.edu email linked to it.
 * Used by useVerified() and the VerificationGuard to gate access to protected pages.
 *
 * Query params:
 *   wallet (required) — the smart account address to check
 *
 * Responses:
 *   200 { verified: false }                           — wallet not found in students table
 *   200 { verified: true, student: { ... } }          — wallet is verified
 *   400 { error: string, field: 'wallet' }            — invalid address format
 *   500 { error: string }                             — database error
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateWalletAddress, validationError } from '@/lib/validate'

/** Look up a student record by wallet address and return their verification status. */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')

  if (!wallet || !validateWalletAddress(wallet)) {
    return validationError('Invalid wallet address', 'wallet')
  }

  const { data, error } = await supabase
    .from('students')
    .select('wallet_address, davidson_email, verified_at')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ verified: false })
  }

  return NextResponse.json({ verified: true, student: data })
}

/**
 * POST /api/verify
 *
 * Start the email verification flow for a new user.
 * Generates a short-lived verification token, stores it in Supabase, and
 * sends a magic link to the student's @davidson.edu address via Supabase Auth.
 *
 * The link in the email redirects to /api/verify/confirm?token=<uuid>, where
 * server-side validation links the wallet to the email in the students table.
 *
 * Request body:
 *   wallet_address   (string) — the student's smart account address
 *   davidson_email   (string) — must end with @davidson.edu
 *
 * Responses:
 *   200 { success: true, message: string }             — email sent
 *   400 { error: string, field: string }               — validation failure
 *   500 { error: string }                              — DB or email sending failure
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAuth } from '@/lib/supabase'
import { validateWalletAddress, validateDavidsonEmail, validationError } from '@/lib/validate'

/** Validate inputs, create a verification token, and send the magic link email. */
export async function POST(req: NextRequest) {
  const { wallet_address, davidson_email } = await req.json()

  if (!validateWalletAddress(wallet_address)) {
    return validationError('Invalid wallet address', 'wallet_address')
  }

  if (!validateDavidsonEmail(davidson_email)) {
    return validationError('Must be a @davidson.edu email address', 'davidson_email')
  }

  const normalizedWallet = wallet_address.toLowerCase()
  const normalizedEmail = davidson_email.toLowerCase()

  // Generate a UUID token valid for 15 minutes
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error: tokenError } = await supabase
    .from('verification_tokens')
    .insert({ token, wallet_address: normalizedWallet, davidson_email: normalizedEmail, used: false, expires_at: expiresAt })

  if (tokenError) {
    return NextResponse.json({ error: tokenError.message }, { status: 500 })
  }

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

  // Use Supabase Auth to send the email — it has better deliverability for
  // Davidson's Exchange mail filters than a plain SMTP send would.
  // The emailRedirectTo includes our token so the confirm route can verify
  // server-side without needing any browser-side wallet or JS context.
  const { error: otpError } = await supabaseAuth.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${appUrl}/api/verify/confirm?token=${token}`,
    },
  })

  if (otpError) {
    console.error('[verify] Supabase OTP error:', otpError.message, otpError.status)
    return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Verification email sent' })
}

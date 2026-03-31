import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAuth } from '@/lib/supabase'
import { validateWalletAddress, validateDavidsonEmail, validationError } from '@/lib/validate'

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

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error: tokenError } = await supabase
    .from('verification_tokens')
    .insert({ token, wallet_address: normalizedWallet, davidson_email: normalizedEmail, used: false, expires_at: expiresAt })

  if (tokenError) {
    return NextResponse.json({ error: tokenError.message }, { status: 500 })
  }

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

  // Supabase sends the email (good deliverability for Davidson's Exchange filters).
  // emailRedirectTo includes our custom ?token= so the confirm route can verify
  // server-side without any client-side wallet or JS needed.
  const { error: otpError } = await supabaseAuth.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${appUrl}/api/verify/confirm?token=${token}`,
    },
  })

  if (otpError) {
    return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Verification email sent' })
}

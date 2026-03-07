import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAuth } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { wallet_address, davidson_email } = await req.json()

  if (!wallet_address || !davidson_email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  if (!davidson_email.endsWith('@davidson.edu')) {
    return NextResponse.json({ error: 'Must be a @davidson.edu email address' }, { status: 400 })
  }

  const normalizedWallet = wallet_address.toLowerCase()
  const normalizedEmail = davidson_email.toLowerCase()

  // Check if email exists in students table
  const { data: student, error: lookupError } = await supabase
    .from('students')
    .select('davidson_email, wallet_address')
    .eq('davidson_email', normalizedEmail)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  if (!student) {
    return NextResponse.json({ error: 'Email not found in student list' }, { status: 404 })
  }

  if (student.wallet_address) {
    if (student.wallet_address === normalizedWallet) {
      // Idempotent resend — fall through to send another email
    } else {
      return NextResponse.json({ error: 'This email is already linked to another wallet' }, { status: 409 })
    }
  }

  // Check if another student already has this wallet
  const { data: walletConflict } = await supabase
    .from('students')
    .select('davidson_email')
    .eq('wallet_address', normalizedWallet)
    .neq('davidson_email', normalizedEmail)
    .maybeSingle()

  if (walletConflict) {
    return NextResponse.json({ error: 'This wallet is already linked to another account' }, { status: 409 })
  }

  // Generate verification token
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error: tokenError } = await supabase
    .from('verification_tokens')
    .insert({ token, wallet_address: normalizedWallet, davidson_email: normalizedEmail, used: false, expires_at: expiresAt })

  if (tokenError) {
    return NextResponse.json({ error: tokenError.message }, { status: 500 })
  }

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

  const { error: otpError } = await supabaseAuth.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${appUrl}/onboarding/confirm`,
    },
  })

  if (otpError) {
    return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Verification email sent' })
}

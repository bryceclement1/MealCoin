import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateWalletAddress, validateDavidsonEmail, validationError } from '@/lib/validate'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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
  const verifyLink = `${appUrl}/api/verify/confirm?token=${token}`

  const { error: emailError } = await resend.emails.send({
    from: 'MealCoin <onboarding@resend.dev>',
    to: normalizedEmail,
    subject: 'Verify your Davidson email for MealCoin',
    html: `
      <p>Hi,</p>
      <p>Click the link below to verify your Davidson email and activate your MealCoin account.</p>
      <p><a href="${verifyLink}" style="font-size:16px;font-weight:bold">Verify my email</a></p>
      <p>This link expires in 15 minutes.</p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  })

  if (emailError) {
    return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Verification email sent' })
}

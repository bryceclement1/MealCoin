import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validationError } from '@/lib/validate'

function htmlPage(title: string, body: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — MealCoin</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #ededed; }
    .card { max-width: 380px; padding: 2rem; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
    p { color: #a1a1aa; line-height: 1.6; }
    a { color: #ededed; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return validationError('Missing token', 'token')
  }

  const { data: record, error: lookupError } = await supabase
    .from('verification_tokens')
    .select('token, wallet_address, davidson_email, used, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  if (!record) {
    return htmlPage('Invalid link', '<h1>Invalid link</h1><p>This verification link is invalid or has already been used.</p><p><a href="/onboarding">Try again</a></p>')
  }

  if (record.used) {
    return htmlPage('Already verified', '<h1>Already verified</h1><p>This link has already been used. Open the app in your Coinbase Wallet browser.</p>')
  }

  if (new Date(record.expires_at) < new Date()) {
    return htmlPage('Link expired', '<h1>Link expired</h1><p>This verification link has expired. Open the app in your Coinbase Wallet browser and request a new one.</p>')
  }

  const { error: markUsedError } = await supabase
    .from('verification_tokens')
    .update({ used: true })
    .eq('token', token)

  if (markUsedError) {
    return NextResponse.json({ error: markUsedError.message }, { status: 500 })
  }

  // Clear this wallet from any other email it may have been linked to
  const { error: clearError } = await supabase
    .from('students')
    .update({ wallet_address: null, verified_at: null })
    .eq('wallet_address', record.wallet_address)
    .neq('davidson_email', record.davidson_email)

  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 })
  }

  // Upsert — creates new row for first-time users, updates wallet for returning/takeover
  const { error: upsertError } = await supabase
    .from('students')
    .upsert(
      { davidson_email: record.davidson_email, wallet_address: record.wallet_address, verified_at: new Date().toISOString() },
      { onConflict: 'davidson_email' }
    )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return htmlPage(
    'Email verified',
    '<h1>Email verified!</h1><p>Your Davidson email has been linked to your wallet.</p><p>Return to the app in your <strong>Coinbase Wallet browser</strong> and refresh the page.</p>'
  )
}

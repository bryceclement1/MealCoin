import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateDavidsonEmail, validationError } from '@/lib/validate'

export async function POST(req: NextRequest) {
  const { davidson_email } = await req.json()

  if (!validateDavidsonEmail(davidson_email)) {
    return validationError('Must be a @davidson.edu email address', 'davidson_email')
  }

  const normalizedEmail = davidson_email.toLowerCase()

  // Find the most recent unused token for this email
  const { data: record, error: lookupError } = await supabase
    .from('verification_tokens')
    .select('wallet_address, expires_at')
    .eq('davidson_email', normalizedEmail)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  if (!record) {
    return NextResponse.json(
      { error: 'No pending verification found — please request a new link' },
      { status: 400 }
    )
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Verification link has expired — request a new one' },
      { status: 410 }
    )
  }

  // Mark token used
  const { error: markUsedError } = await supabase
    .from('verification_tokens')
    .update({ used: true })
    .eq('davidson_email', normalizedEmail)
    .eq('used', false)

  if (markUsedError) {
    return NextResponse.json({ error: markUsedError.message }, { status: 500 })
  }

  // If this wallet is already linked to a different email, clear it first to
  // avoid a UNIQUE constraint violation on wallet_address.
  const { error: clearError } = await supabase
    .from('students')
    .update({ wallet_address: null, verified_at: null })
    .eq('wallet_address', record.wallet_address)
    .neq('davidson_email', normalizedEmail)

  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 })
  }

  // Upsert on davidson_email — creates a new row for first-time users,
  // or updates wallet_address for existing users (including email takeover).
  const { error: upsertError } = await supabase
    .from('students')
    .upsert(
      { davidson_email: normalizedEmail, wallet_address: record.wallet_address, verified_at: new Date().toISOString() },
      { onConflict: 'davidson_email' }
    )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

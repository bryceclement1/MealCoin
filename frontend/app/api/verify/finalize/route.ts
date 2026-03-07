import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { davidson_email } = await req.json()

  if (!davidson_email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
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

  // Write wallet → email mapping to students
  const { error: updateError } = await supabase
    .from('students')
    .update({ wallet_address: record.wallet_address, verified_at: new Date().toISOString() })
    .eq('davidson_email', normalizedEmail)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

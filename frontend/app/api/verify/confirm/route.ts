import { NextRequest, NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { validationError } from '@/lib/validate'

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
    return NextResponse.json({ error: 'Invalid or already-used verification link' }, { status: 400 })
  }

  if (record.used) {
    return NextResponse.json({ error: 'Invalid or already-used verification link' }, { status: 400 })
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Verification link has expired — request a new one' }, { status: 410 })
  }

  const { error: markUsedError } = await supabase
    .from('verification_tokens')
    .update({ used: true })
    .eq('token', token)

  if (markUsedError) {
    return NextResponse.json({ error: markUsedError.message }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('students')
    .update({ wallet_address: record.wallet_address, verified_at: new Date().toISOString() })
    .eq('davidson_email', record.davidson_email)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  redirect(appUrl + '/')
}

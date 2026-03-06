import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { wallet_address, davidson_email } = await req.json()

  if (!wallet_address || !davidson_email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Check if email exists in students table
  const { data: student, error: lookupError } = await supabase
    .from('students')
    .select('davidson_email, wallet_address')
    .eq('davidson_email', davidson_email.toLowerCase())
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  if (!student) {
    return NextResponse.json({ error: 'Email not found in student list' }, { status: 404 })
  }

  if (student.wallet_address) {
    return NextResponse.json({ error: 'This email is already linked to another wallet' }, { status: 409 })
  }

  // Link wallet to student record
  const { error: updateError } = await supabase
    .from('students')
    .update({
      wallet_address: wallet_address.toLowerCase(),
      verified_at: new Date().toISOString(),
    })
    .eq('davidson_email', davidson_email.toLowerCase())

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

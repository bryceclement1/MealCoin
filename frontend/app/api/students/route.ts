import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 })
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

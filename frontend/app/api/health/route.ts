import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { error } = await supabase
    .from('students')
    .select('davidson_email', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json(
      { status: 'error', message: 'Database unreachable' },
      { status: 503 }
    )
  }

  return NextResponse.json({ status: 'ok' })
}

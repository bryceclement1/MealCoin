/**
 * GET /api/health
 *
 * Liveness check endpoint. Verifies that the API server is running and can
 * reach the Supabase database. Used by Railway and any uptime monitors to
 * detect outages.
 *
 * Uses a lightweight head-only query (no rows returned) to confirm DB connectivity.
 *
 * Responses:
 *   200 { status: 'ok' }                               — API and DB are healthy
 *   503 { status: 'error', message: string }           — DB is unreachable
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/** Ping the database and return the service health status. */
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

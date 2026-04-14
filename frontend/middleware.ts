/**
 * Next.js middleware — adds CORS headers to all API responses.
 *
 * Runs on every request matching /api/*. This allows the frontend (or any
 * authorized external client) to call the API from a browser. The allowed
 * origin defaults to localhost in development and is set via APP_URL in production.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CORS_ORIGIN = process.env.APP_URL ?? 'http://localhost:3000'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/**
 * Intercept all /api/* requests and attach CORS headers to the response.
 * OPTIONS preflight requests are answered immediately with a 204 No Content.
 */
export function middleware(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  const response = NextResponse.next()
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

/** Apply middleware only to API routes. */
export const config = {
  matcher: '/api/:path*',
}

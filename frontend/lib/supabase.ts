/**
 * Supabase client instances for use in Next.js API routes (server-side only).
 *
 * Two clients are needed because they serve different purposes:
 *   - `supabase`     — Service role key. Bypasses RLS for all DB reads/writes.
 *                      Used by every API route to query offers, trades, students, etc.
 *   - `supabaseAuth` — Anon key with implicit auth flow. Used only for sending
 *                      OTP verification emails via Supabase Auth. The implicit
 *                      flow is required because this runs server-side where there
 *                      is no browser storage to hold the PKCE code verifier.
 *
 * Neither client should be imported in client components — all data access
 * from the browser goes through the Next.js API routes.
 */

import { createClient } from '@supabase/supabase-js'

/** Service role client — bypasses RLS, used for all DB reads/writes in API routes. */
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Anon client — used only for sending OTP emails via Supabase Auth. */
export const supabaseAuth = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { flowType: 'implicit' } }
)

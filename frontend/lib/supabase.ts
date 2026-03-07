import { createClient } from '@supabase/supabase-js'

// Service role client — used for all DB reads/writes (bypasses RLS)
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Anon client — used only for sending OTP emails via Supabase Auth.
// Implicit flow because this runs server-side (no browser storage for PKCE verifier).
export const supabaseAuth = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { flowType: 'implicit' } }
)

/**
 * Indexer configuration loaded from environment variables.
 *
 * All required variables are validated at startup — missing values throw
 * immediately rather than failing silently during the first poll cycle.
 *
 * Environment variables:
 *   ALCHEMY_URL          - Base mainnet RPC endpoint (Alchemy HTTPS URL)
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key (bypasses RLS)
 *   TOKEN_ADDRESS        - MealSwipeToken contract address
 *   MARKET_ADDRESS       - Marketplace contract address
 *   PRIVATE_KEY          - Deployer wallet private key (used by expiry cron)
 *   POLL_INTERVAL_MS     - How often to poll for new blocks (default 15000ms)
 *   CHUNK_SIZE           - Max blocks to fetch logs for in a single call (default 500)
 */

import * as dotenv from 'dotenv'
dotenv.config()

export const config = {
  rpcUrl:        required('ALCHEMY_URL'),
  supabaseUrl:   required('SUPABASE_URL'),
  supabaseKey:   required('SUPABASE_SERVICE_KEY'),
  tokenAddress:  required('TOKEN_ADDRESS') as `0x${string}`,
  marketAddress: required('MARKET_ADDRESS') as `0x${string}`,
  privateKey:    required('PRIVATE_KEY'),
  pollInterval:  Number(process.env.POLL_INTERVAL_MS ?? 15000),
  chunkSize:     Number(process.env.CHUNK_SIZE ?? 500),
}

/** Throw at startup if a required environment variable is missing. */
function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

import * as dotenv from 'dotenv'
dotenv.config()

export const config = {
  rpcUrl:        required('ALCHEMY_URL'),
  supabaseUrl:   required('SUPABASE_URL'),
  supabaseKey:   required('SUPABASE_SERVICE_KEY'),
  tokenAddress:  required('TOKEN_ADDRESS') as `0x${string}`,
  marketAddress: required('MARKET_ADDRESS') as `0x${string}`,
  privateKey:    required('PRIVATE_KEY'),
  pollInterval:  Number(process.env.POLL_INTERVAL_MS ?? 5000),
  chunkSize:     Number(process.env.CHUNK_SIZE ?? 500),
}

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

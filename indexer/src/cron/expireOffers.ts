import cron from 'node-cron'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'
import { config } from '../config'
import { withRetry } from '../retry'
import { MARKETPLACE_ABI } from '../../abis/marketplace'

const supabase = createClient(config.supabaseUrl, config.supabaseKey)

async function expireOffers(): Promise<void> {
  const { data, error } = await supabase
    .from('offers')
    .select('onchain_offer_id')
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())

  if (error) {
    console.error('[CRON] Failed to query expired offers:', error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log('[CRON] No expired pending offers found.')
    return
  }

  console.log(`[CRON] Found ${data.length} expired offer(s) to claim.`)

  const account = privateKeyToAccount(config.privateKey as `0x${string}`)

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(config.rpcUrl),
  })

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.rpcUrl),
  })

  const errors: { offerId: number; err: unknown }[] = []

  for (const offer of data) {
    try {
      await withRetry(async () => {
        const hash = await walletClient.writeContract({
          address: config.marketAddress,
          abi: MARKETPLACE_ABI,
          functionName: 'claimExpiredOffer',
          args: [BigInt(offer.onchain_offer_id)],
        })
        await publicClient.waitForTransactionReceipt({ hash })
        console.log(`[CRON] Claimed offerId=${offer.onchain_offer_id} tx=${hash}`)
      }, 3, `claimExpiredOffer(${offer.onchain_offer_id})`)
    } catch (err) {
      errors.push({ offerId: offer.onchain_offer_id, err })
    }
  }

  if (errors.length > 0) {
    console.error(`[CRON] ${errors.length} offer(s) failed to claim:`)
    for (const { offerId, err } of errors) {
      console.error(`  offerId=${offerId}:`, err)
    }
  } else {
    console.log('[CRON] All expired offers claimed successfully.')
  }
}

// 11:56 PM EST every Saturday = 04:56 AM UTC every Sunday
export function registerExpiryCron(): void {
  cron.schedule('56 4 * * 0', async () => {
    console.log('[CRON] Running offer expiry job...')
    await expireOffers()
  })
  console.log('[CRON] Offer expiry job scheduled (04:56 UTC every Sunday).')
}

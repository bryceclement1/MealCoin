import { parseEventLogs } from 'viem'
import { config } from './config'
import { withRetry } from './retry'
import { MARKETPLACE_ABI } from '../abis/marketplace'
import { TOKEN_ABI } from '../abis/token'
import { handleOfferCreated } from './handlers/offerCreated'
import { handleOfferAccepted } from './handlers/offerAccepted'
import { handleOfferCancelled } from './handlers/offerCancelled'
import { handleOfferExpired } from './handlers/offerExpired'
import { handleSwipeRedeemed } from './handlers/swipeRedeemed'
import { handleSwipesBurned } from './handlers/swipesBurned'

// Structural type — avoids mismatch between chain-specific PublicClient and generic PublicClient
interface RpcClient {
  getLogs: (params: { address: `0x${string}` | `0x${string}`[]; fromBlock: bigint; toBlock: bigint }) => Promise<any[]>
}

export async function pollOnce(
  client: RpcClient,
  fromBlock: bigint,
  toBlock: bigint
): Promise<void> {
  // Fetch logs from both contracts in a single getLogs call (saves ~75 CUs per poll)
  const rawLogs = await withRetry(
    () => client.getLogs({ address: [config.marketAddress, config.tokenAddress], fromBlock, toBlock }),
    5, 'combined getLogs'
  )

  // Decode logs for each contract separately so the correct ABI is used
  const marketLogs = parseEventLogs({ abi: MARKETPLACE_ABI, logs: rawLogs })
  const tokenLogs  = parseEventLogs({ abi: TOKEN_ABI,       logs: rawLogs  })

  // Merge and sort by block + log index
  const allLogs = [...marketLogs, ...tokenLogs].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? Number(a.logIndex) - Number(b.logIndex)
      : Number(a.blockNumber) - Number(b.blockNumber)
  )

  let eventCount = 0
  for (const log of allLogs) {
    try {
      switch (log.eventName) {
        case 'OfferCreated':   await handleOfferCreated(log);   break
        case 'OfferAccepted':  await handleOfferAccepted(log);  break
        case 'OfferCancelled': await handleOfferCancelled(log); break
        case 'OfferExpired':   await handleOfferExpired(log);   break
        case 'SwipeRedeemed':  await handleSwipeRedeemed(log);  break
        case 'SwipesBurned':   await handleSwipesBurned(log);   break
        default:               console.log(`[EVENT] ${log.eventName} tx ${log.transactionHash}`)
      }
      eventCount++
    } catch (err) {
      console.error(`[ERROR] Failed to handle ${log.eventName} in tx ${log.transactionHash}:`, err)
    }
  }

  if (eventCount > 0) {
    console.log(`[INFO] Processed ${eventCount} events`)
  }
}

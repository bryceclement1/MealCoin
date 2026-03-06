import { config } from './config'
import { loadLastBlock, saveLastBlock } from './state'
import { pollOnce } from './poller'
import { sleep } from './retry'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(config.rpcUrl),
})

async function main() {
  console.log('[INFO] MealCoin indexer starting...')

  while (true) {
    try {
      const latestBlock = await client.getBlockNumber()
      const fromBlock = (loadLastBlock() ?? latestBlock - 1n) + 1n

      if (fromBlock > latestBlock) {
        await sleep(config.pollInterval)
        continue
      }

      // Warn on large gap
      if (latestBlock - fromBlock > 200n) {
        console.warn(`[WARN] Gap detected: ${latestBlock - fromBlock} blocks behind`)
      }

      // Process in chunks
      for (let start = fromBlock; start <= latestBlock; start += BigInt(config.chunkSize)) {
        const end = start + BigInt(config.chunkSize) - 1n < latestBlock
          ? start + BigInt(config.chunkSize) - 1n
          : latestBlock

        const ts = new Date().toISOString()
        console.log(`[${ts}] Polling block ${start} to ${end}`)

        await pollOnce(client, start, end)
        saveLastBlock(end)
      }
    } catch (err) {
      console.error('[ERROR] Poll loop error:', err)
    }

    await sleep(config.pollInterval)
  }
}

main()

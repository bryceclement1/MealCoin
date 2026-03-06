import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.ALCHEMY_URL),
})

async function main() {
  const block = await client.getBlockNumber()
  console.log(`Connected to Base Sepolia. Latest block: ${block}`)
}

main().catch(console.error)

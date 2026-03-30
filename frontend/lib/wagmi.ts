import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base],
  connectors: [
    // Explicit connector forces eoaOnly mode so the extension popup appears
    // instead of silently failing in smart-wallet mode via EIP-6963 discovery
    coinbaseWallet({ appName: 'MealCoin', preference: { options: 'eoaOnly' } }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
  ssr: true,
})

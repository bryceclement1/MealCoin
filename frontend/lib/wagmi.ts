import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'MealCoin',
      preference: 'smartWalletOnly',
    }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
  ssr: true,
})

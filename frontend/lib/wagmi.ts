/**
 * Wagmi configuration for the MealCoin frontend.
 *
 * Configures wagmi to use Base mainnet with Coinbase Wallet as the sole
 * connector. The app uses EOA-only mode so students connect with their
 * regular Coinbase Wallet key — the smart account (ERC-4337) is then
 * derived from that EOA inside SmartAccountContext.
 */

import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base],
  connectors: [
    // eoaOnly forces the Coinbase Wallet extension popup to appear, rather than
    // silently failing or defaulting to smart-wallet mode via EIP-6963 discovery.
    coinbaseWallet({ appName: 'MealCoin', preference: { options: 'eoaOnly' } }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
  ssr: true,
})

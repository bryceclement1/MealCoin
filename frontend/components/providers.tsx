/**
 * Root provider tree for the MealCoin frontend.
 *
 * Wraps the entire app with three providers in dependency order:
 *   1. WagmiProvider      — wallet connection state (Coinbase Wallet)
 *   2. QueryClientProvider — React Query cache used internally by wagmi hooks
 *   3. SmartAccountProvider — derives and caches the ERC-4337 smart account
 *                             from the connected EOA wallet
 *
 * This component is rendered once in app/layout.tsx and should not be used
 * anywhere else.
 */

'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi'
import { useState } from 'react'
import { SmartAccountProvider } from '@/contexts/SmartAccountContext'

/** Render all global providers around the page tree. */
export function Providers({ children }: { children: React.ReactNode }) {
  // QueryClient is created inside useState so it's stable across re-renders
  // and is not shared between server and client (avoids SSR cache pollution)
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SmartAccountProvider>
          {children}
        </SmartAccountProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

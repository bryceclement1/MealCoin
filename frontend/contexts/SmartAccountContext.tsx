'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { buildKernelClient, type KernelClient } from '@/lib/kernel-client'
import type { Address } from 'viem'

interface SmartAccountState {
  smartAddress: Address | undefined
  kernelClient: KernelClient | undefined
  isLoading: boolean
}

const SmartAccountContext = createContext<SmartAccountState>({
  smartAddress: undefined,
  kernelClient: undefined,
  isLoading: false,
})

export function SmartAccountProvider({ children }: { children: React.ReactNode }) {
  const { address: eoaAddress, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [state, setState] = useState<SmartAccountState>({
    smartAddress: undefined,
    kernelClient: undefined,
    isLoading: false,
  })

  useEffect(() => {
    if (!isConnected || !walletClient || !eoaAddress) {
      setState({ smartAddress: undefined, kernelClient: undefined, isLoading: false })
      return
    }

    // Seed smart address from cache immediately so UI renders without waiting
    const cacheKey = `kernel:${eoaAddress.toLowerCase()}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      setState(s => ({ ...s, smartAddress: cached as Address, isLoading: true }))
    } else {
      setState(s => ({ ...s, isLoading: true }))
    }

    buildKernelClient(walletClient).then(({ kernelClient, smartAddress }) => {
      localStorage.setItem(cacheKey, smartAddress)
      setState({ kernelClient, smartAddress, isLoading: false })
    }).catch((err) => {
      console.error('[SmartAccount] Failed to build kernel client:', err)
      setState({ smartAddress: undefined, kernelClient: undefined, isLoading: false })
    })
  }, [isConnected, walletClient, eoaAddress])

  return (
    <SmartAccountContext.Provider value={state}>
      {children}
    </SmartAccountContext.Provider>
  )
}

export const useSmartAccount = () => useContext(SmartAccountContext)

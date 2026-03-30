# Plan: Migrate to ZeroDev Kernel Smart Wallet (No keys.coinbase.com)

## Goal

Replace the current Coinbase Smart Wallet flow (which redirects users to keys.coinbase.com for wallet
creation) with a self-contained ERC-4337 smart wallet derived from any connected EOA. The user
connects their Coinbase extension (or any wallet) as an EOA, and MealCoin automatically creates or
retrieves a Kernel smart wallet for them — no external site, no redirect.

---

## How It Works

1. User connects their EOA via Coinbase Wallet (extension or mobile) using `eoaOnly` preference
2. The EOA signer is used to instantiate a ZeroDev Kernel smart account client
3. The smart wallet address is **counterfactual** — deterministically computed from the EOA via
   CREATE2, no transaction needed to know the address
4. On the user's first on-chain action (create offer, accept offer, send swipe), the smart wallet
   auto-deploys as part of that UserOp — no separate "create wallet" transaction
5. The smart wallet address (not the EOA) is what gets minted tokens, holds balances, creates offers,
   and is stored in the DB

---

## Architecture After Migration

```
EOA (Coinbase extension) ──signs UserOps──► Kernel Smart Wallet
                                                   │
                            ┌──────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │   Pimlico Bundler   │  (submits UserOps to chain)
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │  Pimlico Paymaster  │  (sponsors gas)
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │  Base Mainnet       │
                 │  MealSwipeToken     │  msg.sender = Kernel wallet address
                 │  Marketplace        │
                 └─────────────────────┘
```

---

## Key Addresses (Already Deployed on Base Mainnet — No New Contracts)

| Contract | Address |
|----------|---------|
| Kernel Factory v2.4 | `0x5de4839a76cf55d0c90e2061ef4386d962E15ae3` |
| ECDSA Validator | `0xd9AB5096a832b9ce79914329DAEE236f8Eea0390` |
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |

MealSwipeToken and Marketplace contracts do **not** change — they use `msg.sender` as usual,
which becomes the Kernel smart wallet address when sending UserOps.

---

## Dependencies to Add

```bash
npm install permissionless @zerodev/sdk @zerodev/ecdsa-validator
```

| Package | Purpose |
|---------|---------|
| `permissionless` | Smart account client primitives, bundler/paymaster transport |
| `@zerodev/sdk` | Kernel account creation, batched `sendTransactions` |
| `@zerodev/ecdsa-validator` | ECDSA root validator (links EOA to Kernel wallet) |

---

## Environment Variables

Add to `frontend/.env.local`:

```
NEXT_PUBLIC_BUNDLER_URL=https://api.pimlico.io/v2/base/rpc?apikey=YOUR_KEY
NEXT_PUBLIC_PAYMASTER_URL=https://api.pimlico.io/v2/base/rpc?apikey=YOUR_KEY
```

The existing `NEXT_PUBLIC_PAYMASTER_URL` (Coinbase CDP) can be replaced with Pimlico's paymaster,
which is compatible with any ERC-4337 smart account including Kernel. Pimlico has a free tier
sufficient for a prototype.

---

## Files to Change

### 1. `frontend/lib/wagmi.ts`

**Change:** Switch Coinbase Wallet preference from `smartWalletOnly` to `eoaOnly`. This makes the
extension connect normally as an EOA without any redirect.

```typescript
// before
coinbaseWallet({
  appName: 'MealCoin',
  preference: 'smartWalletOnly',
})

// after
coinbaseWallet({
  appName: 'MealCoin',
  preference: 'eoaOnly',
})
```

---

### 2. `frontend/components/providers.tsx`

**Change:** Remove `SmartWalletEnforcer` entirely (no longer needed). Add a new
`SmartAccountProvider` context that derives and stores the Kernel smart wallet from the EOA on
connection.

```typescript
'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi'
import { useState } from 'react'
import { SmartAccountProvider } from '@/contexts/SmartAccountContext'

export function Providers({ children }: { children: React.ReactNode }) {
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
```

---

### 3. NEW FILE: `frontend/lib/kernel-client.ts`

**Purpose:** Core utility — creates a ZeroDev Kernel smart account client from a wagmi EOA wallet
client. This is the single place that knows about Kernel, ZeroDev, and Pimlico.

```typescript
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from '@zerodev/sdk'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { KERNEL_V2_4 } from '@zerodev/sdk/constants'
import { createPublicClient, http, type WalletClient } from 'viem'
import { base } from 'viem/chains'
import { walletClientToSmartAccountSigner } from 'permissionless'

const BUNDLER_URL = process.env.NEXT_PUBLIC_BUNDLER_URL!
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL!

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
})

// Given a connected EOA wallet client (from wagmi), return:
// - kernelClient: used to send transactions / UserOps
// - smartAddress: the Kernel wallet address (counterfactual until first tx)
export async function createKernelClient(walletClient: WalletClient) {
  const signer = walletClientToSmartAccountSigner(walletClient)

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    kernelVersion: KERNEL_V2_4,
  })

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    kernelVersion: KERNEL_V2_4,
  })

  const paymasterClient = createZeroDevPaymasterClient({
    chain: base,
    transport: http(PAYMASTER_URL),
  })

  const kernelClient = createKernelAccountClient({
    account,
    chain: base,
    bundlerTransport: http(BUNDLER_URL),
    paymaster: paymasterClient,
  })

  return {
    kernelClient,
    smartAddress: account.address,
  }
}
```

---

### 4. NEW FILE: `frontend/contexts/SmartAccountContext.tsx`

**Purpose:** React context that holds the Kernel client and smart wallet address for the entire app.
Automatically initializes when the EOA connects. Stores the smart address in localStorage so it's
available immediately on subsequent visits (the address is deterministic, so this is always valid).

```typescript
'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { createKernelClient } from '@/lib/kernel-client'
import type { KernelAccountClient } from '@zerodev/sdk'

interface SmartAccountState {
  smartAddress: `0x${string}` | undefined
  kernelClient: KernelAccountClient | undefined
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

    // Check localStorage cache first (address is deterministic — always valid)
    const cached = localStorage.getItem(`kernel:${eoaAddress.toLowerCase()}`)
    if (cached) {
      // Still need the kernelClient, but can show address immediately
      setState(s => ({ ...s, smartAddress: cached as `0x${string}`, isLoading: true }))
    } else {
      setState(s => ({ ...s, isLoading: true }))
    }

    createKernelClient(walletClient).then(({ kernelClient, smartAddress }) => {
      localStorage.setItem(`kernel:${eoaAddress.toLowerCase()}`, smartAddress)
      setState({ kernelClient, smartAddress, isLoading: false })
    }).catch(err => {
      console.error('Failed to create Kernel client:', err)
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
```

---

### 5. NEW FILE: `frontend/hooks/use-smart-address.ts`

**Purpose:** Convenience hook — returns the smart wallet address. All components that currently call
`useAccount().address` to get the user's wallet address should switch to this hook instead.

```typescript
import { useSmartAccount } from '@/contexts/SmartAccountContext'

export function useSmartAddress() {
  const { smartAddress, isLoading } = useSmartAccount()
  return { address: smartAddress, isLoading }
}
```

---

### 6. `frontend/components/dashboard/send-swipe-modal.tsx`

**Change:** Replace `useWriteContract` with `kernelClient.writeContract`. The call is identical in
shape — just the sender changes from the EOA to the Kernel smart wallet.

```typescript
// before
const { writeContract } = useWriteContract()
writeContract({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'transfer',
  args: [recipient, BigInt(count)],
})

// after
const { kernelClient } = useSmartAccount()
await kernelClient.writeContract({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'transfer',
  args: [recipient, BigInt(count)],
})
```

---

### 7. `frontend/components/listings/accept-offer-modal.tsx`

**Change:** Replace `useSendCalls` (EIP-5792, Coinbase-specific) with
`kernelClient.sendTransactions`. ZeroDev's Kernel batches these into a single UserOp automatically.
Remove the Coinbase paymaster capability object — gas is now sponsored by the Pimlico paymaster
configured in `createKernelClient`.

```typescript
// before
const { mutate: sendCalls } = useSendCalls()
sendCalls({
  calls: [
    { to: USDC_ADDRESS, functionName: 'approve', args: [MARKET_ADDRESS, totalUsdc] },
    { to: MARKET_ADDRESS, functionName: 'acceptOffer', args: [BigInt(offer.onchain_offer_id)] },
  ],
  capabilities: { paymasterService: { url: PAYMASTER_URL } },
})

// after
const { kernelClient } = useSmartAccount()
await kernelClient.sendTransactions({
  transactions: [
    { to: USDC_ADDRESS, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [MARKET_ADDRESS, totalUsdc] }) },
    { to: MARKET_ADDRESS, data: encodeFunctionData({ abi: MARKET_ABI, functionName: 'acceptOffer', args: [BigInt(offer.onchain_offer_id)] }) },
  ],
})
```

The same pattern applies to `createSellOffer` and `createBuyOffer` modals if they also do
approve + create in a batch.

---

### 8. `frontend/app/redeem/page.tsx`

**Change:** Same pattern as send-swipe — replace `useWriteContract` with `kernelClient.writeContract`.
The dining terminal operator also connects an EOA and gets a Kernel wallet. That wallet address must
be added to `approvedDining` in the MealSwipeToken contract (owner calls `approveDining(kernelAddress)`).

```typescript
// after
const { kernelClient } = useSmartAccount()
await kernelClient.writeContract({
  address: TOKEN_ADDRESS,
  abi: TOKEN_ABI,
  functionName: 'redeemSwipe',
  args: [studentSmartAddress],
})
```

Note: `studentSmartAddress` here is the student's Kernel wallet address (not their EOA). This is
already correct if the student's smart address was used everywhere else in the system.

---

### 9. `frontend/app/onboarding/page.tsx`

**Change:** Use `useSmartAddress()` instead of `useAccount()` to get the address sent to `/api/verify`.
The smart wallet address (not the EOA) is what gets stored in the `students` table and what all
on-chain interactions use.

```typescript
// before
const { address } = useAccount()

// after
const { address } = useSmartAddress()
```

The rest of the onboarding flow (`/api/verify`, `/api/verify/finalize`) is unchanged.

---

### 10. `frontend/hooks/use-verified.ts`

**Change:** Use `useSmartAddress()` instead of `useAccount().address`.

```typescript
// before
const { address } = useAccount()

// after
const { address } = useSmartAddress()
```

---

### 11. `frontend/components/dashboard/balance-card.tsx` (and any other balance hooks)

**Change:** Any hook that calls `balanceOf(address, week)` must use the smart wallet address.

```typescript
// before
const { address } = useAccount()
useMSTBalance(address)

// after
const { address } = useSmartAddress()
useMSTBalance(address)
```

---

### 12. `frontend/app/page.tsx` (dashboard root)

**Change:** The verification redirect check uses the wallet address. Switch to smart address.

```typescript
// before
const { address } = useAccount()

// after
const { address, isLoading } = useSmartAddress()
// also show a loading state while the Kernel client initializes
```

Add a loading state guard so the app doesn't redirect to `/onboarding` before the smart address
has been computed.

---

## Files With No Changes Required

| File | Reason |
|------|--------|
| `contracts/src/MealSwipeToken.sol` | Uses `msg.sender` — automatically becomes smart wallet address when sending UserOps |
| `contracts/src/Marketplace.sol` | Same |
| `indexer/src/` (all files) | Captures addresses from events — events will contain smart wallet addresses automatically |
| `frontend/app/api/` (all routes) | Address-agnostic queries — work identically with smart wallet addresses |
| `frontend/app/api/verify/route.ts` | Stores whatever address is sent by onboarding |
| Supabase schema | No column type changes needed |

---

## One-Time Admin Action After Migration

The deployer must call `approveDining(diningKernelAddress)` on MealSwipeToken for any dining
terminal wallets, since their smart wallet addresses will have changed from their current EOA
addresses (or from their old Coinbase Smart Wallet addresses).

Similarly, if any test wallets were previously minted tokens at their old addresses, new mints must
go to the new smart wallet addresses.

---

## Migration Order

1. Install dependencies
2. Add env vars (Pimlico API key)
3. Create `kernel-client.ts`
4. Create `SmartAccountContext.tsx`
5. Create `use-smart-address.ts`
6. Update `wagmi.ts` (eoaOnly)
7. Update `providers.tsx` (remove SmartWalletEnforcer, add SmartAccountProvider)
8. Update `onboarding/page.tsx` (useSmartAddress)
9. Update `use-verified.ts` (useSmartAddress)
10. Update `balance-card.tsx` and balance hooks (useSmartAddress)
11. Update `page.tsx` dashboard root (useSmartAddress + loading state)
12. Update `send-swipe-modal.tsx` (kernelClient.writeContract)
13. Update `accept-offer-modal.tsx` (kernelClient.sendTransactions)
14. Update `redeem/page.tsx` (kernelClient.writeContract)
15. Call `approveDining` for dining terminal smart wallet addresses

---

## Testing Checklist

- [ ] Connect Coinbase extension as EOA → smart wallet address is derived, no redirect
- [ ] Smart address shown in UI is consistent across page refreshes (localStorage cache)
- [ ] Balance check uses smart wallet address
- [ ] Onboarding stores smart wallet address in DB
- [ ] Create sell offer succeeds (single UserOp, gas sponsored)
- [ ] Accept offer succeeds (batched approve + acceptOffer in one UserOp)
- [ ] Send swipe succeeds
- [ ] Dining redeem succeeds (dining terminal's smart wallet is in approvedDining)
- [ ] Connecting the same EOA twice gives the same smart wallet address
- [ ] Disconnecting clears smart account state

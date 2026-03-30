# Plan: USDC Balance Display + Coinbase Onramp

## Context
Users need USDC in their Kernel smart wallet to place buy offers. Currently there's no way to see the USDC balance or fund the smart wallet from within the app. This adds a USDC balance card and an "Add Funds" button that opens Coinbase Onramp pre-filled with the user's smart wallet address and USDC on Base.

---

## Step 1: Create USDC balance hook
**File:** `frontend/hooks/use-usdc-balance.ts`

Follow the exact pattern of `use-mst-balance.ts` using `useReadContract` from wagmi:
```ts
export function useUSDCBalance(walletAddress?: `0x${string}`) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress },
  })
}
```
Returns raw balance as `bigint` (6 decimals). Format for display: `(Number(balance) / 1_000_000).toFixed(2)`.

---

## Step 2: Create USDCCard component
**File:** `frontend/components/dashboard/usdc-card.tsx`

New card following the `balance-card.tsx` pattern:
- Uses `useSmartAccount()` for address, `useUSDCBalance(smartAddress)` for balance
- Shows USDC balance formatted as `$X.XX`
- Includes an "Add Funds" button that triggers the Coinbase Onramp flow
- Same loading skeleton + disconnected state pattern as BalanceCard

---

## Step 3: Coinbase Onramp via URL
No SDK needed. Coinbase Onramp supports a URL-based flow:
```
https://pay.coinbase.com/buy/select-asset
  ?appId=YOUR_CDP_APP_ID
  &destinationWallets=[{"address":"0xSMART_WALLET","blockchains":["base"],"assets":["USDC"]}]
```

The "Add Funds" button opens this URL in a new tab (`window.open`). Pre-fills the destination as the user's smart wallet address with USDC on Base pre-selected.

**Env var needed:** `NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID` — get this from [Coinbase Developer Platform](https://portal.cdp.coinbase.com) → your project → Onramp.

---

## Step 4: Update dashboard page
**File:** `frontend/app/page.tsx`

Add `<USDCCard />` to the existing dashboard grid alongside `<BalanceCard />` and `<ExpiryCountdown />`.

---

## Critical Files
- `frontend/hooks/use-usdc-balance.ts` — new file
- `frontend/components/dashboard/usdc-card.tsx` — new file
- `frontend/app/page.tsx` — add USDCCard to grid
- `frontend/lib/contracts.ts` — USDC_ADDRESS + USDC_ABI already defined, reuse
- `frontend/.env.local` — add NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID

---

## Verification
1. Connect wallet on desktop → USDC card shows balance (0.00 if unfunded)
2. Click "Add Funds" → new tab opens at pay.coinbase.com pre-filled with smart wallet address and USDC/Base
3. After funding, refresh app → USDC balance updates
4. Place a buy offer → USDC balance decreases accordingly

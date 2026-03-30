# Base Mainnet + Real USDC + Paymaster Gas Sponsorship

## Overview

MealCoin migrates from Base Sepolia (testnet, MockUSDC) to Base mainnet (real USDC) with Coinbase Smart Wallet and CDP Paymaster so students never need ETH in their wallets to transact.

**Approach:** Coinbase Smart Wallet + Coinbase Developer Platform (CDP) Paymaster. Gas is sponsored by the developer via a funded paymaster pool; students only need USDC.

---

## Deployed Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| MealSwipeToken | `0x32912D61e207282a2E08B56bf92a58ecDf716E92` |
| Marketplace | `0xA030C790F2509C653fd7856092eE758aB8f6b360` |
| USDC (Circle) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

Both contracts are verified on [Basescan](https://basescan.org).

---

## Architecture Changes

### Gas Sponsorship (EIP-4337)
Standard flow: **User → RPC → Mempool** (user pays gas in ETH)
Sponsored flow: **User → Bundler → EntryPoint → CDP Paymaster pays gas**

The user signs a `UserOperation`. The paymaster covers the ETH cost. The user needs zero ETH.

### Wallet
`preference: 'smartWalletOnly'` in the Coinbase Wallet connector forces Coinbase Smart Wallet (an EIP-4337 smart account). This is required for paymaster-sponsored transactions.

### Transaction Batching
The previous 2-step flow (approve tx → wait → action tx → wait) is replaced with a single batched `useWriteContracts` call (EIP-5792). Approve + action execute atomically in one UserOperation. This halves the number of wallet confirmations required.

---

## Files Changed

| File | Change |
|------|--------|
| `contracts/foundry.toml` | Added `base` mainnet RPC + Basescan verification config |
| `contracts/.env` | Added `BASE_RPC_URL` |
| `contracts/script/Deploy.s.sol` | Removed MockUSDC deploy, hardcoded real USDC address |
| `frontend/.env.local` | New contract addresses, chain ID 8453, mainnet RPC, paymaster URL |
| `frontend/lib/wagmi.ts` | Switched to `base` chain, `smartWalletOnly` Coinbase Wallet connector |
| `frontend/lib/contracts.ts` | Replaced MockUSDC ABI import with inline minimal ERC-20 ABI |
| `frontend/components/listings/create-offer-modal.tsx` | `useWriteContracts` batch + paymaster (1-step flow) |
| `frontend/components/listings/accept-offer-modal.tsx` | `useWriteContracts` batch + paymaster (1-step flow) |
| `indexer/src/index.ts` | Chain changed from `baseSepolia` to `base` |
| `indexer/.env` | Mainnet Alchemy URL + new contract addresses |

Files unchanged: `Marketplace.sol`, `MealSwipeToken.sol`, all API routes, Supabase schema, redeem page.

---

## CDP Paymaster

- **Provider:** Coinbase Developer Platform (portal.cdp.coinbase.com)
- **Network:** Base mainnet
- **Whitelisted contracts:** MealSwipeToken + Marketplace
- **Paymaster URL:** stored in `NEXT_PUBLIC_PAYMASTER_URL`
- **Funding:** Developer funds the paymaster pool with ETH; CDP deducts per-transaction gas costs

---

## Student USDC Acquisition

Students need real USDC. Two options (no bridge required):

1. **In-app on-ramp:** Add `@coinbase/onchainkit`'s `<FundButton>` — opens Coinbase's buy flow directly in the app, deposits USDC to the smart wallet with a debit/credit card or Coinbase account.
2. **From Coinbase exchange:** Students send USDC from their Coinbase account to their smart wallet address. Withdrawals to Base are near-instant.

---

## Dining Terminal

The dining terminal uses `DINING_TERMINAL_PRIVATE_KEY` + raw viem calls server-side — unaffected by wagmi/paymaster. Fund the terminal EOA with ~0.01 real ETH on Base mainnet (covers thousands of `redeemSwipe` calls at Base gas prices).

---

## Post-Deploy Admin Checklist

```bash
# Approve dining terminal to call redeemSwipe()
cast send 0x32912D61e207282a2E08B56bf92a58ecDf716E92 \
  "approveDining(address)" <DINING_TERMINAL_ADDR> \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY

# Weekly mint (handled by cron)
cast send 0x32912D61e207282a2E08B56bf92a58ecDf716E92 \
  "mint(address,uint256,uint256)" <STUDENT_ADDR> 6 <WEEK> \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
```

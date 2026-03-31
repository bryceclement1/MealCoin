# MealCoin — Contracts

Solidity smart contracts for MealCoin, written with Foundry and deployed on Base Mainnet.

## What this does

Two contracts power the entire system:

**MealSwipeToken** is an ERC-20-style token where balances are scoped to `(address, weekEpoch)` pairs. One token equals one meal swipe. Decimals are 0. Each week epoch is `block.timestamp / 7 days`, so balances from a prior week are permanently inaccessible once the week rolls over. Only the owner can mint tokens. Only approved dining terminal wallets can call `redeemSwipe()`, which burns one token at the dining hall. The owner can call `burnAll(week)` at the weekly reset to clear all remaining balances.

**Marketplace** is a peer-to-peer escrow contract for buying and selling swipes with USDC. Sellers call `createSellOffer()` — their swipes are transferred into the contract. Buyers call `createBuyOffer()` — their USDC is transferred in. Either side calls `acceptOffer()` to execute the atomic swap. Offers expire at the next Saturday 11:59 PM EST. Business rules (max 6 swipes, max $12/swipe) are enforced on-chain.

## Deployed addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| MealSwipeToken | `0x32912D61e207282a2E08B56bf92a58ecDf716E92` |
| Marketplace | `0xA030C790F2509C653fd7856092eE758aB8f6b360` |
| USDC (Circle) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

## Setup

```bash
cp .env.example .env   # fill in PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY
forge install
```

## Common commands

```bash
forge build                  # compile
forge test                   # run all tests
forge fmt                    # format
forge snapshot               # gas snapshots
```

## Deploy

```bash
source .env
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify
```

## Admin scripts

**Register a dining terminal:**
```bash
TOKEN_ADDRESS=<addr> DINING_ADDRESS=<wallet> \
  forge script script/ApproveDining.s.sol \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
```

**Mint swipes to a student:**
```bash
cast send $TOKEN_ADDRESS \
  "mint(address,uint256,uint256)" \
  <student_wallet> 6 $(cast call $TOKEN_ADDRESS "getCurrentWeek()(uint256)" --rpc-url $BASE_RPC_URL) \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
```

## Structure

```
src/
  MealSwipeToken.sol   ERC-20 swipe token with weekly epochs and dining redemption
  Marketplace.sol      Escrow contract for peer-to-peer swipe trading
  IMealSwipeToken.sol  Interface used by Marketplace
  MockUSDC.sol         Freely mintable ERC-20 for local testing
script/
  Deploy.s.sol         Deploys both contracts
  ApproveDining.s.sol  Registers a dining terminal wallet
test/
  MealSwipeToken.t.sol
  Marketplace.t.sol
```

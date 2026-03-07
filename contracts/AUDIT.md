# MealCoin — Security Audit Checklist

**Scope:** `MealSwipeToken.sol`, `Marketplace.sol`, `MockUSDC.sol`
**Network:** Base Sepolia (testnet prototype)
**Foundry version:** tested with `forge test` — 209 tests, 0 failures
**Audit status:** Internal pre-demo review — no critical issues found

---

## 1. Reentrancy

### Marketplace — `acceptOffer()`

| Check | Result |
|-------|--------|
| Status set to `Accepted` **before** any external call | PASS |
| `paymentToken.transferFrom()` called after effects | PASS |
| `mealSwipeToken.transfer()` called after effects | PASS |

`offer.status = OfferStatus.Accepted` is the first write in `acceptOffer()`. Any reentrant call on the same `offerId` hits `OfferNotPending` immediately. Verified in `test_Integration_CEI_StatusSetBeforeTransfer`.

### Marketplace — `cancelOffer()`

| Check | Result |
|-------|--------|
| Status set to `Cancelled` before asset return | PASS |

`offer.status = OfferStatus.Cancelled` is written before the token or USDC transfer back to the creator.

### Marketplace — `claimExpiredOffer()`

| Check | Result |
|-------|--------|
| Status set to `Expired` before asset return | PASS |

Same CEI pattern. Status is updated before the external transfer.

### MealSwipeToken — `transfer()` / `transferFrom()` / `redeemSwipe()`

No external calls in any of these functions. All writes are to internal mappings. **No reentrancy vector exists.**

---

## 2. Access Control

### `mint()`

| Check | Result |
|-------|--------|
| Reverts if caller is not `owner` | PASS |
| `NotOwner` error thrown on unauthorized call | PASS |
| Verified in `test_Mint_RevertsWhenNotOwner` | PASS |

### `burnAll()`

| Check | Result |
|-------|--------|
| Reverts if caller is not `owner` | PASS |
| `NotOwner` error thrown on unauthorized call | PASS |
| Double-burn reverts with `EpochAlreadyBurned` | PASS |
| Verified in `test_BurnAll_RevertsWhenNotOwner` | PASS |

### `redeemSwipe()`

| Check | Result |
|-------|--------|
| Reverts if caller is not in `approvedDining` mapping | PASS |
| `NotApprovedDining` error thrown | PASS |
| Owner is not automatically an approved dining address | PASS |
| Revokes correctly clear approval | PASS |
| Verified in `test_RedeemSwipe_RevertsWhenNotApprovedDining` | PASS |

### `cancelOffer()`

| Check | Result |
|-------|--------|
| Only the offer creator can cancel | PASS |
| `NotOfferCreator` error thrown on unauthorized cancel | PASS |

### `claimExpiredOffer()`

| Check | Result |
|-------|--------|
| Callable by anyone (intentional keeper pattern) | CONFIRMED |
| Only works on genuinely expired offers (`block.timestamp >= expiresAt`) | PASS |
| Reverts on non-expired offers with `OfferNotYetExpired` | PASS |

---

## 3. Offer Expiry Enforcement

| Check | Result |
|-------|--------|
| `acceptOffer()` reverts with `OfferIsExpired` if `block.timestamp >= expiresAt` | PASS |
| `_getNextSaturdayMidnight()` sets expiry to Saturday **23:55:00** (5-min buffer before burnAll) | CONFIRMED |
| `OfferAlreadyExpired` reverts if offer is created in the Saturday 23:55–midnight window | PASS |
| Expired offer acceptance tested in `test_Integration_ExpiredOffer_AcceptReverts` | PASS |

**Note:** The 5-minute buffer (23:55:00 vs 23:59:59) is intentional. It gives the backend cron job and `burnAll()` time to fire before any offer could theoretically be accepted.

---

## 4. No ETH Can Get Stuck

| Check | Result |
|-------|--------|
| `MealSwipeToken` has no `payable` functions | PASS |
| `MealSwipeToken` has no `receive()` or `fallback()` | PASS |
| `Marketplace` has no `payable` functions | PASS |
| `Marketplace` has no `receive()` or `fallback()` | PASS |
| Contract deployer holds no ETH | CONFIRMED |

No ETH can enter either contract. All value transfer is via ERC-20 tokens.

---

## 5. `burnedWeeks` Gates All Balance Reads and Writes

| Check | Result |
|-------|--------|
| `balanceOf()` returns 0 for burned weeks | PASS |
| `transfer()` reverts with `EpochAlreadyBurned` for burned weeks | PASS |
| `transferFrom()` reverts with `EpochAlreadyBurned` for burned weeks | PASS |
| `redeemSwipe()` reverts with `EpochAlreadyBurned` for burned weeks | PASS |
| `mint()` reverts with `EpochAlreadyBurned` for burned weeks (prevents orphaned tokens) | PASS |
| Post-burnAll marketplace `acceptOffer()` reverts (MST transfer fails) | PASS |
| Verified in `test_Integration_BurnAll_ThenAccept_Reverts` | PASS |

---

## 6. Epoch Computation

| Check | Result |
|-------|--------|
| `transfer()` uses inline `block.timestamp / 7 days` — no stale stored week | PASS |
| `transferFrom()` uses inline `block.timestamp / 7 days` | PASS |
| `redeemSwipe()` uses inline `block.timestamp / 7 days` | PASS |
| `balanceOf()` accepts explicit `week` parameter — no assumption about current week | PASS |
| `getCurrentWeek()` is a pure view helper — never used in transfer logic | CONFIRMED |

---

## 7. Overflow / Underflow

Solidity `^0.8.20` has built-in checked arithmetic. No `unchecked` blocks are used in either contract. No overflow or underflow vectors exist.

---

## 8. Business Rule Enforcement

| Rule | Enforcement | Result |
|------|-------------|--------|
| Max 6 swipes per offer | `createSellOffer` / `createBuyOffer`: `swipeCount > MAX_SWIPES` reverts `InvalidSwipeCount` | PASS |
| Max $12 per swipe | `pricePerSwipe > MAX_PRICE` reverts `PriceExceedsMax` | PASS |
| Max 6 swipes per mint | `amount > 6` reverts `InvalidAmount` in `mint()` | PASS |
| Seller must hold swipes to list | `transferFrom` in `createSellOffer` reverts if balance insufficient | PASS |
| Buyer must hold USDC to bid | `transferFrom` in `createBuyOffer` reverts if balance insufficient | PASS |
| Cannot accept own offer | `msg.sender == offer.creator` check reverts `CannotAcceptOwnOffer` | PASS |
| Allowance checked before escrow | `mealSwipeToken.allowance(msg.sender, address(this)) < swipeCount` reverts | PASS |

---

## 9. MockUSDC

`MockUSDC.mint()` is open to anyone — this is **intentional** for the testnet prototype. No access control is needed because MockUSDC has no real value. This must not be used in a production deployment.

---

## 10. Gas Report Summary

From `forge test --gas-report` (all 209 tests passing):

| Function | Avg Gas | Max Gas |
|----------|---------|---------|
| `MealSwipeToken.mint` | 64,007 | 88,187 |
| `MealSwipeToken.transfer` | 36,400 | 55,398 |
| `MealSwipeToken.transferFrom` | 31,089 | 56,872 |
| `MealSwipeToken.redeemSwipe` | 30,907 | 42,285 |
| `MealSwipeToken.burnAll` | 26,884 | 35,284 |
| `Marketplace.createSellOffer` | 179,910 | 210,618 |
| `Marketplace.createBuyOffer` | 165,318 | 207,561 |
| `Marketplace.acceptOffer` | 94,951 | 135,841 |
| `Marketplace.cancelOffer` | 66,630 | 87,076 |
| `Marketplace.claimExpiredOffer` | 71,398 | 88,621 |

No unexpectedly expensive functions. All well within Base Sepolia block gas limits.

---

## 11. Issues Found and Resolved

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| — | — | No issues found during audit | — |

All checks passed. Contracts are considered demo-ready for the Base Sepolia testnet prototype.

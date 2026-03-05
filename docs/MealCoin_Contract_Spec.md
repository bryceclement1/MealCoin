# MealCoin — Smart Contract Specification

**Language:** Solidity `^0.8.20`  
**Framework:** Foundry  
**Network:** Base Sepolia (testnet)  
**Token Standard:** ERC-20 (modified)  
**Payment Token:** MockUSDC (simulated ERC-20, 6 decimals)

---

## Overview

MealCoin uses two contracts that work together:

1. **MealSwipeToken** — The meal swipe token itself. A modified ERC-20 where balances are scoped to a weekly epoch. Handles minting, transfers, redemption (burning at dining), and the weekly rollover burn.

2. **Marketplace** — An escrow contract that manages buy and sell offers for meal swipes. Holds tokens and payment in escrow until an offer is accepted, cancelled, or expired.

---

## Contract 1: MealSwipeToken

### Purpose

Represents meal swipes as on-chain tokens. Each student's balance is tracked per week — a student with 4 swipes in week 3 has a balance of 4 for `weekEpoch = 3`. When Saturday 11:59pm arrives, all tokens for the current week are burned via `burnAll()`, enforcing the dining system's weekly expiry rule.

---

### Week Epoch

The week epoch is a `uint256` derived from the current block timestamp:

```solidity
uint256 public currentWeek = block.timestamp / 7 days;
```

This produces an incrementing integer (e.g. week 0, week 1, week 2...) that advances every 7 days. All balances, minting, and transfers are scoped to `currentWeek` at the time of the transaction.

> **Note:** In tests, use Foundry's `vm.warp()` to advance `block.timestamp` and simulate week rollovers.

---

### State Variables

| Variable | Type | Visibility | Description |
|----------|------|------------|-------------|
| `owner` | `address` | `public` | Deployer address. Has exclusive rights to mint and manage approved dining addresses. |
| `currentWeek` | `uint256` | `public` | The current week epoch, computed from `block.timestamp / 7 days`. Updated on each epoch-sensitive call. |
| `balances` | `mapping(address => mapping(uint256 => uint256))` | `private` | Maps `(walletAddress, weekEpoch)` → token balance. Core balance store. |
| `allowances` | `mapping(address => mapping(address => uint256))` | `private` | Maps `(owner, spender)` → approved token allowance. Used by `transferFrom`. |
| `approvedDining` | `mapping(address => bool)` | `public` | Addresses approved to call `redeemSwipe()`. Represents dining hall terminals. |
| `totalSupplyByWeek` | `mapping(uint256 => uint256)` | `public` | Total tokens minted for each week epoch. Used for accounting and burn verification. |
| `burnedWeeks` | `mapping(uint256 => bool)` | `public` | Tracks which weeks have been burned. When `true`, `balanceOf` returns 0 for that week. |
| `name` | `string` | `public` | Token name: `"MealSwipeToken"` |
| `symbol` | `string` | `public` | Token symbol: `"MST"` |
| `decimals` | `uint8` | `public` | `0` — meal swipes are whole units, no fractional swipes |

---

### Events

| Event | Parameters | Emitted When |
|-------|-----------|--------------|
| `Transfer` | `address indexed from, address indexed to, uint256 amount, uint256 week` | Any token transfer between addresses |
| `Approval` | `address indexed owner, address indexed spender, uint256 amount` | A spender is approved to transfer tokens on behalf of an owner |
| `Mint` | `address indexed to, uint256 amount, uint256 week` | Tokens are minted to a student's wallet |
| `SwipeRedeemed` | `address indexed wallet, uint256 week` | One swipe is burned at a dining location |
| `SwipesBurned` | `uint256 week, uint256 totalBurned` | All tokens for a week epoch are burned at rollover |
| `DiningApproved` | `address indexed diningAddress` | A new dining address is approved |
| `DiningRevoked` | `address indexed diningAddress` | A dining address approval is revoked |

---

### Errors

Use custom errors (cheaper gas than `require` strings):

| Error | Thrown When |
|-------|------------|
| `NotOwner()` | Caller is not `owner` |
| `NotApprovedDining()` | Caller is not in `approvedDining` |
| `InsufficientBalance()` | Transfer or redeem would exceed the sender's balance for `currentWeek` |
| `InsufficientAllowance()` | `transferFrom` caller has less allowance than the requested amount |
| `InvalidAmount()` | Amount is 0 or exceeds 6 |
| `ZeroAddress()` | A zero address is passed where a real address is required |
| `EpochAlreadyBurned(uint256 week)` | `burnAll()` is called for a week already burned, or `transfer` / `transferFrom` / `redeemSwipe` is called while the current epoch is burned |

---

### Functions

#### `constructor()`
```
constructor()
```
- Sets `owner = msg.sender`
- Sets `name`, `symbol`, `decimals`
- No tokens are minted on deployment

---

#### `mint(address to, uint256 amount, uint256 week)`
```
function mint(address to, uint256 amount, uint256 week) external
```
Mints `amount` tokens to `to` for the given `week` epoch. Called by the admin at the start of each week to load students with their 6 weekly swipes.

**Access:** `owner` only
**Reverts:** `NotOwner`, `ZeroAddress` (if `to` is zero address), `InvalidAmount` (if amount is 0 or > 6), `EpochAlreadyBurned` (if `week` has already been burned)

**Logic:**
1. Check `msg.sender == owner`
2. Check `to != address(0)`
3. Check `amount > 0 && amount <= 6`
4. Check `burnedWeeks[week] == false`
5. `balances[to][week] += amount`
6. `totalSupplyByWeek[week] += amount`
7. Emit `Mint(to, amount, week)`

---

#### `transfer(address to, uint256 amount)`
```
function transfer(address to, uint256 amount) external returns (bool)
```
Transfers `amount` tokens from `msg.sender` to `to`, scoped to `currentWeek`. Used for direct peer-to-peer swipe sending (the "Send Swipe to Friend" feature). Returns `true` on success.

**Access:** Any verified student
**Reverts:** `ZeroAddress`, `InvalidAmount` (if amount is 0), `EpochAlreadyBurned`, `InsufficientBalance`

**Logic:**
1. Check `to != address(0)`
2. Check `amount > 0`
3. Compute `week = block.timestamp / 7 days`
4. Check `burnedWeeks[week] == false`
5. Check `balances[msg.sender][week] >= amount`
6. `balances[msg.sender][week] -= amount`
7. `balances[to][week] += amount`
8. Emit `Transfer(msg.sender, to, amount, week)`
9. Return `true`

---

#### `approve(address spender, uint256 amount)`
```
function approve(address spender, uint256 amount) external returns (bool)
```
Approves `spender` to transfer up to `amount` tokens on behalf of `msg.sender`. Required before the Marketplace can escrow a seller's tokens via `transferFrom`. Returns `true` on success.

**Access:** Any address
**Reverts:** none

**Logic:**
1. `allowances[msg.sender][spender] = amount`
2. Emit `Approval(msg.sender, spender, amount)`
3. Return `true`

---

#### `transferFrom(address from, address to, uint256 amount)`
```
function transferFrom(address from, address to, uint256 amount) external returns (bool)
```
Transfers `amount` tokens from `from` to `to` using the caller's allowance, scoped to `currentWeek`. Called by the Marketplace to pull tokens into escrow when a sell offer is created. Returns `true` on success.

**Access:** Any address with sufficient allowance from `from`
**Reverts:** `ZeroAddress`, `InvalidAmount`, `InsufficientAllowance`, `EpochAlreadyBurned`, `InsufficientBalance`

**Logic:**
1. Check `to != address(0)`
2. Check `amount > 0`
3. Check `allowances[from][msg.sender] >= amount`
4. Compute `week = block.timestamp / 7 days`
5. Check `burnedWeeks[week] == false`
6. Check `balances[from][week] >= amount`
7. `allowances[from][msg.sender] -= amount`
8. `balances[from][week] -= amount`
9. `balances[to][week] += amount`
10. Emit `Transfer(from, to, amount, week)`
11. Return `true`

---

#### `allowance(address owner, address spender)`
```
function allowance(address owner, address spender) external view returns (uint256)
```
Returns the remaining number of tokens that `spender` is approved to transfer on behalf of `owner`.

---

#### `redeemSwipe(address wallet)`
```
function redeemSwipe(address wallet) external
```
Burns exactly 1 token from `wallet` for `currentWeek`. Called by an approved dining terminal address when a student pays for a meal.

**Access:** Approved dining addresses only (`approvedDining[msg.sender] == true`)
**Reverts:** `NotApprovedDining`, `ZeroAddress`, `EpochAlreadyBurned`, `InsufficientBalance` (if wallet has 0 swipes)

**Logic:**
1. Check `approvedDining[msg.sender] == true`
2. Check `wallet != address(0)`
3. Compute `week = block.timestamp / 7 days`
4. Check `burnedWeeks[week] == false`
5. Check `balances[wallet][week] >= 1`
6. `balances[wallet][week] -= 1`
7. `totalSupplyByWeek[week] -= 1`
8. Emit `SwipeRedeemed(wallet, week)`

---

#### `burnAll(uint256 week)`
```
function burnAll(uint256 week) external
```
Burns all tokens for the given `week` epoch. Called at Saturday 11:59pm to enforce the weekly expiry. Sets the total supply for that week to 0 and zeroes out all balances indirectly by marking the week as burned.

**Access:** `owner` only  
**Reverts:** `NotOwner`, `EpochAlreadyBurned` (if this week has already been burned)

**Implementation note:** Because iterating over all addresses is not feasible on-chain, the `burnedWeeks` mapping is used. When `burnedWeeks[week] == true`, `balanceOf` short-circuits to 0, and `mint`, `transfer`, `transferFrom`, and `redeemSwipe` all revert with `EpochAlreadyBurned` before touching any balance. Individual `balances` entries are never zeroed by `burnAll` — the burned flag is the single source of truth for expiry.

**Logic:**
1. Check `msg.sender == owner`
2. Check `burnedWeeks[week] == false`
3. Set `burnedWeeks[week] = true`
4. Cache `uint256 total = totalSupplyByWeek[week]`
5. Set `totalSupplyByWeek[week] = 0`
6. Emit `SwipesBurned(week, total)`

---

#### `balanceOf(address wallet, uint256 week)`
```
function balanceOf(address wallet, uint256 week) external view returns (uint256)
```
Returns the token balance for `wallet` in the given `week`. Returns 0 if the week has been burned.

**Logic:**
```solidity
if (burnedWeeks[week]) return 0;
return balances[wallet][week];
```

---

#### `approveDining(address diningAddress)`
```
function approveDining(address diningAddress) external
```
Adds `diningAddress` to the approved dining terminals mapping.

**Access:** `owner` only  
**Reverts:** `NotOwner`, `ZeroAddress`

---

#### `revokeDining(address diningAddress)`
```
function revokeDining(address diningAddress) external
```
Removes `diningAddress` from the approved dining terminals mapping.

**Access:** `owner` only  
**Reverts:** `NotOwner`

---

#### `getCurrentWeek()`
```
function getCurrentWeek() external view returns (uint256)
```
Returns `block.timestamp / 7 days`. Convenience function for the frontend and indexer to know the current epoch without computing it off-chain.

---

### Access Control Summary

| Function | Owner | Approved Dining | Any Address |
|----------|-------|-----------------|-------------|
| `mint` | ✅ | ❌ | ❌ |
| `transfer` | ✅ | ✅ | ✅ |
| `transferFrom` | ✅ | ✅ | ✅ (with allowance) |
| `approve` | ✅ | ✅ | ✅ |
| `redeemSwipe` | ❌ | ✅ | ❌ |
| `burnAll` | ✅ | ❌ | ❌ |
| `approveDining` | ✅ | ❌ | ❌ |
| `revokeDining` | ✅ | ❌ | ❌ |
| `balanceOf` | ✅ | ✅ | ✅ (read-only) |
| `allowance` | ✅ | ✅ | ✅ (read-only) |
| `getCurrentWeek` | ✅ | ✅ | ✅ (read-only) |

---

---

## Contract 2: Marketplace

### Purpose

An escrow contract that facilitates peer-to-peer buying and selling of meal swipes. When a student posts an offer, their assets (tokens or payment) are locked in the contract. When another student accepts, the swap executes atomically. If the offer is cancelled or expires, assets are returned to the creator.

---

### Offer Struct

```solidity
struct Offer {
    uint256 offerId;
    OfferType offerType;      // Ask (sell) or Bid (buy)
    address creator;          // Student who posted the offer
    uint256 swipeCount;       // Number of swipes in the offer (1–6)
    uint256 pricePerSwipe;    // Price in MockUSDC per swipe (max 12 * 1e6)
    uint256 expiresAt;        // Unix timestamp — set to Saturday 23:55:00 of current week (5 min before burnAll)
    OfferStatus status;       // Current state of the offer
}
```

---

### Enums

```solidity
enum OfferType {
    Ask,   // Seller posting swipes for sale
    Bid    // Buyer requesting to purchase swipes
}

enum OfferStatus {
    Pending,    // Active, can be accepted
    Accepted,   // Completed — swap executed
    Cancelled,  // Cancelled by creator — assets returned
    Expired     // Past expiresAt — no longer executable
}
```

---

### State Variables

| Variable | Type | Visibility | Description |
|----------|------|------------|-------------|
| `owner` | `address` | `public` | Deployer address. Admin for emergency functions. |
| `mealSwipeToken` | `IMealSwipeToken` | `public` | Reference to the MealSwipeToken contract |
| `paymentToken` | `IERC20` | `public` | Reference to the MockUSDC payment token |
| `offers` | `mapping(uint256 => Offer)` | `public` | Maps `offerId` → `Offer` struct |
| `offerCount` | `uint256` | `public` | Auto-incrementing counter used to generate offer IDs |
| `MAX_PRICE` | `uint256` | `public constant` | `12 * 1e6` — maximum price per swipe in MockUSDC (6 decimals) |
| `MAX_SWIPES` | `uint256` | `public constant` | `6` — maximum swipes per offer |

---

### Events

| Event | Parameters | Emitted When |
|-------|-----------|--------------|
| `OfferCreated` | `uint256 indexed offerId, address indexed creator, OfferType offerType, uint256 swipeCount, uint256 pricePerSwipe, uint256 expiresAt` | A new offer is posted |
| `OfferAccepted` | `uint256 indexed offerId, address indexed acceptor` | An offer is successfully accepted |
| `OfferCancelled` | `uint256 indexed offerId, address indexed creator` | An offer is cancelled by its creator |
| `OfferExpired` | `uint256 indexed offerId` | An attempt to accept an expired offer is made (optional — can also just revert silently) |

---

### Errors

| Error | Thrown When |
|-------|------------|
| `NotOwner()` | Caller is not `owner` |
| `OfferNotFound(uint256 offerId)` | `offerId` does not exist in the `offers` mapping |
| `OfferNotPending(uint256 offerId)` | Offer status is not `Pending` |
| `OfferIsExpired(uint256 offerId)` | `block.timestamp >= offer.expiresAt` |
| `NotOfferCreator(uint256 offerId)` | Caller is not the offer's `creator` (for cancel) |
| `InvalidSwipeCount()` | `swipeCount` is 0 or > 6 |
| `PriceExceedsMax()` | `pricePerSwipe > MAX_PRICE` |
| `InvalidPrice()` | `pricePerSwipe` is 0 |
| `InsufficientTokenAllowance()` | Token allowance for this contract is insufficient before escrow |
| `CannotAcceptOwnOffer()` | A student attempts to accept their own offer |
| `OfferNotYetExpired(uint256 offerId)` | `claimExpiredOffer()` called before `block.timestamp >= offer.expiresAt` |
| `OfferAlreadyExpired()` | `createSellOffer()`/`createBuyOffer()` called between 23:55:00 and midnight Saturday — `expiresAt` would be in the past |

---

### Functions

#### `constructor(address _mealSwipeToken, address _paymentToken)`
```
constructor(address _mealSwipeToken, address _paymentToken)
```
- Sets `owner = msg.sender`
- Sets `mealSwipeToken` and `paymentToken` contract references
- Sets `offerCount = 0`

---

#### `createSellOffer(uint256 swipeCount, uint256 pricePerSwipe)`
```
function createSellOffer(uint256 swipeCount, uint256 pricePerSwipe) external returns (uint256 offerId)
```
A student lists their meal swipes for sale. Their tokens are transferred into escrow in this contract immediately.

**Access:** Any address
**Reverts:** `InvalidSwipeCount`, `InvalidPrice`, `PriceExceedsMax`, `InsufficientTokenAllowance`, `OfferAlreadyExpired`

**Logic:**
1. Check `swipeCount >= 1 && swipeCount <= MAX_SWIPES`
2. Check `pricePerSwipe > 0`
3. Check `pricePerSwipe <= MAX_PRICE`
4. Check caller has approved this contract to spend at least `swipeCount` tokens via `mealSwipeToken.allowance()`
5. Transfer `swipeCount` tokens from `msg.sender` into this contract: `mealSwipeToken.transferFrom(msg.sender, address(this), swipeCount)`
6. Compute `expiresAt = _getNextSaturdayMidnight()`
7. Check `expiresAt > block.timestamp` — reverts `OfferAlreadyExpired` if called in the 23:55–midnight Saturday buffer window
8. Increment `offerCount`
9. Store `offers[offerCount] = Offer({ offerId: offerCount, offerType: OfferType.Ask, creator: msg.sender, swipeCount, pricePerSwipe, expiresAt, status: OfferStatus.Pending })`
10. Emit `OfferCreated(offerCount, msg.sender, OfferType.Ask, swipeCount, pricePerSwipe, expiresAt)`
11. Return `offerCount`

---

#### `createBuyOffer(uint256 swipeCount, uint256 pricePerSwipe)`
```
function createBuyOffer(uint256 swipeCount, uint256 pricePerSwipe) external returns (uint256 offerId)
```
A student posts a bid to buy meal swipes. Their payment is transferred into escrow immediately.

**Access:** Any address
**Reverts:** `InvalidSwipeCount`, `InvalidPrice`, `PriceExceedsMax`, `InsufficientTokenAllowance`, `OfferAlreadyExpired`

**Logic:**
1. Same validation as `createSellOffer`
2. Compute `totalPayment = swipeCount * pricePerSwipe`
3. Check caller has approved this contract to spend at least `totalPayment` of `paymentToken`
4. Transfer `totalPayment` from `msg.sender` into this contract: `paymentToken.transferFrom(msg.sender, address(this), totalPayment)`
5. Compute `expiresAt = _getNextSaturdayMidnight()`
6. Check `expiresAt > block.timestamp` — reverts `OfferAlreadyExpired` if in the 23:55–midnight buffer window
7. Increment `offerCount`
8. Store offer with `offerType: OfferType.Bid`
9. Emit `OfferCreated(...)`
10. Return `offerCount`

---

#### `acceptOffer(uint256 offerId)`
```
function acceptOffer(uint256 offerId) external
```
Accepts an existing pending offer. Executes the swap atomically — swipes go to the buyer, payment goes to the seller.

**Access:** Any address (except the offer creator)  
**Reverts:** `OfferNotFound`, `OfferNotPending`, `OfferIsExpired`, `CannotAcceptOwnOffer`, `InsufficientTokenAllowance`

**Logic for accepting an Ask (sell offer):**
1. Check offer exists (`offerId > 0 && offerId <= offerCount`)
2. Check `offer.status == Pending`
3. Check `block.timestamp < offer.expiresAt`
4. Check `msg.sender != offer.creator`
5. Compute `totalPayment = offer.swipeCount * offer.pricePerSwipe`
6. Check `msg.sender` has approved this contract to spend `totalPayment` of `paymentToken`
7. Set `offers[offerId].status = OfferStatus.Accepted` **(CEI: state change before external calls)**
8. `paymentToken.transferFrom(msg.sender, offer.creator, totalPayment)` — buyer pays seller directly
9. `mealSwipeToken.transfer(msg.sender, offer.swipeCount)` — market releases escrowed tokens to buyer
10. Emit `OfferAccepted(offerId, msg.sender)`

**Logic for accepting a Bid (buy offer):**
1. Same existence, status, and expiry checks
2. Check `msg.sender != offer.creator`
3. Check `msg.sender` has approved this contract to spend `offer.swipeCount` tokens
4. Set `offers[offerId].status = OfferStatus.Accepted` **(CEI: state change before external calls)**
5. `mealSwipeToken.transferFrom(msg.sender, offer.creator, offer.swipeCount)` — seller provides tokens to buyer
6. `paymentToken.transfer(msg.sender, totalPayment)` — market releases escrowed USDC to seller
7. Emit `OfferAccepted(offerId, msg.sender)`

---

#### `cancelOffer(uint256 offerId)`
```
function cancelOffer(uint256 offerId) external
```
Cancels a pending offer and returns the escrowed assets to the creator.

**Access:** Offer creator only  
**Reverts:** `OfferNotFound`, `OfferNotPending`, `NotOfferCreator`

**Logic (shared for Ask and Bid):**
1. Check offer exists (`offerId > 0 && offerId <= offerCount`)
2. Check `offer.status == Pending`
3. Check `msg.sender == offer.creator`
4. Set `offers[offerId].status = OfferStatus.Cancelled` **(CEI: state change before external calls)**
5. If Ask: `mealSwipeToken.transfer(offer.creator, offer.swipeCount)` — return escrowed tokens
6. If Bid: `paymentToken.transfer(offer.creator, offer.swipeCount * offer.pricePerSwipe)` — return escrowed USDC
7. Emit `OfferCancelled(offerId, msg.sender)`

---

#### `claimExpiredOffer(uint256 offerId)`
```
function claimExpiredOffer(uint256 offerId) external
```
Returns escrowed assets to the creator of an expired offer. Callable by **any address** — not restricted to the creator or owner. This allows an admin keeper script (or any bot) to automatically process expired offers in the 5-minute window between offer expiry (23:55:00) and `burnAll` (23:59:59), so creators receive their tokens back without needing to be online.

**Access:** Any address
**Reverts:** `OfferNotFound`, `OfferNotPending` (if not Pending), `OfferNotYetExpired` (if `block.timestamp < offer.expiresAt`)

**Logic:**
1. Check offer exists
2. Check `offer.status == Pending`
3. Check `block.timestamp >= offer.expiresAt`
4. Set `offer.status = Expired` **(CEI: state change before external calls)**
5. If Ask: `mealSwipeToken.transfer(offer.creator, offer.swipeCount)` — return escrowed tokens
6. If Bid: `paymentToken.transfer(offer.creator, swipeCount * pricePerSwipe)` — return escrowed USDC
7. Emit `OfferExpired(offerId)`

**Weekly lifecycle with this function:**
```
23:55:00  — offers expire (acceptOffer reverts OfferIsExpired)
23:55–23:59  — admin keeper calls claimExpiredOffer on all Pending offers
              — creators receive escrowed assets automatically
23:59:59  — admin calls burnAll; no tokens remain locked in Marketplace
```

---

#### `getOffer(uint256 offerId)`
```
function getOffer(uint256 offerId) external view returns (Offer memory)
```
Returns the full `Offer` struct for a given `offerId`. Reverts with `OfferNotFound` if the ID does not exist.

---

#### `_getNextSaturdayMidnight()`
```
function _getNextSaturdayMidnight() internal view returns (uint256)
```
Private helper. Computes the Unix timestamp of the upcoming Saturday at 23:59:59.

**Logic:**
```solidity
// Unix epoch (Jan 1 1970) started on a Thursday.
// Adding 4 shifts the remainder into standard week numbering: 0=Sun, 1=Mon, ... 6=Sat.
// (6 - dayOfWeek) % 7 gives days until Saturday; 0 if today is already Saturday.
uint256 dayOfWeek = (block.timestamp / 1 days + 4) % 7;
uint256 daysUntilSaturday = (6 - dayOfWeek) % 7;
uint256 startOfSaturday = (block.timestamp / 1 days + daysUntilSaturday) * 1 days;
return startOfSaturday + 86100; // 23:55:00 — 5-minute buffer before burnAll at 23:59:59
```

> **Note:** If called on a Saturday it returns tonight's 23:55:00, which is correct — offers posted on Saturday expire the same night.
>
> **Why 23:55:00 and not 23:59:59?** Offers expire 5 minutes before `burnAll` is called. This gives Ask-offer creators a window to call `cancelOffer` and recover their escrowed MST tokens before `burnAll` marks the epoch burned. After `burnAll`, tokens locked in the Marketplace contract cannot be transferred out (the `EpochAlreadyBurned` guard prevents it), so the 5-minute buffer is the primary protection against permanently locked tokens.

---

### Offer Lifecycle

```
createSellOffer() or createBuyOffer()
        │
        ▼
  status = Pending
  assets held in escrow
        │
        ├──── acceptOffer() ──────► status = Accepted
        │                           assets swapped atomically
        │
        ├──── cancelOffer() ──────► status = Cancelled
        │                           assets returned to creator
        │
        └──── block.timestamp      status stays Pending in DB
              >= expiresAt          but acceptOffer() reverts
                                    with OfferIsExpired
                                    (indexer marks as Expired
                                    after SwipesBurned event)
```

> **Important:** The contract does not automatically change status to `Expired` on-chain. Expiry is enforced by reverting in `acceptOffer()`. The off-chain indexer is responsible for marking offers as `Expired` in the database when the `SwipesBurned` epoch event fires.

---

### Security Considerations

**Reentrancy**
`acceptOffer()` and `cancelOffer()` make external token transfers. Follow the checks-effects-interactions pattern strictly — update `offer.status` before making any external calls to prevent reentrancy attacks.

```solidity
// ✅ Correct order — Ask path
offers[offerId].status = OfferStatus.Accepted;                             // state change first
paymentToken.transferFrom(msg.sender, offer.creator, totalPayment);        // buyer pays seller
mealSwipeToken.transfer(msg.sender, offer.swipeCount);                     // market releases tokens

// ✅ Correct order — Bid path
offers[offerId].status = OfferStatus.Accepted;                             // state change first
mealSwipeToken.transferFrom(msg.sender, offer.creator, offer.swipeCount);  // seller provides tokens
paymentToken.transfer(msg.sender, totalPayment);                           // market releases payment
```

**Price cap enforcement**
The `MAX_PRICE` constant (`12 * 1e6`) is enforced in both `createSellOffer` and `createBuyOffer`. No student can list or bid above $12 per swipe.

**No ETH handling**
The contract should not accept ETH. Do not implement `receive()` or `fallback()` payable functions. All payments are in `paymentToken` (MockUSDC).

**Escrow accounting**
The contract's token balances must always equal the sum of all escrowed assets across pending offers. There are no admin withdrawal functions — assets only leave the contract via `acceptOffer()` or `cancelOffer()`.

---

## MockUSDC (Test Only)

A simple ERC-20 with 6 decimals used as the payment token for the prototype. Not deployed to mainnet.

```solidity
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
```

Mint freely during testing. `1 USDC = 1_000_000` (6 decimals), so `$12 = 12_000_000`.

---

## Interfaces

The Marketplace contract interacts with MealSwipeToken through an interface to avoid circular imports:

```solidity
interface IMealSwipeToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address wallet, uint256 week) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function getCurrentWeek() external view returns (uint256);
}
```

---

## Deployment

### Deploy Command (Base Sepolia)

```bash
forge script script/Deploy.s.sol \
  --rpc-url base_sepolia \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY
```

Required environment variables (in `.env`):
```
PRIVATE_KEY=<owner wallet private key>
BASE_SEPOLIA_RPC_URL=<Alchemy or Infura Base Sepolia URL>
BASESCAN_API_KEY=<from basescan.org — needed for contract verification>
```

### Deployment Order

1. Deploy `MockUSDC`
2. Deploy `MealSwipeToken`
3. Deploy `Marketplace(address(mealSwipeToken), address(mockUSDC))`
4. Record all three addresses — add to backend `.env` and frontend config
5. Call `mealSwipeToken.approveDining(<diningHallTerminalAddress>)` for each physical terminal
6. **Do NOT call `approveDining(address(marketplace))`** — the Marketplace uses `transfer`/`transferFrom`, not `redeemSwipe`, so no dining approval is needed

### Post-Deploy Testnet Setup

```solidity
// Give test students USDC
mockUSDC.mint(studentWallet, 100_000_000); // $100 per student

// Weekly cron handles this, but for immediate testing:
uint256 week = token.getCurrentWeek();
token.mint(studentWallet, 6, week);
```

---

## Foundry Test Checklist

### MealSwipeToken Tests
- [x] `mint()` — admin can mint, non-admin reverts
- [x] `mint()` — amount > 6 reverts, amount 0 reverts, exactly 6 succeeds
- [x] `mint()` — double-mint to same address in same week accumulates balance and `totalSupplyByWeek`
- [x] `mint()` — future week epoch succeeds; past week epoch succeeds
- [x] `mint()` — reverts `EpochAlreadyBurned` if target week has been burned
- [x] `transfer()` — correct balances after transfer
- [x] `transfer()` — reverts if sender balance insufficient
- [x] `transfer()` — self-transfer leaves balance unchanged
- [x] `transfer()` — week-2 call with only week-1 tokens reverts `InsufficientBalance`
- [x] `transfer()` — reverts `EpochAlreadyBurned` if current epoch is burned
- [x] `approve()` — approve 0 succeeds; second approval overwrites first
- [x] `allowance()` — readable after approval
- [x] `transferFrom()` — transfers with exact allowance, leaves allowance at 0
- [x] `transferFrom()` — reverts `InsufficientAllowance` when allowance too low
- [x] `transferFrom()` — reverts `InsufficientBalance` when allowance sufficient but balance low
- [x] `transferFrom()` — allowance persists across weeks; week-2 call reverts `InsufficientBalance`
- [x] `transferFrom()` — reverts `ZeroAddress` for zero `to`; reverts `InsufficientAllowance` for zero `from`
- [x] `transferFrom()` — reverts `EpochAlreadyBurned` if current epoch is burned
- [x] `redeemSwipe()` — approved dining can redeem, others revert
- [x] `redeemSwipe()` — reverts if wallet has 0 balance
- [x] `redeemSwipe()` — exactly 1 swipe drains balance and `totalSupplyByWeek` to 0
- [x] `redeemSwipe()` — revoke after successful redeem prevents further redeems
- [x] `redeemSwipe()` — reverts `EpochAlreadyBurned` if current epoch is burned
- [x] `burnAll()` — `balanceOf` returns 0 for burned week
- [x] `burnAll()` — `SwipesBurned` event emitted with correct total
- [x] `burnAll()` — calling twice on same week reverts with `EpochAlreadyBurned`
- [x] `burnAll()` — empty week (0 supply) and future never-minted week succeed
- [x] `burnAll()` — re-minting into a burned week reverts `EpochAlreadyBurned`
- [x] `burnAll()` — `transfer` and `transferFrom` in the same epoch revert `EpochAlreadyBurned` after burn
- [x] `approveDining()` / `revokeDining()` — access control works correctly
- [x] Full flow: mint → transfer → redeemSwipe → burnAll

### Marketplace Tests
- [x] `_getNextSaturdayMidnight()` — correct result from every day of the week
- [x] `createSellOffer()` — tokens escrowed, `OfferCreated` emitted
- [x] `createSellOffer()` — reverts if swipeCount > 6
- [x] `createSellOffer()` — reverts if price > $12
- [x] `createBuyOffer()` — payment escrowed, `OfferCreated` emitted
- [x] `createBuyOffer()` — reverts if swipeCount > 6
- [x] `createBuyOffer()` — reverts if price > $12
- [x] `acceptOffer()` (Ask) — buyer gets swipes, seller gets payment
- [x] `acceptOffer()` (Ask) — reverts if offer already accepted
- [x] `acceptOffer()` (Ask) — reverts if offer expired (`vm.warp` past `expiresAt`)
- [x] `acceptOffer()` (Ask) — reverts if caller is the offer creator
- [x] `acceptOffer()` (Ask) — reverts without payment allowance
- [x] `acceptOffer()` (Bid) — seller gets payment, buyer gets swipes
- [x] `acceptOffer()` (Bid) — reverts if offer already accepted
- [x] `acceptOffer()` (Bid) — reverts if offer expired
- [x] `acceptOffer()` (Bid) — reverts if caller is the offer creator
- [x] `acceptOffer()` (Bid) — reverts without token allowance
- [x] `cancelOffer()` (Ask) — creator gets escrowed tokens back
- [x] `cancelOffer()` (Bid) — creator gets escrowed payment back
- [x] `cancelOffer()` — non-creator reverts
- [x] `cancelOffer()` — already-cancelled offer reverts with `OfferNotPending`
- [x] `cancelOffer()` — already-accepted offer reverts with `OfferNotPending`
- [x] `cancelOffer()` — expired (but unaccepted) offer can still be cancelled by creator
- [x] `claimExpiredOffer()` — returns tokens to Ask creator; returns USDC to Bid creator
- [x] `claimExpiredOffer()` — callable by anyone, sets status to Expired, emits OfferExpired
- [x] `claimExpiredOffer()` — reverts `OfferNotYetExpired` if called before expiry
- [x] `claimExpiredOffer()` — reverts `OfferNotPending` if already claimed/cancelled/accepted
- [x] `createSellOffer()` / `createBuyOffer()` — revert `OfferAlreadyExpired` in 23:55–midnight Saturday window
- [x] `getOffer()` — returns correct struct, reflects status changes, reverts for invalid ID
- [x] Full flow: mint → createSellOffer → acceptOffer → redeemSwipe → burnAll
- [x] Integration: full Saturday keeper sequence (multiple offers, claim all, burnAll)
- [x] Integration: multi-week rollover (week N and N+1 fully independent)
- [x] Integration: multi-student, mixed offer types, cancels, expirations

---

## Integration Guide for External Systems

This section documents what each system that interacts with the contracts must know and implement correctly.

---

### Backend Cron Job (Owner Wallet)

The backend server holds the owner private key and runs three scheduled jobs.

**Required wallet:** The same wallet can handle all three jobs. It must be the `owner` of `MealSwipeToken` (for `mint` and `burnAll`). `claimExpiredOffer` is permissionless so any wallet works, including the owner wallet.

**Required balance:** Keep at least 0.05 ETH on Base Sepolia in the owner wallet for gas. Replenish from Coinbase wallet as needed.

#### Job 1 — Weekly Mint (Sunday ~00:00)

Runs at the start of each new week epoch.

```
1. Query database: SELECT wallet_address, swipe_count FROM meal_plans WHERE active = true
2. Call token.getCurrentWeek() to get the current epoch
3. For each student: token.mint(walletAddress, swipeCount, currentWeek)
4. Log transaction hashes; update DB with mint_tx_hash and week
```

- `swipeCount` must be 1–6 per call. If a student has 0 swipes this week, skip them.
- If a student's wallet is not yet registered, do not mint — wait until they link their wallet.
- Minting is idempotent per address per week (it accumulates, not overwrites), but avoid double-minting.

#### Job 2 — Offer Expiry Sweep (Saturday 23:55:00)

Fires at exactly Saturday 23:55:00 — the second offers begin expiring.

```
1. Query database: SELECT offer_id FROM offers WHERE status = 'Pending'
2. For each offer_id: marketplace.claimExpiredOffer(offerId)
3. Update DB: SET status = 'Expired', claimed_at = now() WHERE offer_id = ?
4. Log all tx hashes
```

- If the sweep fails mid-way (e.g. RPC error), any unclaimed offer will have its tokens locked after burnAll. Re-run the sweep immediately on failure.
- Any address can call `claimExpiredOffer`, so a backup server or manual retry is always possible.
- Offers accepted or cancelled before 23:55 will revert with `OfferNotPending` — catch and skip these.

#### Job 3 — burnAll (Saturday 23:59:59)

Fires 4 minutes 59 seconds after the sweep. By this point all Pending offers should be claimed.

```
1. Call token.getCurrentWeek() to confirm the week number
2. Call token.burnAll(weekNumber)
3. Log the tx hash; update DB: SET week_burned = true WHERE week = ?
```

- If any Ask offers were missed by the sweep and are still Pending, their escrowed tokens will be permanently locked after this call. Verify the sweep completed before calling burnAll.
- `burnAll` reverts with `EpochAlreadyBurned` if called twice — safe to check `token.burnedWeeks(week)` first.

---

### Database / Indexer

The backend database must stay in sync with on-chain state by indexing contract events.

**Events to index:**

| Contract | Event | Action |
|----------|-------|--------|
| `MealSwipeToken` | `Mint(to, amount, week)` | Record student balance for the week |
| `MealSwipeToken` | `Transfer(from, to, amount, week)` | Update balances for both parties |
| `MealSwipeToken` | `SwipeRedeemed(wallet, week)` | Decrement balance; record dining visit |
| `MealSwipeToken` | `SwipesBurned(week, total)` | Mark week as burned; zero all balances for that week |
| `Marketplace` | `OfferCreated(offerId, creator, type, swipeCount, price, expiresAt)` | Insert offer row with status = Pending |
| `Marketplace` | `OfferAccepted(offerId, acceptor)` | Update offer status = Accepted |
| `Marketplace` | `OfferCancelled(offerId, creator)` | Update offer status = Cancelled |
| `Marketplace` | `OfferExpired(offerId)` | Update offer status = Expired |

**Important:** The offer status in the DB is the source of truth for the frontend, but the on-chain status is authoritative. If they diverge (e.g. a missed event), always trust the on-chain state from `marketplace.getOffer(offerId)`.

**Querying before the Saturday sweep:** before running Job 2, query `WHERE status = 'Pending'` — this gives the list of offer IDs to pass to `claimExpiredOffer`. If the DB is stale, fall back to iterating `offerCount` on-chain and checking each offer's status via `marketplace.getOffer(id)`.

---

### Frontend (User-Facing dApp)

Users connect a Base Sepolia wallet (MetaMask, Coinbase Wallet) and sign transactions client-side.

**Contract addresses** — store in frontend environment config after deployment:
```
NEXT_PUBLIC_TOKEN_ADDRESS=<MealSwipeToken address>
NEXT_PUBLIC_MARKET_ADDRESS=<Marketplace address>
NEXT_PUBLIC_USDC_ADDRESS=<MockUSDC address>
```

**ABIs** — generated by Foundry at compile time:
```
contracts/out/MealSwipeToken.sol/MealSwipeToken.json  → .abi
contracts/out/Marketplace.sol/Marketplace.json        → .abi
contracts/out/MockUSDC.sol/MockUSDC.json              → .abi
```

**Creating a sell offer (two user signatures required):**
```javascript
// 1. Approve market to pull tokens
await token.approve(marketAddress, swipeCount)

// 2. Create the offer
await market.createSellOffer(swipeCount, pricePerSwipe)
```

**Accepting an offer (two user signatures required):**
```javascript
// 1. Approve market to pull USDC
await usdc.approve(marketAddress, swipeCount * pricePerSwipe)

// 2. Accept
await market.acceptOffer(offerId)
```

**Displaying balances:** call `token.balanceOf(walletAddress, currentWeek)` where `currentWeek = Math.floor(Date.now() / 1000 / 604800)`. This can be computed client-side or fetched via `token.getCurrentWeek()`.

**Offer creation window:** do not allow users to create offers between Saturday 23:55:00 and midnight. The contract will revert with `OfferAlreadyExpired`. Show a UI message: *"The marketplace closes at 11:55 PM Saturday for weekly rollover."*

**Week display:** the frontend should show the offer's `expiresAt` field (returned in `OfferCreated` and `getOffer`) as a human-readable deadline: *"Expires Saturday at 11:55 PM"*.

---

### Dining Hall Terminal

Dining hall terminals call `redeemSwipe(studentWallet)` when a student pays for a meal.

- Each terminal address must be pre-approved by the owner via `token.approveDining(terminalAddress)`
- The terminal must NOT be the Marketplace address — the Marketplace uses `transfer`/`transferFrom`, not `redeemSwipe`, and does not require dining approval
- If a student has 0 balance for the current week, `redeemSwipe` reverts with `InsufficientBalance` — the terminal should display an error and deny entry
- If the current epoch is burned (after Saturday 23:59:59), `redeemSwipe` reverts with `EpochAlreadyBurned` — new swipes will be available after the Sunday mint

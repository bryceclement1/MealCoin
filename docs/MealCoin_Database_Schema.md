# MealCoin — Database Schema

**Database:** Supabase (Postgres)  
**Schema:** `public`  
**RLS:** Disabled (prototype — access controlled at API layer)

---

## Tables

### `students`
Stores verified Davidson student records and their mapped wallet addresses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` | Internal row identifier |
| `davidson_email` | `TEXT` | NOT NULL, UNIQUE | Student's `@davidson.edu` email address |
| `wallet_address` | `TEXT` | UNIQUE, nullable | Coinbase Wallet address mapped to this student. Null until verified. |
| `verified_at` | `TIMESTAMPTZ` | nullable | Timestamp of when the wallet was mapped. Null if unverified. |

**Indexes**
- `idx_students_wallet` on `wallet_address` — fast lookup by wallet during auth check

**Notes**
- Seeded at the start of the project with ~20 test Davidson email addresses (`scripts/seed-students.ts`)
- `wallet_address` is stored lowercase for case-insensitive comparison
- A student is considered verified when `wallet_address IS NOT NULL`

---

### `offers`
Stores all buy and sell offers posted to the marketplace. Written exclusively by the indexer when `OfferCreated`, `OfferAccepted`, or `OfferCancelled` events are detected on-chain.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `offer_id` | `UUID` | PK, default `gen_random_uuid()` | Matches the `offerId` emitted by the Marketplace contract |
| `onchain_offer_id` | `BIGINT` | NOT NULL | On-chain offer ID from the Marketplace contract |
| `contract_address` | `TEXT` | NOT NULL | Address of the Marketplace contract that emitted this offer. Part of compound unique key — prevents cross-deployment ID collisions. |
| `type` | `TEXT` | NOT NULL, CHECK `('ask', 'bid')` | `ask` = sell offer, `bid` = buy offer |
| `seller_address` | `TEXT` | NOT NULL | Wallet address of the student who created the offer |
| `swipe_count` | `INTEGER` | NOT NULL, CHECK `(1–6)` | Number of swipes in the offer |
| `price_per_swipe` | `NUMERIC(10,2)` | NOT NULL, CHECK `(> 0 AND <= 12)` | Price in simulated USDC per swipe |
| `status` | `TEXT` | NOT NULL, default `'pending'`, CHECK `('pending', 'accepted', 'cancelled', 'expired')` | Current state of the offer |
| `tx_hash` | `TEXT` | nullable | Transaction hash of the `OfferCreated` event |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `NOW()` | When the offer was indexed |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | Saturday 11:59pm of the current week — set from the contract event |

**Constraints**
- `UNIQUE (onchain_offer_id, contract_address)` — prevents cross-deployment ID collisions when the Marketplace is redeployed

**Indexes**
- `idx_offers_status` on `status` — fast filtering of pending offers
- `idx_offers_seller` on `seller_address` — lookup of a student's own offers
- `idx_offers_expires_at` on `expires_at` — fast filtering of expired offers
- `idx_offers_onchain_id` on `onchain_offer_id` — fast lookup by on-chain ID

**Status transitions**

```
pending → accepted   (OfferAccepted event)
pending → cancelled  (OfferCancelled event)
pending → expired    (SwipesBurned epoch event OR scheduled cron job)
```

**Notes**
- All writes come from the indexer — the API only reads this table
- The `seller_address` column covers both ask and bid types (it represents the offer creator in both cases)
- Rows are upserted by the indexer on `(onchain_offer_id, contract_address)` to ensure re-indexing is idempotent
- `contract_address` is stored lowercase and scopes offers to a specific Marketplace deployment, preventing `created_at` from being preserved across redeployments when offer IDs restart from 1

---

### `trades`
Stores completed trades — inserted by the indexer when an `OfferAccepted` event is detected.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `trade_id` | `UUID` | PK, default `gen_random_uuid()` | Internal row identifier |
| `offer_id` | `UUID` | NOT NULL, FK → `offers.offer_id` | The offer that was accepted |
| `buyer_address` | `TEXT` | NOT NULL | Wallet address of the student who accepted the offer |
| `seller_address` | `TEXT` | NOT NULL | Wallet address of the student who created the offer |
| `swipe_count` | `INTEGER` | NOT NULL | Number of swipes exchanged |
| `price` | `NUMERIC(10,2)` | NOT NULL | Total price paid (price_per_swipe × swipe_count) |
| `tx_hash` | `TEXT` | NOT NULL, UNIQUE | Transaction hash of the `OfferAccepted` event |
| `traded_at` | `TIMESTAMPTZ` | NOT NULL, default `NOW()` | When the trade was indexed |

**Indexes**
- `idx_trades_buyer` on `buyer_address` — lookup of a student's purchase history
- `idx_trades_seller` on `seller_address` — lookup of a student's sale history

**Notes**
- `tx_hash` is UNIQUE and NOT NULL — a trade row can only exist if a real on-chain transaction occurred
- Used by `GET /api/trades` and `GET /api/wallet/:address/history`

---

### `redemptions`
Stores completed meal swipe redemptions at dining locations — inserted by the indexer when a `SwipeRedeemed` event is detected.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `redemption_id` | `UUID` | PK, default `gen_random_uuid()` | Internal row identifier |
| `wallet_address` | `TEXT` | NOT NULL | Wallet address of the student who redeemed the swipe |
| `tx_hash` | `TEXT` | NOT NULL, UNIQUE | Transaction hash of the `SwipeRedeemed` event |
| `redeemed_at` | `TIMESTAMPTZ` | NOT NULL, default `NOW()` | When the redemption was indexed |

**Indexes**
- `idx_redemptions_wallet` on `wallet_address` — lookup of a student's redemption history

**Notes**
- `tx_hash` is UNIQUE — upsert on this column prevents duplicate rows if the indexer re-processes a block
- Used by `GET /api/redemptions` and `GET /api/wallet/:address/history`

---

## SQL

```sql
-- ───────────────────────────────────────────
-- MealCoin Schema
-- ───────────────────────────────────────────

-- 1. Students
CREATE TABLE students (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  davidson_email TEXT NOT NULL UNIQUE,
  wallet_address TEXT UNIQUE,
  verified_at    TIMESTAMPTZ
);

CREATE INDEX idx_students_wallet ON students (wallet_address);

-- 2. Offers
CREATE TABLE offers (
  offer_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onchain_offer_id  BIGINT NOT NULL,
  contract_address  TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('ask', 'bid')),
  seller_address    TEXT NOT NULL,
  swipe_count       INTEGER NOT NULL CHECK (swipe_count BETWEEN 1 AND 6),
  price_per_swipe   NUMERIC(10, 2) NOT NULL CHECK (price_per_swipe > 0 AND price_per_swipe <= 12),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  tx_hash           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  CONSTRAINT offers_onchain_offer_id_contract_address_key UNIQUE (onchain_offer_id, contract_address)
);

CREATE INDEX idx_offers_status     ON offers (status);
CREATE INDEX idx_offers_seller     ON offers (seller_address);
CREATE INDEX idx_offers_expires_at ON offers (expires_at);
CREATE INDEX idx_offers_onchain_id ON offers (onchain_offer_id);

-- 3. Trades
CREATE TABLE trades (
  trade_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id       UUID NOT NULL REFERENCES offers (offer_id),
  buyer_address  TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  swipe_count    INTEGER NOT NULL,
  price          NUMERIC(10, 2) NOT NULL,
  tx_hash        TEXT NOT NULL UNIQUE,
  traded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_buyer  ON trades (buyer_address);
CREATE INDEX idx_trades_seller ON trades (seller_address);

-- 4. Redemptions
CREATE TABLE redemptions (
  redemption_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  tx_hash        TEXT NOT NULL UNIQUE,
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_redemptions_wallet ON redemptions (wallet_address);
```

---

## Entity Relationship Diagram

```
students
  id ─────────────────────────────────────────────────────┐
  davidson_email                                           │
  wallet_address ◄─── used for lookup in all other tables │
  verified_at                                              │
                                                           │
offers                                                     │
  offer_id (PK) ◄──────────────────┐                      │
  onchain_offer_id                 │                       │
  contract_address                 │                       │
  type                             │                       │
  seller_address ◄─────────────────┼───────────────────── ┘
  swipe_count                      │
  price_per_swipe                  │
  status                           │
  tx_hash                          │
  created_at                       │
  expires_at                       │
                                   │
trades                             │
  trade_id (PK)                    │
  offer_id (FK) ───────────────────┘
  buyer_address
  seller_address
  swipe_count
  price
  tx_hash (UNIQUE)
  traded_at

redemptions
  redemption_id (PK)
  wallet_address
  tx_hash (UNIQUE)
  redeemed_at
```

---

## Data Flow

```
On-chain event fires
        │
        ▼
Indexer decodes event via viem
        │
        ├── OfferCreated   ──► upsert into offers (status = pending)
        ├── OfferAccepted  ──► update offers (status = accepted)
        │                      insert into trades
        ├── OfferCancelled ──► update offers (status = cancelled)
        ├── SwipeRedeemed  ──► insert into redemptions
        └── SwipesBurned   ──► update all pending offers (status = expired)
                │
                ▼
        Supabase (Postgres)
                │
                ▼
        Next.js API reads DB
                │
                ▼
        Frontend displays data
```

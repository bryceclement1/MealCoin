# MealCoin — Frontend

Next.js web app for the MealCoin marketplace. Students connect their Coinbase Wallet to buy, sell, send, and redeem meal swipes. All blockchain interactions go through a Kernel smart account (ERC-4337) with gas sponsored by Pimlico, so students never pay gas fees.

## What this does

The frontend has five pages:

**`/` — Dashboard.** Shows the student's current swipe balance and time until the weekly reset. Students can send swipes directly to another wallet or send USDC.

**`/listings` — Marketplace.** Browse active sell and buy offers. Post a new offer (ask or bid) or accept an existing one. All offers are backed by on-chain escrow — a seller cannot list swipes they don't hold.

**`/redeem` — QR code redemption.** Students see a QR code of their wallet address. Dining terminal wallets (registered via `approveDining()` on the contract) see a scanner — they scan the student's QR, confirm the balance, and tap "Redeem Swipe" to burn one swipe on-chain.

**`/onboarding` — Email verification.** New wallets are asked for their `@davidson.edu` email. A verification link is sent; clicking it links the wallet to the email in Supabase. Unverified wallets cannot access the app.

**`/history` — Transaction history.** Combined log of trades (bought and sold) and dining redemptions for the connected wallet.

## Setup

```bash
cp .env.local.example .env.local   # fill in your values
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See `.env.local.example` for the full list. Key groups:

| Group | Variables |
|-------|-----------|
| Contract addresses | `NEXT_PUBLIC_TOKEN_ADDRESS`, `NEXT_PUBLIC_MARKET_ADDRESS`, `NEXT_PUBLIC_USDC_ADDRESS` |
| Chain & RPC | `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL` |
| Smart wallet (Pimlico) | `NEXT_PUBLIC_BUNDLER_URL`, `NEXT_PUBLIC_PAYMASTER_URL` |
| Supabase (server-side only) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| Email | `RESEND_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
| App | `APP_URL` |

## Structure

```
app/
  page.tsx               Dashboard
  listings/              Marketplace
  redeem/                QR redemption (student + dining terminal views)
  onboarding/            Email verification flow
  history/               Trade + redemption log
  api/                   Next.js route handlers (read-only, backed by Supabase)
components/              Shared UI components
contexts/
  SmartAccountContext    Kernel smart account lifecycle and kernelClient hook
lib/
  contracts.ts           Contract addresses and ABIs
  supabase.ts            Supabase client
```

## Deployment

Deployed to Vercel. Set all env vars in the Vercel project dashboard. The `APP_URL` var must point to the live domain for email verification links to work.
